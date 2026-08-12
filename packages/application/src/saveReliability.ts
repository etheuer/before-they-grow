import type { MemoryEntryV1 } from '@before-they-grow/contracts'
import type { MemoryRepositoryPort } from './memory'

/** Stable identifiers carried across a failed save and its immediate retry. */
export type SaveOperationIdentity = {
  operationId: string
  memoryId: string
  mediaSha256: string | null
}

export type SaveOperationPhase = 'prepared' | 'media-committed'

/** The durable intent needed to reconcile a save after process death. */
export type SaveOperationRecord = {
  identity: SaveOperationIdentity
  relativePath: string | null
  memory: MemoryEntryV1
  phase: SaveOperationPhase
}

export type SaveJournalPrepareResult =
  | { kind: 'created'; record: SaveOperationRecord }
  | { kind: 'existing'; record: SaveOperationRecord }
  | { kind: 'conflict'; existing?: MemoryEntryV1 }

/**
 * A journal is deliberately narrower than SQLite. The native adapter persists
 * this port; application tests can use a deterministic fake or omit it for a
 * purely in-process save.
 */
export type SaveJournalPort = {
  prepare(operation: SaveOperationRecord): Promise<SaveJournalPrepareResult>
  markMediaCommitted(operationId: string): Promise<void>
  /** Resets a stale media phase after a known pre-commit compensation. */
  markPrepared?(operationId: string): Promise<void>
  listPending(): Promise<SaveOperationRecord[]>
  remove(operationId: string): Promise<void>
}

export type SaveNotSavedReason =
  | 'invalid-audio'
  | 'low-storage'
  | 'preflight-failed'
  | 'media-commit-failed'
  | 'database-commit-failed'
  | 'operation-conflict'
  | 'conflict'
  | 'cleanup-pending'

export type SaveIndeterminateReason =
  | 'media-commit-uncertain'
  | 'backup-control-failed'
  | 'database-commit-uncertain'
  | 'post-commit-verification-failed'
  | 'journal-uncertain'

export class SaveCapacityError extends Error {
  constructor(message = 'Not enough free storage for this save') {
    super(message)
    this.name = 'SaveCapacityError'
  }
}

/** Signals that a boundary may have crossed the SQLite/media commit point. */
export class SaveIndeterminateError extends Error {
  constructor(readonly reason: SaveIndeterminateReason, message = reason) {
    super(message)
    this.name = 'SaveIndeterminateError'
  }
}

/** A stable identifier was reused for different content. */
export class SaveConflictError extends Error {
  constructor(message = 'The save operation identifiers belong to different content') {
    super(message)
    this.name = 'SaveConflictError'
  }
}

/** Gives a boundary failure an explicit commit phase without exposing SQLite. */
export class SaveBoundaryError extends Error {
  constructor(
    readonly phase: 'pre-commit' | 'post-commit' | 'unknown',
    readonly reason: SaveNotSavedReason | SaveIndeterminateReason,
    message = reason,
  ) {
    super(message)
    this.name = 'SaveBoundaryError'
  }
}

export type SaveRetry = SaveOperationIdentity

export type ReliableSaveResult =
  | { kind: 'saved'; memory: MemoryEntryV1 }
  | {
      kind: 'not-saved'
      reason: SaveNotSavedReason
      retry: SaveRetry
      cleanupPending?: boolean
      conflict?: { existing: MemoryEntryV1 }
      existing?: MemoryEntryV1
    }
  | { kind: 'indeterminate'; reason: SaveIndeterminateReason; operation: SaveOperationIdentity }

/** Public three-way save contract used by voice and manual paths. */
export type SaveOutcome = ReliableSaveResult

export type SaveReconciliationResult =
  | { kind: 'saved'; operationId: string; memory: MemoryEntryV1 }
  | { kind: 'not-saved'; operationId: string; reason: 'commit-not-observed' }

export class SaveReconciliationError extends Error {
  constructor(readonly reason: 'conflict' | 'cleanup-failed' | 'journal-failed', message = reason) {
    super(message)
    this.name = 'SaveReconciliationError'
  }
}

