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
  | { kind: 'conflict'; existing: MemoryEntryV1 }

/**
 * A journal is deliberately narrower than SQLite. The native adapter persists
 * this port; application tests can use a deterministic fake or omit it for a
 * purely in-process save.
 */
export type SaveJournalPort = {
  prepare(operation: SaveOperationRecord): Promise<SaveJournalPrepareResult>
  markMediaCommitted(operationId: string): Promise<void>
  listPending(): Promise<SaveOperationRecord[]>
  remove(operationId: string): Promise<void>
}

export type SaveNotSavedReason =
  | 'invalid-audio'
  | 'low-storage'
  | 'preflight-failed'
  | 'media-commit-failed'
  | 'database-commit-failed'
  | 'conflict'

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
    }
  | { kind: 'indeterminate'; reason: SaveIndeterminateReason; operation: SaveOperationIdentity }

export type SaveReconciliationResult =
  | { kind: 'saved'; operationId: string; memory: MemoryEntryV1 }
  | { kind: 'not-saved'; operationId: string; reason: 'commit-not-observed' }
  | {
      kind: 'conflict'
      operationId: string
      existing: MemoryEntryV1
      cleanupPending?: boolean
    }

export class SaveReconciliationError extends Error {
  constructor(readonly reason: 'cleanup-failed' | 'journal-failed', message = reason) {
    super(message)
    this.name = 'SaveReconciliationError'
  }
}

type SaveMediaPort = {
  commit(sourceUri: string, relativePath: string): Promise<void>
  removeFinal(relativePath: string): Promise<void>
  /** Verifies a recognized final, including its backup-exclusion policy. */
  reconcileFinal(relativePath: string): Promise<boolean>
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

/**
 * Voice media is immutable for an operation, while parent-reviewed text is
 * intentionally editable between capture, transcription, and retry. Text-only
 * memories have no separate immutable payload, so their complete content is
 * the retry identity's content.
 */
function sameRetryContent(left: MemoryEntryV1, right: MemoryEntryV1): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'voice') {
    return JSON.stringify({ ...left, reviewedTranscript: '' })
      === JSON.stringify({ ...right, reviewedTranscript: '' })
  }
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

function storageGateReason(error: unknown): string | null {
  if (!isStorageGate(error)) return null
  return (error as { reason: string }).reason
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
  if (storageGateReason(error) === 'backup-control-failed') return 'backup-control-failed'
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
  return forgetJournal(deps.journal, input.identity.operationId)
}

async function updateExistingVoiceReview(
  deps: ReliableSaveDependencies,
  identity: SaveOperationIdentity,
  existing: MemoryEntryV1,
  requested: MemoryEntryV1,
): Promise<ReliableSaveResult> {
  if (
    existing.kind !== 'voice'
    || requested.kind !== 'voice'
    || !sameRetryContent(existing, requested)
  ) {
    return conflictResult(identity, existing)
  }
  if (existing.reviewedTranscript === requested.reviewedTranscript) {
    return { kind: 'saved', memory: existing }
  }

  try {
    const outcome = await deps.repository.updateReviewedTranscript(
      identity.memoryId,
      requested.reviewedTranscript,
    )
    if (outcome === 'missing') {
      return { kind: 'indeterminate', reason: 'database-commit-uncertain', operation: identity }
    }
    const updated = await findById(deps.repository, identity.memoryId)
    if (
      !updated
      || !sameRetryContent(updated, requested)
      || updated.reviewedTranscript !== requested.reviewedTranscript
    ) {
      return { kind: 'indeterminate', reason: 'post-commit-verification-failed', operation: identity }
    }
    return { kind: 'saved', memory: updated }
  } catch (error) {
    if (isStorageGate(error)) throw error
    const uncertain = isIndeterminateFailure(error)
    if (uncertain) return { kind: 'indeterminate', reason: uncertain, operation: identity }
    return retryResult(identity, isCapacityFailure(error) ? 'low-storage' : 'database-commit-failed')
  }
}

async function resolveExisting(
  deps: ReliableSaveDependencies,
  identity: SaveOperationIdentity,
  existing: MemoryEntryV1,
  requested: MemoryEntryV1,
): Promise<ReliableSaveResult> {
  if (!sameRetryContent(existing, requested)) return conflictResult(identity, existing)
  if (
    existing.kind === 'voice'
    && existing.reviewedTranscript !== requested.reviewedTranscript
  ) {
    return updateExistingVoiceReview(deps, identity, existing, requested)
  }
  return { kind: 'saved', memory: existing }
}

async function finishSaved(
  journal: SaveJournalPort | undefined,
  identity: SaveOperationIdentity,
  memory: MemoryEntryV1,
): Promise<ReliableSaveResult> {
  if (!(await forgetJournal(journal, identity.operationId))) {
    return {
      kind: 'indeterminate',
      reason: 'journal-uncertain',
      operation: identity,
    }
  }
  return { kind: 'saved', memory }
}

/**
 * Runs the save sequence shared by voice and text-only memories. The sequence
 * is intentionally conservative: once media may have moved or SQLite may
 * have committed, it returns Indeterminate and leaves the journal for
 * bootstrap.
 */
