import type {
  ManagedMediaReferenceV1,
  MemoryContentKind,
  MemoryEntryV1,
  PromptSnapshotV1,
} from '@before-they-grow/contracts'
import type { RecordingPermissionState, MemoryRepositoryPort } from './memory'
import { deviceTimeZone, localDateStamp } from './memory'
import {
  reliablySaveMemory,
  type ReliableSaveResult,
  type SaveJournalPort,
  type SaveOperationIdentity,
} from './saveReliability'

/** Capture stops automatically at five minutes. */
export const MAX_CAPTURE_DURATION_MS = 5 * 60 * 1000

/** A capture over 32 MiB is rejected before save. */
export const MAX_CAPTURE_BYTES = 32 * 1024 * 1024

/**
 * A finished, still-cached recording produced by the recorder adapter. It has
 * not been validated yet; byte-count stability and hashing happen in the
 * MediaInspectorPort during finalization.
 */
export type CapturedAudio = {
  uri: string
  durationMs: number
}

/** A recording that passed every validation gate and may be saved. */
export type ValidatedAudio = CapturedAudio & {
  byteCount: number
  sha256: string
}

export type RecorderStatus = {
  recording: boolean
  durationMs: number
}

export type AudioRecorderPort = {
  /** Permission is requested only after the parent chooses to record. */
  requestPermission(): Promise<RecordingPermissionState>
  /** Prepares and starts recording; stops automatically at the policy limit. */
  start(): Promise<void>
  /** Finalizes the recording and returns the cached file for validation. */
  stop(): Promise<CapturedAudio>
  /** Abandons the current recording and releases the microphone. */
  cancel(): Promise<void>
  getStatus(): RecorderStatus
  subscribe(listener: () => void): () => void
  /** Registers a handler for a capture stopped by a lifecycle/audio interruption. */
  onInterrupted(listener: (captured: CapturedAudio) => void): () => void
}

/**
 * Platform-neutral view of a recorded media file: byte count (twice, for
 * stability), SHA-256, decodability, and duration. `readable` is false when
 * the file is missing or its size cannot be read, so an unreadable capture is
 * never misreported as empty.
 */
export type MediaInspectorPort = {
  inspect(uri: string): Promise<{
    readable: boolean
    byteCount: number
    sha256: string
    decodable: boolean
    durationMs: number
    stable: boolean
  }>
}

/**
 * Commits a validated cache file into the canonical, backup-excluded media
 * area at the given opaque relative path (never a family-bearing name). A
 * failure before movement is Not saved; uncertainty after movement is
 * Indeterminate so the journal can reconcile it.
 */
export type MediaStorePort = {
  /** Advisory capacity gate; it must never delete existing family content. */
  preflight?(requiredBytes: number): Promise<void>
  commit(sourceUri: string, relativePath: string): Promise<void>
  /** Rechecks a recognized final resource during bootstrap reconciliation. */
  reconcileFinal?(relativePath: string): Promise<boolean>
  /** Removes a committed file, used to compensate a failed database write. */
  removeFinal(relativePath: string): Promise<void>
  /** Best-effort removal of a cache recording after cancellation or relaunch. */
  removeCache?(uri: string): Promise<void>
  /** Absolute URI for playback of a stored relative path. */
  resolve(relativePath: string): Promise<string>
}

export type AudioPlayerPort = {
  load(uri: string): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  stop(): Promise<void>
  dispose(): void
  isPlaying(): boolean
  durationMs(): number
  positionMs(): number
  onEnded(listener: () => void): () => void
}

export type ValidateCapturedAudioResult =
  | { kind: 'valid'; media: ValidatedAudio }
  | { kind: 'unreadable' }
  | { kind: 'empty' }
  | { kind: 'over-duration'; durationMs: number }
  | { kind: 'over-size'; byteCount: number }
  | { kind: 'not-decodable' }
  | { kind: 'unstable' }