type SaveMediaPort = {
  commit(sourceUri: string, relativePath: string): Promise<void>
  removeFinal(relativePath: string): Promise<void>
  reconcileFinal?(relativePath: string): Promise<boolean>
}

type ReliableSaveDependencies = {
  repository: MemoryRepositoryPort
  mediaStore?: SaveMediaPort
  journal?: SaveJournalPort
  preflight?: () => Promise<void>
}

type ReliableSaveInput = {
  memory: MemoryEntryV1
  identity: SaveOperationIdentity
  relativePath: string | null
  sourceUri: string | null
}

function sameMemory(left: MemoryEntryV1, right: MemoryEntryV1): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function findById(
  repository: MemoryRepositoryPort,
  id: string,
): Promise<MemoryEntryV1 | null> {
  if (repository.findById) return repository.findById(id)
  const memories = await repository.findNewestFirst()
  return memories.find((memory) => memory.id === id) ?? null
}

function isCapacityFailure(error: unknown): boolean {
  if (error instanceof SaveCapacityError) return true
  if (!error || typeof error !== 'object') return false
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return /(?:out of space|no space|disk full|database or disk is full|enospc)/i.test(message)
}

function isStorageGate(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { name?: string; reason?: unknown; constructor?: { name?: string } }
  return (
    typeof candidate.reason === 'string'
    && (candidate.name === 'StorageGateError' || candidate.constructor?.name === 'StorageGateError')
  )
}

function isIndeterminateFailure(error: unknown): SaveIndeterminateReason | null {
  if (error instanceof SaveIndeterminateError) return error.reason
  if (error instanceof SaveBoundaryError && error.phase !== 'pre-commit') {
    const reasons: SaveIndeterminateReason[] = [
      'media-commit-uncertain',
      'backup-control-failed',
      'database-commit-uncertain',
      'post-commit-verification-failed',
      'journal-uncertain',
    ]
    return reasons.includes(error.reason as SaveIndeterminateReason)
      ? error.reason as SaveIndeterminateReason
      : 'database-commit-uncertain'
  }
  if (error instanceof SaveConflictError) return 'media-commit-uncertain'
  if (isStorageGate(error) && (error as { reason: string }).reason === 'backup-control-failed') {
    return 'backup-control-failed'
  }
  return null
}

function conflictResult(
  identity: SaveOperationIdentity,
  existing: MemoryEntryV1,
): ReliableSaveResult {
  return {
    kind: 'not-saved',
    reason: 'conflict',
    retry: identity,
    conflict: { existing },
    existing,
  }
}

function retryResult(
  identity: SaveOperationIdentity,
  reason: SaveNotSavedReason,
  cleanupPending = false,
): ReliableSaveResult {
  return {
    kind: 'not-saved',
    reason,
    retry: identity,
    ...(cleanupPending ? { cleanupPending: true } : {}),
  }
}

async function forgetJournal(
  journal: SaveJournalPort | undefined,
  operationId: string,
): Promise<boolean> {
  if (!journal) return true
  try {
    await journal.remove(operationId)
    return true
  } catch {
    return false
  }
}

async function cleanFinal(
  mediaStore: SaveMediaPort | undefined,
  relativePath: string | null,
): Promise<boolean> {
  if (!mediaStore || !relativePath) return true
  try {
    await mediaStore.removeFinal(relativePath)
    return true
  } catch {
    return false
  }
}

async function finalIsUnreferenced(
  repository: MemoryRepositoryPort,
  relativePath: string | null,
): Promise<boolean> {
  if (!relativePath) return true
  try {
    const memories = await repository.findNewestFirst()
    return !memories.some((memory) => memory.media?.relativePath === relativePath)
  } catch {
    return false
  }
}

async function compensateKnownFailure(
  deps: ReliableSaveDependencies,
  input: ReliableSaveInput,
): Promise<boolean> {
  const unreferenced = await finalIsUnreferenced(deps.repository, input.relativePath)
  const mediaClean = unreferenced
    ? await cleanFinal(deps.mediaStore, input.relativePath)
    : false
  // Keep the durable intent when the recognized final cannot be removed; the
  // next bootstrap must get another chance to remove that orphan safely.
  if (!mediaClean) return false
  const journalClean = await forgetJournal(deps.journal, input.identity.operationId)
  if (journalClean) return true
  try {
    await deps.journal?.markPrepared?.(input.identity.operationId)
  } catch {
    // The pending journal remains the bootstrap reconciliation authority.
  }
  return false
}

