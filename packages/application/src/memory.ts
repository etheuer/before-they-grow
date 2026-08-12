import type { MemoryEntryV1, MemoryContentKind, PromptSnapshotV1 } from '@before-they-grow/contracts'
import {
  reliablySaveMemory,
  type ReliableSaveResult,
  type SaveJournalPort,
  type SaveOperationIdentity,
} from './saveReliability'

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
  create(memory: MemoryEntryV1): Promise<'created' | 'duplicate' | 'conflict'>
  /** Looks up one memory for idempotent retry and conflict detection. */
  findById?(id: string): Promise<MemoryEntryV1 | null>
  /** Durable save journal owned by the same catalog, when available. */
  saveJournal?: SaveJournalPort
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
  /** Stable identity returned by a prior Not saved attempt. */
  operation?: SaveOperationIdentity
  /** Flat aliases kept for callers that persist the two identifiers separately. */
  operationId?: string
  memoryId?: string
}

export type SaveManualMemoryResult =
  | ReliableSaveResult
  | { kind: 'invalid-transcript' }
  | { kind: 'recording-was-available' }

export type SaveManualMemoryDeps = {
  repository: MemoryRepositoryPort
  generateId: () => string
  journal?: SaveJournalPort
  preflight?: () => Promise<void>
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

  const fallbackId = input.operation?.memoryId ?? input.memoryId ?? deps.generateId()
  const operation: SaveOperationIdentity = input.operation ?? {
    operationId: input.operationId ?? fallbackId,
    memoryId: fallbackId,
    mediaSha256: null,
  }
  const now = input.now.toISOString()
  const memory: MemoryEntryV1 = {
    id: operation.memoryId,
    kind: 'text-only' satisfies MemoryContentKind,
    promptSnapshot: input.promptSnapshot,
    reviewedTranscript,
    capturedAt: now,
    savedAt: now,
    localDate: localDateStamp(input.now),
    timeZone: deviceTimeZone(),
    media: null,
  }

  return reliablySaveMemory(
    {
      repository: deps.repository,
      journal: deps.journal ?? deps.repository.saveJournal,
      preflight: deps.preflight,
    },
    {
      memory,
      identity: operation,
      relativePath: null,
      sourceUri: null,
    },
  )
}

export async function loadMemoryTimeline(deps: {
  repository: MemoryRepositoryPort
}): Promise<MemoryEntryV1[]> {
  return deps.repository.findNewestFirst()
}