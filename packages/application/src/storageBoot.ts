import type { MemoryEntryV1 } from '@before-they-grow/contracts'
import { StorageGateError, type StorageBlockReason } from './profile'

export type UnavailableReason = 'missing-file' | 'wrong-size' | 'checksum-mismatch'

export type UnavailableMemory = {
  memoryId: string
  reason: UnavailableReason
}

export type StorageBootReport =
  | { kind: 'blocked'; reason: StorageBlockReason }
  | {
      kind: 'safe'
      unavailable: UnavailableMemory[]
      unreferencedFinals: string[]
      stale: string[]
    }
  | {
      kind: 'dangerous'
      unavailable: UnavailableMemory[]
      unreferencedFinals: string[]
      stale: string[]
    }

export type FilesystemEntryKind =
  | 'recognized-final'
  | 'recognized-staging'
  | 'recognized-stale'
  | 'recognized-catalog'
  | 'recognized-journal'
  | 'unknown'

export type FilesystemEntry = {
  relativePath: string
  byteCount: number
  kind: FilesystemEntryKind
}

export type ReferencedMedia = {
  memoryId: string
  relativePath: string
  byteCount: number
  sha256: string
}

export type MediaPresence = {
  relativePath: string
  exists: boolean
  byteCount: number
}

export function classifyLayoutVersions(
  found: readonly number[],
  supported: number,
): 'ok' | 'version-unsafe' {
  return found.some((version) => version > supported) ? 'version-unsafe' : 'ok'
}

export function classifyMediaHealth(input: {
  exists: boolean
  actualByteCount: number
  expectedByteCount: number
  actualSha256?: string
  expectedSha256?: string
}): 'ok' | UnavailableReason {
  if (!input.exists) return 'missing-file'
  if (input.actualByteCount !== input.expectedByteCount) return 'wrong-size'
  if (
    input.actualSha256 !== undefined
    && input.expectedSha256 !== undefined
    && input.actualSha256 !== input.expectedSha256
  ) {
    return 'checksum-mismatch'
  }
  return 'ok'
}

export function classifyStorageInventory(input: {
  referenced: readonly ReferencedMedia[]
  presence: readonly MediaPresence[]
  inventory: readonly FilesystemEntry[]
}): StorageBootReport {
  if (input.inventory.some((entry) => entry.kind === 'unknown')) {
    return { kind: 'blocked', reason: 'root-unsafe' }
  }

  const presenceByPath = new Map(
    input.presence.map((entry) => [entry.relativePath, entry]),
  )
  const unavailable: UnavailableMemory[] = []
  const referencedPaths = new Set<string>()

  for (const media of input.referenced) {
    referencedPaths.add(media.relativePath)
    const seen = presenceByPath.get(media.relativePath)
    const reason = classifyMediaHealth({
      exists: seen?.exists ?? false,
      actualByteCount: seen?.byteCount ?? 0,
      expectedByteCount: media.byteCount,
    })
    if (reason !== 'ok') unavailable.push({ memoryId: media.memoryId, reason })
  }

  const unreferencedFinals = input.inventory
    .filter((entry) => entry.kind === 'recognized-final' && !referencedPaths.has(entry.relativePath))
    .map((entry) => entry.relativePath)
  const stale = input.inventory
    .filter((entry) => entry.kind === 'recognized-stale' || entry.kind === 'recognized-staging')
    .map((entry) => entry.relativePath)

  if (unavailable.length > 0) {
    return { kind: 'dangerous', unavailable, unreferencedFinals, stale }
  }
  return { kind: 'safe', unavailable, unreferencedFinals, stale }
}

export function referencedMediaFrom(memories: readonly MemoryEntryV1[]): ReferencedMedia[] {
  const referenced: ReferencedMedia[] = []
  for (const memory of memories) {
    if (!memory.media) continue
    referenced.push({
      memoryId: memory.id,
      relativePath: memory.media.relativePath,
      byteCount: memory.media.byteCount,
      sha256: memory.media.sha256,
    })
  }
  return referenced
}

export {
  deleteAllFamilyContent,
  hardDeleteMemory,
  resumeFamilyWipe,
  resumeIndividualDeletions,
} from './hardDelete'

export type LayoutMigrationPhase = 'prepared' | 'copied' | 'validated' | 'switched'

export type LayoutMigrationRecord = {
  operationId: string
  sourceLayout: number
  targetLayout: number
  phase: LayoutMigrationPhase
}

export type StorageInventoryPort = {
  verifyRoots(): Promise<void>
  listLayoutVersions(): Promise<number[]>
  inspectInventory(): Promise<FilesystemEntry[]>
  listReferenced(relativePaths: readonly string[]): Promise<MediaPresence[]>
  reconcileUnreferenced(referencedRelativePaths: readonly string[]): Promise<void>
  cleanRecognizedStale(): Promise<void>
  applyBackupControls(): Promise<void>
}

export type LayoutMigrationPort = {
  readJournal(): Promise<LayoutMigrationRecord | null>
  writeJournal(record: LayoutMigrationRecord): Promise<void>
  clearJournal(): Promise<void>
  copyLayout(sourceLayout: number, targetLayout: number): Promise<void>
  validateCopy(sourceLayout: number, targetLayout: number): Promise<boolean>
  switchTo(targetLayout: number): Promise<void>
  removeSourceLayout(sourceLayout: number): Promise<void>
}

/**
 * Resumes a journaled filesystem migration. A newer target than this binary
 * understands is refused without writing. Source files are removed only after
 * a validated switch; any earlier failure keeps the journal for retry.
 */
export async function resumeFilesystemMigration(
  port: LayoutMigrationPort,
  supportedLayout: number,
): Promise<'idle' | 'completed'> {
  const journal = await port.readJournal()
  if (!journal) return 'idle'
  if (journal.targetLayout > supportedLayout) {
    throw new StorageGateError('version-unsafe')
  }

  const advance = async (phase: LayoutMigrationPhase) => {
    await port.writeJournal({ ...journal, phase })
    journal.phase = phase
  }

  try {
    if (journal.phase === 'prepared') {
      await port.copyLayout(journal.sourceLayout, journal.targetLayout)
      await advance('copied')
    }
    if (journal.phase === 'copied') {
      const valid = await port.validateCopy(journal.sourceLayout, journal.targetLayout)
      if (!valid) throw new StorageGateError('version-unsafe')
      await advance('validated')
    }
    if (journal.phase === 'validated') {
      await port.switchTo(journal.targetLayout)
      await advance('switched')
    }
    if (journal.phase === 'switched') {
      await port.removeSourceLayout(journal.sourceLayout)
      await port.clearJournal()
    }
    return 'completed'
  } catch (error) {
    if (error instanceof StorageGateError) throw error
    throw new StorageGateError('version-unsafe')
  }
}