/**
 * Runs the save sequence shared by voice and text-only memories. The sequence
 * is intentionally conservative: once media may have moved or SQLite may have
 * committed, it returns Indeterminate and leaves the journal for bootstrap.
 */
export async function reliablySaveMemory(
  deps: ReliableSaveDependencies,
  input: ReliableSaveInput,
): Promise<ReliableSaveResult> {
  const existing = await findById(deps.repository, input.identity.memoryId)
  if (existing) {
    if (sameMemory(existing, input.memory)) return { kind: 'saved', memory: existing }
    return conflictResult(input.identity, existing)
  }

  if (deps.preflight) {
    try {
      await deps.preflight()
    } catch (error) {
      if (isStorageGate(error)) throw error
      if (isIndeterminateFailure(error)) {
        return {
          kind: 'indeterminate',
          reason: isIndeterminateFailure(error) ?? 'journal-uncertain',
          operation: input.identity,
        }
      }
      return retryResult(input.identity, isCapacityFailure(error) ? 'low-storage' : 'preflight-failed')
    }
  }

  let journalRecord: SaveOperationRecord | null = null
  if (deps.journal) {
    const requested: SaveOperationRecord = {
      identity: input.identity,
      relativePath: input.relativePath,
      memory: input.memory,
      phase: 'prepared',
    }
    let prepared: SaveJournalPrepareResult
    try {
      prepared = await deps.journal.prepare(requested)
    } catch (error) {
      if (isStorageGate(error)) throw error
      return retryResult(input.identity, isCapacityFailure(error) ? 'low-storage' : 'database-commit-failed')
    }
    if (prepared.kind === 'conflict') {
      const conflict = prepared.existing ?? (await findById(deps.repository, input.identity.memoryId))
      if (conflict) return conflictResult(input.identity, conflict)
      return retryResult(input.identity, 'operation-conflict')
    }
    journalRecord = prepared.record
    if (!sameMemory(journalRecord.memory, input.memory)) {
      return conflictResult(input.identity, journalRecord.memory)
    }
  }

  let mediaCommitNeeded = journalRecord?.phase !== 'media-committed'
  if (journalRecord?.phase === 'media-committed' && input.relativePath && deps.mediaStore?.reconcileFinal) {
    try {
      mediaCommitNeeded = !(await deps.mediaStore.reconcileFinal(input.relativePath))
    } catch (error) {
      if (isStorageGate(error)) throw error
      return {
        kind: 'indeterminate',
        reason: isIndeterminateFailure(error) ?? 'media-commit-uncertain',
        operation: input.identity,
      }
    }
  }

  if (
    input.relativePath
    && input.sourceUri
    && deps.mediaStore
    && mediaCommitNeeded
  ) {
    try {
      await deps.mediaStore.commit(input.sourceUri, input.relativePath)
    } catch (error) {
      const uncertain = isIndeterminateFailure(error)
      if (uncertain) {
        return { kind: 'indeterminate', reason: uncertain, operation: input.identity }
      }
      const cleaned = await compensateKnownFailure(deps, input)
      return retryResult(input.identity, isCapacityFailure(error) ? 'low-storage' : 'media-commit-failed', !cleaned)
    }

    if (deps.journal) {
      try {
        await deps.journal.markMediaCommitted(input.identity.operationId)
      } catch {
        return {
          kind: 'indeterminate',
          reason: 'journal-uncertain',
          operation: input.identity,
        }
      }
    }
  }

  let outcome: 'created' | 'duplicate' | 'conflict'
  try {
    outcome = await deps.repository.create(input.memory)
  } catch (error) {
    if (isStorageGate(error)) throw error
    const uncertain = isIndeterminateFailure(error)
    if (uncertain) {
      return { kind: 'indeterminate', reason: uncertain, operation: input.identity }
    }
    const cleaned = await compensateKnownFailure(deps, input)
    return retryResult(input.identity, isCapacityFailure(error) ? 'low-storage' : 'database-commit-failed', !cleaned)
  }

  if (outcome === 'conflict') {
    const conflict = await findById(deps.repository, input.identity.memoryId)
    if (conflict) return conflictResult(input.identity, conflict)
    return retryResult(input.identity, 'operation-conflict')
  }

  if (outcome === 'duplicate') {
    const duplicate = await findById(deps.repository, input.identity.memoryId)
    if (!duplicate) {
      return {
        kind: 'indeterminate',
        reason: 'database-commit-uncertain',
        operation: input.identity,
      }
    }
    if (!sameMemory(duplicate, input.memory)) {
      return conflictResult(input.identity, duplicate)
    }
    const forgotten = await forgetJournal(deps.journal, input.identity.operationId)
    if (!forgotten) {
      return {
        kind: 'indeterminate',
        reason: 'journal-uncertain',
        operation: input.identity,
      }
    }
    return { kind: 'saved', memory: duplicate }
  }

  const forgotten = await forgetJournal(deps.journal, input.identity.operationId)
  if (!forgotten) {
    return {
      kind: 'indeterminate',
      reason: 'post-commit-verification-failed',
      operation: input.identity,
    }
  }
  return { kind: 'saved', memory: input.memory }
}

