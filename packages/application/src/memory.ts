import type { MemoryEntryV1, MemoryContentKind, PromptSnapshotV1 } from '@before-they-grow/contracts'

/**
 * Result of requesting microphone permission at the moment the parent chooses
 * to record. 'granted' means capture is ready; 'denied' and 'unavailable'
 * both route to Manual transcript entry with an honest "no voice was
 * captured" statement. This port is only ever called after the parent decides
 * to record and sees the purpose explained at that decision point.
 */
export type RecordingPermissionState = 'granted' | 'denied' | 'unavailable'

export type RecordingPermissionPort = {
  requestPermission(): Promise<RecordingPermissionState>
}

export type MemoryRepositoryPort = {
  /**
   * Persists a memory atomically and returns success only after the row is
   * queryable. Enforces primary-key idempotency.
   */
  create(memory: MemoryEntryV1): Promise<'created' | 'duplicate'>
  /** Returns memories ordered newest first by save time. */
  findNewestFirst(): Promise<MemoryEntryV1[]>
}

export type SaveManualMemoryInput = {
  promptSnapshot: PromptSnapshotV1
  reviewedTranscript: string
  now: Date
  /**
   * Gates the text-only path: a Manual transcript meaningfully represents a
   * Local-only memory only when voice capture was genuinely unavailable. When
   * capture was ready this is refused (no text-only bypass of the capture
   * path).
   */
  recordingWasAvailable: boolean
}

export type SaveManualMemoryResult =
  | { kind: 'saved'; memory: MemoryEntryV1 }
  | { kind: 'invalid-transcript' }
  | { kind: 'recording-was-available' }
  | { kind: 'duplicate' }

export type SaveManualMemoryDeps = {
  repository: MemoryRepositoryPort
  generateId: () => string
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

/** YYYY-MM-DD in the device's local time, for grouping a memory to its day. */
export function localDateStamp(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** IANA time-zone identifier of the device, falling back to UTC. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export async function saveManualMemory(
  deps: SaveManualMemoryDeps,
  input: SaveManualMemoryInput,
): Promise<SaveManualMemoryResult> {
  const reviewedTranscript = input.reviewedTranscript.trim()
  if (reviewedTranscript.length === 0) return { kind: 'invalid-transcript' }
  if (input.recordingWasAvailable) return { kind: 'recording-was-available' }

  const now = input.now.toISOString()
  const memory: MemoryEntryV1 = {
    id: deps.generateId(),
    kind: 'text-only' satisfies MemoryContentKind,
    promptSnapshot: input.promptSnapshot,
    reviewedTranscript,
    capturedAt: now,
    savedAt: now,
    localDate: localDateStamp(input.now),
    timeZone: deviceTimeZone(),
    media: null,
  }

  const outcome = await deps.repository.create(memory)
  if (outcome === 'duplicate') return { kind: 'duplicate' }
  return { kind: 'saved', memory }
}

export async function loadMemoryTimeline(deps: {
  repository: MemoryRepositoryPort
}): Promise<MemoryEntryV1[]> {
  return deps.repository.findNewestFirst()
}