export async function finalizeVoiceCapture(
  deps: { inspector: MediaInspectorPort },
  captured: CapturedAudio,
): Promise<ValidateCapturedAudioResult> {
  const inspected = await deps.inspector.inspect(captured.uri)

  if (!inspected.readable) return { kind: 'unreadable' }
  if (inspected.byteCount === 0) return { kind: 'empty' }
  if (!inspected.stable) return { kind: 'unstable' }
  if (!inspected.decodable) return { kind: 'not-decodable' }
  if (inspected.durationMs > MAX_CAPTURE_DURATION_MS) {
    return { kind: 'over-duration', durationMs: inspected.durationMs }
  }
  if (inspected.byteCount > MAX_CAPTURE_BYTES) {
    return { kind: 'over-size', byteCount: inspected.byteCount }
  }

  return {
    kind: 'valid',
    media: {
      uri: captured.uri,
      durationMs: inspected.durationMs,
      byteCount: inspected.byteCount,
      sha256: inspected.sha256,
    },
  }
}

export type SaveVoiceMemoryInput = {
  promptSnapshot: PromptSnapshotV1
  /** Parent-reviewed text; may be empty for an audio-only save. */
  reviewedTranscript: string
  now: Date
  validatedMedia: ValidatedAudio
  /** Stable identity returned by a prior Not saved attempt. */
  operation?: SaveOperationIdentity
  /** Flat aliases kept for callers that persist the two identifiers separately. */
  operationId?: string
  memoryId?: string
}

export type SaveVoiceMemoryResult = ReliableSaveResult

export type SaveVoiceMemoryDeps = {
  repository: MemoryRepositoryPort
  mediaStore: MediaStorePort
  generateId: () => string
  journal?: SaveJournalPort
}

export async function saveVoiceMemory(
  deps: SaveVoiceMemoryDeps,
  input: SaveVoiceMemoryInput,
): Promise<SaveVoiceMemoryResult> {
  const media = input.validatedMedia
  const fallbackId = input.operation?.memoryId ?? input.memoryId ?? deps.generateId()
  const operation: SaveOperationIdentity = input.operation ?? {
    operationId: input.operationId ?? fallbackId,
    memoryId: fallbackId,
    mediaSha256: media.sha256,
  }
  const retry = operation

  if (media.byteCount === 0 || media.byteCount > MAX_CAPTURE_BYTES) {
    return { kind: 'not-saved', reason: 'invalid-audio', retry }
  }
  if (media.durationMs > MAX_CAPTURE_DURATION_MS) {
    return { kind: 'not-saved', reason: 'invalid-audio', retry }
  }
  if (operation.mediaSha256 !== media.sha256) {
    return { kind: 'not-saved', reason: 'operation-conflict', retry }
  }
  if (!/^[A-Za-z0-9_-]+$/.test(operation.memoryId)) {
    return { kind: 'not-saved', reason: 'operation-conflict', retry }
  }

  // The filename is an opaque id only; family content never enters filenames.
  const relativePath = `media/${operation.memoryId}.m4a`
  const reference: ManagedMediaReferenceV1 = {
    relativePath,
    byteCount: media.byteCount,
    sha256: media.sha256,
  }

  const now = input.now.toISOString()
  const memory: MemoryEntryV1 = {
    id: operation.memoryId,
    kind: 'voice' satisfies MemoryContentKind,
    promptSnapshot: input.promptSnapshot,
    reviewedTranscript: input.reviewedTranscript.trim(),
    capturedAt: now,
    savedAt: now,
    localDate: localDateStamp(input.now),
    timeZone: deviceTimeZone(),
    media: reference,
  }

  const result = await reliablySaveMemory(
    {
      repository: deps.repository,
      mediaStore: deps.mediaStore,
      journal: deps.journal ?? deps.repository.saveJournal,
      preflight: deps.mediaStore.preflight
        ? () => deps.mediaStore.preflight!(media.byteCount * 2 + 1024 * 1024)
        : undefined,
    },
    {
      memory,
      identity: operation,
      relativePath,
      sourceUri: media.uri,
    },
  )
  return result satisfies ReliableSaveResult
}