/**
 * Reconciles only durable operations left in the journal. A missing row is
 * Not saved and its recognized final media is removed; an existing matching
 * row is Saved. It never creates a row during reconciliation.
 */
export async function reconcileSaveOperations(deps: {
  repository: MemoryRepositoryPort
  mediaStore?: Pick<SaveMediaPort, 'removeFinal' | 'reconcileFinal'>
  journal?: SaveJournalPort
}): Promise<SaveReconciliationResult[]> {
  if (!deps.journal) return []
  let operations: SaveOperationRecord[]
  try {
    operations = await deps.journal.listPending()
  } catch {
    throw new SaveReconciliationError('journal-failed')
  }

  const results: SaveReconciliationResult[] = []
  for (const operation of operations) {
    let finalPresent = true
    if (operation.relativePath && deps.mediaStore?.reconcileFinal) {
      try {
        finalPresent = await deps.mediaStore.reconcileFinal(operation.relativePath)
      } catch (error) {
        if (isStorageGate(error)) throw error
        throw new SaveReconciliationError('cleanup-failed')
      }
    }
    let existing: MemoryEntryV1 | null
    try {
      existing = await findById(deps.repository, operation.identity.memoryId)
    } catch {
      throw new SaveReconciliationError('journal-failed')
    }

    if (existing) {
      if (!sameMemory(existing, operation.memory)) {
        throw new SaveReconciliationError('conflict')
      }
      try {
        await deps.journal.remove(operation.identity.operationId)
      } catch {
        throw new SaveReconciliationError('journal-failed')
      }
      results.push({ kind: 'saved', operationId: operation.identity.operationId, memory: existing })
      continue
    }

    if (operation.relativePath && deps.mediaStore && finalPresent) {
      let referenced = false
      try {
        referenced = (await deps.repository.findNewestFirst()).some(
          (memory) => memory.id !== operation.identity.memoryId
            && memory.media?.relativePath === operation.relativePath,
        )
      } catch {
        throw new SaveReconciliationError('journal-failed')
      }
      if (referenced) throw new SaveReconciliationError('conflict')
      try {
        await deps.mediaStore.removeFinal(operation.relativePath)
      } catch (error) {
        if (isStorageGate(error)) throw error
        throw new SaveReconciliationError('cleanup-failed')
      }
    }
    try {
      await deps.journal.remove(operation.identity.operationId)
    } catch {
      throw new SaveReconciliationError('journal-failed')
    }
    results.push({
      kind: 'not-saved',
      operationId: operation.identity.operationId,
      reason: 'commit-not-observed',
    })
  }
  return results
}

export function isSaveIndeterminate(result: ReliableSaveResult): result is Extract<ReliableSaveResult, { kind: 'indeterminate' }> {
  return result.kind === 'indeterminate'
}