export async function reliablySaveMemory(
  deps: ReliableSaveDependencies,
  input: ReliableSaveInput,
): Promise<ReliableSaveResult> {
  const existing = await findById(deps.repository, input.identity.memoryId)
  if (existing) {
    const resolved = await resolveExisting(deps, input.identity, existing, input.memory)
    if (resolved.kind === 'saved') {
      return finishSaved(deps.journal, input.identity, resolved.memory)
    }
    return resolved
  }

  if (deps.preflight) {
    try {
      await deps.preflight()
    } catch (error) {
      if (isStorageGate(error)) throw error
      const uncertain = isIndeterminateFailure(error)
      if (uncertain) return { kind: 'indeterminate', reason: uncertain, operation: input.identity }
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
      const uncertain = isIndeterminateFailure(error)
      if (uncertain) return { kind: 'indeterminate', reason: uncertain, operation: input.identity }
      return retryResult(input.identity, isCapacityFailure(error) ? 'low-storage' : 'database-commit-failed')
    }
    if (prepared.kind === 'conflict') {
      return conflictResult(input.identity, prepared.existing)
    }
    if (!sameRetryContent(prepared.record.memory, input.memory)) {
      return conflictResult(input.identity, prepared.record.memory)
    }
    // The journal adapter updates only the parent-reviewed field for a same
    // identity voice retry; carry that current value into the rest of this
    // attempt even for a deterministic application fake.
    journalRecord = { ...prepared.record, memory: input.memory }
  }

  let mediaCommitted = journalRecord?.phase === 'media-committed'
  if (journalRecord && input.relativePath) {
    try {
      // A prepared operation with an existing, verified final is the known
      // continuation after media movement and before the phase update.
      mediaCommitted = journalRecord.phase === 'media-committed'
        || await deps.mediaStore!.reconcileFinal(input.relativePath)
    } catch (error) {
      if (storageGateReason(error) === 'backup-control-failed') {
        return { kind: 'indeterminate', reason: 'backup-control-failed', operation: input.identity }
      }
      if (isStorageGate(error)) throw error
      return {
        kind: 'indeterminate',
        reason: isIndeterminateFailure(error) ?? 'media-commit-uncertain',
        operation: input.identity,
      }
    }
  }

  if (input.relativePath && input.sourceUri && deps.mediaStore && !mediaCommitted) {
    try {
      await deps.mediaStore.commit(input.sourceUri, input.relativePath)
      mediaCommitted = true
    } catch (error) {
      const uncertain = isIndeterminateFailure(error)
      if (uncertain) return { kind: 'indeterminate', reason: uncertain, operation: input.identity }
      const cleaned = await compensateKnownFailure(deps, input)
      return retryResult(
        input.identity,
        isCapacityFailure(error) ? 'low-storage' : 'media-commit-failed',
        !cleaned,
      )
    }
  }

  if (
    deps.journal
    && journalRecord
    && input.relativePath
    && journalRecord.phase !== 'media-committed'
    && mediaCommitted
  ) {
    try {
      await deps.journal.markMediaCommitted(input.identity.operationId)
    } catch {
      return { kind: 'indeterminate', reason: 'journal-uncertain', operation: input.identity }
    }
  }

  let outcome: 'created' | 'duplicate'
  try {
    outcome = await deps.repository.create(input.memory)
  } catch (error) {
    if (isStorageGate(error)) throw error
    const uncertain = isIndeterminateFailure(error)
    if (uncertain) return { kind: 'indeterminate', reason: uncertain, operation: input.identity }
    const cleaned = await compensateKnownFailure(deps, input)
    return retryResult(
      input.identity,
      isCapacityFailure(error) ? 'low-storage' : 'database-commit-failed',
      !cleaned,
    )
  }

  if (outcome === 'duplicate') {
    const duplicate = await findById(deps.repository, input.identity.memoryId)
    if (!duplicate) {
      return { kind: 'indeterminate', reason: 'database-commit-uncertain', operation: input.identity }
    }
    const resolved = await resolveExisting(deps, input.identity, duplicate, input.memory)
    if (resolved.kind === 'saved') {
      return finishSaved(deps.journal, input.identity, resolved.memory)
    }
    return resolved
  }

  return finishSaved(deps.journal, input.identity, input.memory)
}

async function removeFinalIfUnreferenced(
  repository: MemoryRepositoryPort,
  mediaStore: Pick<SaveMediaPort, 'removeFinal'> | undefined,
  relativePath: string | null,
): Promise<boolean> {
  if (!relativePath) return true
  if (!mediaStore) return false
  if (!(await finalIsUnreferenced(repository, relativePath))) return true
  try {
    await mediaStore.removeFinal(relativePath)
    return true
  } catch {
    return false
  }
}

async function removeJournalOrThrow(
  journal: SaveJournalPort,
  operationId: string,
): Promise<void> {
  try {
    await journal.remove(operationId)
  } catch {
    throw new SaveReconciliationError('journal-failed')
  }
}

