import type {
  ManagedMediaReferenceV1,
  MemoryContentKind,
  MemoryEntryV1,
  PromptSnapshotV1,
} from '@before-they-grow/contracts'
import type { RecordingPermissionState, MemoryRepositoryPort } from './memory'
import { deviceTimeZone, localDateStamp } from './memory'

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
}

/**
 * Platform-neutral view of a recorded media file: byte count (twice, for
 * stability), SHA-256, decodability, and duration. The concrete adapter reads
 * the file with expo-file-system and hashes with expo-crypto.
 */
export type MediaInspectorPort = {
  inspect(uri: string): Promise<{
    byteCount: number
    sha256: string
    decodable: boolean
    durationMs: number
    stable: boolean
  }>
}

/**
 * Commits a validated cache file into the canonical, backup-excluded media
 * area with an opaque relative path (never a family-bearing name). A commit
 * failure throws StorageGateError so the caller fails closed.
 */
export type MediaStorePort = {
  commit(sourceUri: string, relativePath: string): Promise<{ relativePath: string }>
  /** Removes a committed file, used to compensate a failed database write. */
  removeFinal(relativePath: string): Promise<void>
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
}

export type SaveVoiceMemoryResult =
  | { kind: 'saved'; memory: MemoryEntryV1 }
  | { kind: 'invalid-audio' }
  | { kind: 'duplicate' }
  | { kind: 'save-failed' }

export type SaveVoiceMemoryDeps = {
  repository: MemoryRepositoryPort
  mediaStore: MediaStorePort
  generateId: () => string
}

export async function saveVoiceMemory(
  deps: SaveVoiceMemoryDeps,
  input: SaveVoiceMemoryInput,
): Promise<SaveVoiceMemoryResult> {
  const media = input.validatedMedia
  if (media.byteCount === 0 || media.byteCount > MAX_CAPTURE_BYTES) {
    return { kind: 'invalid-audio' }
  }
  if (media.durationMs > MAX_CAPTURE_DURATION_MS) return { kind: 'invalid-audio' }

  const id = deps.generateId()
  // The filename is an opaque id only; family content never enters filenames.
  const relativePath = `media/${id}.m4a`

  let committed: { relativePath: string }
  try {
    committed = await deps.mediaStore.commit(media.uri, relativePath)
  } catch {
    return { kind: 'save-failed' }
  }

  const reference: ManagedMediaReferenceV1 = {
    relativePath: committed.relativePath,
    byteCount: media.byteCount,
    sha256: media.sha256,
  }

  const now = input.now.toISOString()
  const memory: MemoryEntryV1 = {
    id,
    kind: 'voice' satisfies MemoryContentKind,
    promptSnapshot: input.promptSnapshot,
    reviewedTranscript: input.reviewedTranscript.trim(),
    capturedAt: now,
    savedAt: now,
    localDate: localDateStamp(input.now),
    timeZone: deviceTimeZone(),
    media: reference,
  }

  let outcome: 'created' | 'duplicate'
  try {
    outcome = await deps.repository.create(memory)
  } catch {
    // Compensate the committed media file so a failed database write does not
    // leave an orphan under the family root.
    await deps.mediaStore.removeFinal(relativePath)
    return { kind: 'save-failed' }
  }

  if (outcome === 'duplicate') {
    // This attempt's media file has no row referencing it; remove it so a
    // duplicate id never orphans a file under the family root.
    await deps.mediaStore.removeFinal(relativePath)
    return { kind: 'duplicate' }
  }
  return { kind: 'saved', memory }
}