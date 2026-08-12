import { Platform } from 'react-native'
import * as Crypto from 'expo-crypto'
import {
  createProfile,
  finalizeVoiceCapture,
  hardDeleteMemory as deleteLocalMemory,
  loadMemoryTimeline,
  loadProtectedHomeState,
  reconcileSaveOperations,
  resumeFilesystemMigration,
  SaveReconciliationError,
  saveManualMemory,
  saveVoiceMemory,
  type AudioPlayerPort,
  type AudioRecorderPort,
  type CapturedAudio,
  type CreateProfileInput,
  type CreateProfileResult,
  type MediaInspectorPort,
  type MemoryRepositoryPort,
  type ProfileRepositoryPort,
  type ProtectedHomeState,
  type RecordingPermissionPort,
  type RecordingPermissionState,
  type SaveManualMemoryInput,
  type SaveManualMemoryResult,
  type SaveReconciliationResult,
  type SaveVoiceMemoryInput,
  type SaveVoiceMemoryResult,
  StorageGateError,
  type TranscriptionOutcome,
  type UnavailableMemory,
  type UnsavedRecording,
  type ValidateCapturedAudioResult,
} from '@before-they-grow/application'
import {
  createTransientCaptureStore,
  publishInterruptedCapture,
} from '@before-they-grow/application'
import {
  profileDatabaseFileNameV1,
  profileUserVersion,
  type MemoryEntryV1,
} from '@before-they-grow/contracts'
import { createAndroidBackupExclusion, createIosBackupExclusion, type BackupExclusionPort } from './adapters/backupExclusion'
import { createExpoRecordingPermissionPort } from './adapters/expoRecordingPermission'
import { createExpoSqliteProfileClient } from './adapters/expoSqliteClient'
import { createSqliteMemoryRepository } from './adapters/sqliteMemoryRepository'
import { createSqliteProfileRepository } from './adapters/sqliteProfileRepository'
import { createExpoAudioRecorderPort } from './adapters/expoAudioRecorder'
import { createExpoAudioPlayerPort } from './adapters/expoAudioPlayer'
import { createExpoMediaInspectorPort } from './adapters/expoMediaInspector'
import { createExpoMediaStorePort } from './adapters/expoMediaStore'
import { storageLayoutVersion } from './adapters/storageRoot'
import { createExpoTranscriberPort } from './adapters/expoTranscriber'
import { createTranscriptionCoordinator } from '@before-they-grow/application'
import { cleanStaleCaptureCache } from './adapters/expoCacheCleanup'
import { createExpoLifecyclePort } from './adapters/expoLifecycle'

export type ProtectedBootstrapState = ProtectedHomeState & {
  /** Save outcomes resolved before protected content becomes visible. */
  reconciliation?: SaveReconciliationResult[]
  /** Referenced audio that stayed in the catalog but cannot be read. */
  unavailable?: UnavailableMemory[]
}

export type ProtectedAreaServices = {
  /** Opens, reconciles, and verifies family storage before returning state. */
  bootstrap(date?: Date): Promise<ProtectedBootstrapState>
  /** Creates the single profile after onboarding consent. */
  createProfile(input: CreateProfileInput, date?: Date): Promise<CreateProfileResult>
  /** Requests microphone permission only after the parent chooses to record. */
  requestRecordingPermission(): Promise<RecordingPermissionState>
  /** Saves a Manual transcript memory when voice capture was unavailable. */
  saveManualMemory(input: SaveManualMemoryInput): Promise<SaveManualMemoryResult>
  /** Loads saved Local-only memories newest first. */
  loadMemoryTimeline(): Promise<MemoryEntryV1[]>
  /** Irreversible removal of one Local-only memory. */
  hardDeleteMemory(id: string): Promise<'deleted' | 'missing'>
  /** Takes and clears save results reconciled during the last bootstrap. */
  consumeSaveReconciliationNotice(): SaveReconciliationResult[]
  // --- in-process Unsaved recording (survives the App-lock transition) ---
  getUnsavedRecording(): UnsavedRecording | null
  putUnsavedRecording(recording: UnsavedRecording): void
  clearUnsavedRecording(): void
  /** One-time notice that an interrupted capture was not retained. */
  consumeInterruptionNotice(): boolean
  // --- lifecycle ---
  subscribeLifecycle(listener: (state: 'active' | 'inactive' | 'background') => void): () => void
  // --- native voice path (#34) ---
  startRecording(): Promise<void>
  stopRecording(): Promise<CapturedAudio>
  cancelRecording(): Promise<void>
  recordingStatus(): { recording: boolean; durationMs: number }
  subscribeRecording(listener: () => void): () => void
  validateCapturedAudio(captured: CapturedAudio): Promise<ValidateCapturedAudioResult>
  saveVoiceMemory(input: SaveVoiceMemoryInput): Promise<SaveVoiceMemoryResult>
  // --- native transcription (#35) ---
  startTranscription(uri: string): Promise<TranscriptionOutcome>
  cancelTranscription(): Promise<void>
  invalidateTranscription(): void
  // --- playback ---
  playMemory(relativePath: string): Promise<'played' | 'unavailable'>
  playUri(uri: string): Promise<void>
  pausePlayback(): Promise<void>
  stopPlayback(): Promise<void>
  isPlaying(): boolean
  onPlaybackEnded(listener: () => void): () => void
}