async function reconcileExistingReview(
  repository: MemoryRepositoryPort,
  operation: SaveOperationRecord,
  existing: MemoryEntryV1,
): Promise<MemoryEntryV1> {
  if (
    existing.kind !== 'voice'
    || operation.memory.kind !== 'voice'
    || existing.reviewedTranscript === operation.memory.reviewedTranscript
  ) {
    return existing
  }
  try {
    const outcome = await repository.updateReviewedTranscript(
      operation.identity.memoryId,
      operation.memory.reviewedTranscript,
    )
    if (outcome === 'missing') throw new Error('memory disappeared during reconciliation')
    const updated = await findById(repository, operation.identity.memoryId)
    if (
      !updated
      || !sameRetryContent(updated, operation.memory)
      || updated.reviewedTranscript !== operation.memory.reviewedTranscript
    ) {
      throw new Error('reviewed transcript could not be verified')
    }
    return updated
  } catch {
    throw new SaveReconciliationError('journal-failed')
  }
}

/**
 * Reconciles only durable operations left in the journal. Reconciliation
 * never creates a catalog row: a row is Saved only when the database already
 * made it visible. An absent row is Not saved and its recognized final is
 * removed. Same-identity retries continue a prepared operation in the normal
 * save path before bootstrap reconciliation runs.
 */
export async function reconcileSaveOperations(deps: {
  repository: MemoryRepositoryPort
  mediaStore?: Pick<SaveMediaPort, 'removeFinal' | 'reconcileFinal'>
  journal?: SaveJournalPort
}): Promise<SaveReconciliationResult[]> {
  const journal = deps.journal
  if (!journal) return []
  let operations: SaveOperationRecord[]
  try {
    operations = await journal.listPending()
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
      if (!sameRetryContent(existing, operation.memory)) {
        const cleaned = await removeFinalIfUnreferenced(
          deps.repository,
          deps.mediaStore,
          finalPresent ? operation.relativePath : null,
        )
        if (cleaned) {
          try {
            await journal.remove(operation.identity.operationId)
          } catch {
            results.push({
              kind: 'conflict',
              operationId: operation.identity.operationId,
              existing,
              cleanupPending: true,
            })
            continue
          }
        }
        results.push({
          kind: 'conflict',
          operationId: operation.identity.operationId,
          existing,
          ...(cleaned ? {} : { cleanupPending: true }),
        })
        continue
      }
      const resolved = await reconcileExistingReview(deps.repository, operation, existing)
      await removeJournalOrThrow(journal, operation.identity.operationId)
      results.push({ kind: 'saved', operationId: operation.identity.operationId, memory: resolved })
      continue
    }

    if (!finalPresent || operation.phase === 'media-committed') {
      const cleaned = await removeFinalIfUnreferenced(
        deps.repository,
        deps.mediaStore,
        finalPresent ? operation.relativePath : null,
      )
      if (!cleaned) throw new SaveReconciliationError('cleanup-failed')
      await removeJournalOrThrow(journal, operation.identity.operationId)
      results.push({
        kind: 'not-saved',
        operationId: operation.identity.operationId,
        reason: 'commit-not-observed',
      })
      continue
    }

    // Prepared + final present is the process-death gap after media moved.
    // Continue the exact operation rather than deleting the recognized file.
    if (operation.relativePath) {
      try {
        await journal.markMediaCommitted(operation.identity.operationId)
      } catch {
        throw new SaveReconciliationError('journal-failed')
      }
    }

    let outcome: 'created' | 'duplicate'
    try {
      outcome = await deps.repository.create(operation.memory)
    } catch (error) {
      if (isIndeterminateFailure(error)) throw new SaveReconciliationError('journal-failed')
      const cleaned = await removeFinalIfUnreferenced(
        deps.repository,
        deps.mediaStore,
        finalPresent ? operation.relativePath : null,
      )
      if (!cleaned) throw new SaveReconciliationError('cleanup-failed')
      await removeJournalOrThrow(journal, operation.identity.operationId)
      results.push({
        kind: 'not-saved',
        operationId: operation.identity.operationId,
        reason: 'commit-not-observed',
      })
      continue
    }

    if (outcome === 'duplicate') {
      const duplicate = await findById(deps.repository, operation.identity.memoryId)
      if (!duplicate) throw new SaveReconciliationError('journal-failed')
      if (!sameRetryContent(duplicate, operation.memory)) {
        results.push({
          kind: 'conflict',
          operationId: operation.identity.operationId,
          existing: duplicate,
        })
        continue
      }
      const resolved = await reconcileExistingReview(deps.repository, operation, duplicate)
      await removeJournalOrThrow(journal, operation.identity.operationId)
      results.push({ kind: 'saved', operationId: operation.identity.operationId, memory: resolved })
      continue
    }

    const committed = await findById(deps.repository, operation.identity.memoryId)
    if (!committed || !sameRetryContent(committed, operation.memory)) {
      throw new SaveReconciliationError('journal-failed')
    }
    const resolved = await reconcileExistingReview(deps.repository, operation, committed)
    await removeJournalOrThrow(journal, operation.identity.operationId)
    results.push({ kind: 'saved', operationId: operation.identity.operationId, memory: resolved })
  }
  return results
}
