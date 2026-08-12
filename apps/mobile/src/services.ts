import { Platform } from 'react-native'
import * as Crypto from 'expo-crypto'
import {
  createProfile,
  finalizeVoiceCapture,
  loadMemoryTimeline,
  loadProtectedHomeState,
  saveManualMemory,
  saveVoiceMemory,
  type AudioPlayerPort,
  type AudioRecorderPort,
  type CapturedAudio,
  type CreateProfileInput,
  type CreateProfileResult,
  type MediaInspectorPort,
  type MediaStorePort,
  type MemoryRepositoryPort,
  type ProfileRepositoryPort,
  type ProtectedHomeState,
  type RecordingPermissionPort,
  type RecordingPermissionState,
  type SaveManualMemoryInput,
  type SaveManualMemoryResult,
  type SaveVoiceMemoryInput,
  type SaveVoiceMemoryResult,
  type ValidateCapturedAudioResult,
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

export type ProtectedAreaServices = {
  /** Opens and verifies family storage, then returns the protected-area state. */
  bootstrap(date?: Date): Promise<ProtectedHomeState>
  /** Creates the single profile after onboarding consent. */
  createProfile(input: CreateProfileInput, date?: Date): Promise<CreateProfileResult>
  /** Requests microphone permission only after the parent chooses to record. */
  requestRecordingPermission(): Promise<RecordingPermissionState>
  /** Saves a Manual transcript memory when voice capture was unavailable. */
  saveManualMemory(input: SaveManualMemoryInput): Promise<SaveManualMemoryResult>
  /** Loads saved Local-only memories newest first. */
  loadMemoryTimeline(): Promise<MemoryEntryV1[]>
  // --- native voice path (#34) ---
  startRecording(): Promise<void>
  stopRecording(): Promise<CapturedAudio>
  cancelRecording(): Promise<void>
  recordingStatus(): { recording: boolean; durationMs: number }
  subscribeRecording(listener: () => void): () => void
  validateCapturedAudio(captured: CapturedAudio): Promise<ValidateCapturedAudioResult>
  saveVoiceMemory(input: SaveVoiceMemoryInput): Promise<SaveVoiceMemoryResult>
  // --- playback ---
  playMemory(relativePath: string): Promise<void>
  playUri(uri: string): Promise<void>
  pausePlayback(): Promise<void>
  stopPlayback(): Promise<void>
  isPlaying(): boolean
  onPlaybackEnded(listener: () => void): () => void
}

type RepositorySet = {
  profile: ProfileRepositoryPort
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

  // One backup-exclusion policy for the whole family root, shared by the
  // catalog (inside getRepositorySet) and the media store.
  const exclusion: BackupExclusionPort =
    Platform.OS === 'ios' ? createIosBackupExclusion() : createAndroidBackupExclusion()

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
  const mediaStore: MediaStorePort = createExpoMediaStorePort(exclusion)

  return {
    async bootstrap(date = now()) {
      const { profile } = await getRepositorySet()
      return loadProtectedHomeState({ repository: profile }, date)
    },

    async createProfile(input, date = now()) {
      const { profile } = await getRepositorySet()
      return createProfile({ repository: profile, generateId: () => Crypto.randomUUID() }, input, date)
    },

    async requestRecordingPermission() {
      return permission.requestPermission()
    },

    async saveManualMemory(input) {
      const { memory } = await getRepositorySet()
      return saveManualMemory(
        { repository: memory, generateId: () => Crypto.randomUUID() },
        input,
      )
    },

    async loadMemoryTimeline() {
      const { memory } = await getRepositorySet()
      return loadMemoryTimeline({ repository: memory })
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
      return finalizeVoiceCapture({ inspector }, captured)
    },
    async saveVoiceMemory(input) {
      const { memory } = await getRepositorySet()
      return saveVoiceMemory(
        { repository: memory, mediaStore, generateId: () => Crypto.randomUUID() },
        input,
      )
    },
    async playMemory(relativePath) {
      const uri = await mediaStore.resolve(relativePath)
      await player.load(uri)
      await player.play()
    },
    async playUri(uri) {
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