type RepositorySet = {
  profile: ProfileRepositoryPort & { consumeUnavailable?: () => UnavailableMemory[] }
  memory: MemoryRepositoryPort
}

/**
 * Composition root. All Expo/native adapters are wired here and only here;
 * screens depend on the application-use-case boundary and never on Expo APIs.
 */
export function createProtectedAreaServices(
  now: () => Date = () => new Date(),
): ProtectedAreaServices {
  let repositorySet: RepositorySet | null = null
  let opening: Promise<RepositorySet> | null = null
  let indeterminateStorage = false
  let reconciliationNotice: SaveReconciliationResult[] = []

  // One backup-exclusion policy for the whole family root, shared by the
  // catalog (inside getRepositorySet) and the media store.
  const exclusion: BackupExclusionPort =
    Platform.OS === 'ios' ? createIosBackupExclusion() : createAndroidBackupExclusion()
  const mediaStore = createExpoMediaStorePort(exclusion)

  const getRepositorySet = (): Promise<RepositorySet> => {
    if (repositorySet) return Promise.resolve(repositorySet)
    if (!opening) {
      opening = (async () => {
        const client = createExpoSqliteProfileClient()
        const profile = createSqliteProfileRepository({
          client,
          exclusion,
          userVersion: profileUserVersion,
          expectedDatabaseFileName: profileDatabaseFileNameV1,
          inventory: mediaStore,
        })
        const memory = createSqliteMemoryRepository(client)
        repositorySet = { profile, memory }
        return repositorySet
      })()
    }
    return opening
  }

  const permission: RecordingPermissionPort = createExpoRecordingPermissionPort()
  const recorder: AudioRecorderPort = createExpoAudioRecorderPort()
  const player: AudioPlayerPort = createExpoAudioPlayerPort()
  const inspector: MediaInspectorPort = createExpoMediaInspectorPort()
  const transcriberPort = createExpoTranscriberPort()
  const transcriber = createTranscriptionCoordinator({ transcriber: transcriberPort })
  const unsaved = createTransientCaptureStore()
  const appLifecycle = createExpoLifecyclePort()
  let cleanedCacheThisProcess = false
  let interruptionNotice = false
  let lastCaptureUri: string | null = null

  const clearUnsaved = () => {
    const current = unsaved.get()
    unsaved.clear()
    const uris = new Set([current?.audio.uri, lastCaptureUri])
    lastCaptureUri = null
    for (const uri of uris) {
      if (uri) void mediaStore.removeCache?.(uri)
    }
  }

  const assertStorageAvailable = () => {
    if (indeterminateStorage) throw new StorageGateError('save-indeterminate')
  }

  // An interrupted-but-valid capture is retained as an in-process Unsaved
  // recording for review after re-authentication, never persisted. A capture
  // that could not be retained (no valid audio, or a prior reviewed answer
  // that must be preserved) raises a one-time "not saved" notice.
  recorder.onInterrupted((captured) => {
    void publishInterruptedCapture({ inspector, store: unsaved }, captured).then((outcome) => {
      if (outcome.kind === 'not-kept') interruptionNotice = true
    })
  })

  return {
    async bootstrap(date = now()) {
      const { profile, memory } = await getRepositorySet()
      try {
        await profile.open()
        // Save-operation reconciliation must run before any removal of
        // staging/cache media, so interrupted saves are recovered rather
        // than deleted as orphans.
        const reconciled = await reconcileSaveOperations({
          repository: memory,
          mediaStore,
          journal: memory.saveJournal,
        })
        reconciliationNotice = reconciled
        if (reconciled.length > 0) {
          // A journaled operation is resolved now; its cache is no longer an
          // immediate retry and must not reappear as an Unsaved candidate.
          clearUnsaved()
        }
        // Recognized stale capture-cache files are cleaned after the catalog
        // validates and journal operations are resolved. An App-lock remount
        // skips this so an in-process Unsaved recording survives.
        if (!cleanedCacheThisProcess) {
          cleanedCacheThisProcess = true
          await cleanStaleCaptureCache()
        }
        await resumeFilesystemMigration(mediaStore, storageLayoutVersion)
        indeterminateStorage = false
        const unavailable = profile.consumeUnavailable?.() ?? []
        const state = await loadProtectedHomeState({ repository: profile }, date)
        return { ...state, reconciliation: reconciled, unavailable }
      } catch (error) {
        if (error instanceof StorageGateError) {
          return { kind: 'storage-blocked', reason: error.reason }
        }
        if (error instanceof SaveReconciliationError) {
          return { kind: 'storage-blocked', reason: 'save-indeterminate' }
        }
        throw error
      }
    },

    consumeInterruptionNotice() {
      const notice = interruptionNotice
      interruptionNotice = false
      return notice
    },

    consumeSaveReconciliationNotice() {
      const notice = reconciliationNotice
      reconciliationNotice = []
      return notice
    },

    getUnsavedRecording() {
      return unsaved.get()
    },
    putUnsavedRecording(recording) {
      const prior = unsaved.get()
      unsaved.put(recording)
      if (prior && prior.audio.uri !== recording.audio.uri) {
        void mediaStore.removeCache?.(prior.audio.uri)
      }
    },
    clearUnsavedRecording() {
      clearUnsaved()
    },
    subscribeLifecycle(listener) {
      return appLifecycle.subscribe(listener)
    },

    async createProfile(input, date = now()) {
      assertStorageAvailable()
      const { profile } = await getRepositorySet()
      return createProfile({ repository: profile, generateId: () => Crypto.randomUUID() }, input, date)
    },

    async requestRecordingPermission() {
      return permission.requestPermission()
    },

    async saveManualMemory(input) {
      assertStorageAvailable()
      const { memory } = await getRepositorySet()
      const result = await saveManualMemory(
        {
          repository: memory,
          generateId: () => Crypto.randomUUID(),
          preflight: mediaStore.preflight ? () => mediaStore.preflight!(1024 * 1024) : undefined,
        },
        input,
      )
      if (result.kind === 'indeterminate') indeterminateStorage = true
      return result
    },

    async loadMemoryTimeline() {
      assertStorageAvailable()
      const { memory } = await getRepositorySet()
      return loadMemoryTimeline({ repository: memory })
    },

    async hardDeleteMemory(id) {
      assertStorageAvailable()
      const { memory } = await getRepositorySet()
      return deleteLocalMemory({ repository: memory, mediaStore }, id)
    },

    async startRecording() {
      await recorder.start()
    },
    async stopRecording() {
      return recorder.stop()
    },
    async cancelRecording() {
      await recorder.cancel()
    },
    recordingStatus() {
      return recorder.getStatus()
    },
    subscribeRecording(listener) {
      return recorder.subscribe(listener)
    },
    async validateCapturedAudio(captured) {
      lastCaptureUri = captured.uri
      return finalizeVoiceCapture({ inspector }, captured)
    },
    async startTranscription(uri) {
      // Availability is verified before any speech permission is requested;
      // an unavailable platform never asks and never starts a recognizer.
      if (!(await transcriberPort.isOnDeviceAvailable())) return { kind: 'unavailable' }
      const permitted = await transcriberPort.requestPermissionIfNeeded()
      if (!permitted) return { kind: 'unavailable' }
      return transcriber.start(uri)
    },
    async cancelTranscription() {
      await transcriber.cancel()
    },
    invalidateTranscription() {
      transcriber.invalidate()
    },
    async saveVoiceMemory(input) {
      assertStorageAvailable()
      const { memory } = await getRepositorySet()
      const result = await saveVoiceMemory(
        { repository: memory, mediaStore, generateId: () => Crypto.randomUUID() },
        input,
      )
      if (result.kind === 'indeterminate') indeterminateStorage = true
      return result
    },
    async playMemory(relativePath) {
      assertStorageAvailable()
      const { memory } = await getRepositorySet()
      const withMedia = await memory.findAllWithMedia()
      const match = withMedia.find((entry) => entry.media?.relativePath === relativePath)
      if (match?.media) {
        const health = await mediaStore.verifyPlayback(relativePath, {
          byteCount: match.media.byteCount,
          sha256: match.media.sha256,
        })
        if (health !== 'ok') return 'unavailable'
      }
      const uri = await mediaStore.resolve(relativePath)
      await player.load(uri)
      await player.play()
      return 'played'
    },
    async playUri(uri) {
      assertStorageAvailable()
      await player.load(uri)
      await player.play()
    },
    async pausePlayback() {
      await player.pause()
    },
    async stopPlayback() {
      await player.stop()
    },
    isPlaying() {
      return player.isPlaying()
    },
    onPlaybackEnded(listener) {
      return player.onEnded(listener)
    },
  }
}