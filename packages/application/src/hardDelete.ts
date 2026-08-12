import type { MemoryEntryV1 } from '@before-they-grow/contracts'
import type { MediaStorePort } from './capture'
import { StorageGateError } from './profile'

export type IndividualDeletionPhase = 'marked' | 'media-removed' | 'rows-deleted'

export type IndividualDeletionRecord = {
  memoryId: string
  relativePath: string | null
  phase: IndividualDeletionPhase
}

/**
 * Catalog-side hard-deletion journal. Marking is transactional and hides the
 * memory from the timeline; later phases resume after process death.
 */
export type IndividualDeletionPort = {
  findById(id: string): Promise<MemoryEntryV1 | null>
  markDeleting(id: string): Promise<IndividualDeletionRecord | 'missing'>
  listPending(): Promise<IndividualDeletionRecord[]>
  advancePhase(memoryId: string, phase: IndividualDeletionPhase): Promise<void>
  removeRows(memoryId: string): Promise<void>
  checkpoint(): Promise<void>
  verifyAbsent(memoryId: string): Promise<boolean>
  clear(memoryId: string): Promise<void>
}

/**
 * Non-family-bearing wipe marker plus the filesystem/catalog teardown used by
 * delete-everything. The marker is the only durable signal a relaunch needs.
 */
export type FamilyWipePort = {
  markerPresent(): Promise<boolean>
  writeMarker(): Promise<void>
  clearMarker(): Promise<void>
  closeCatalog(): Promise<void>
  wipeFamilyContent(): Promise<void>
  verifyWiped(): Promise<boolean>
}

export type HardDeleteMemoryDeps = {
  deletion: IndividualDeletionPort
  mediaStore?: Pick<MediaStorePort, 'removeFinal'>
}

export type FamilyWipeDeps = {
  wipe: FamilyWipePort
}

function asDeletionError(error: unknown): never {
  if (error instanceof StorageGateError) throw error
  throw new StorageGateError('deletion-incomplete')
}

async function finishIndividualDeletion(
  deps: HardDeleteMemoryDeps,
  record: IndividualDeletionRecord,
): Promise<void> {
  try {
    if (record.phase === 'marked') {
      if (record.relativePath && deps.mediaStore) {
        await deps.mediaStore.removeFinal(record.relativePath)
      }
      await deps.deletion.advancePhase(record.memoryId, 'media-removed')
      record.phase = 'media-removed'
    }
    if (record.phase === 'media-removed') {
      await deps.deletion.removeRows(record.memoryId)
      await deps.deletion.advancePhase(record.memoryId, 'rows-deleted')
      record.phase = 'rows-deleted'
    }
    if (record.phase === 'rows-deleted') {
      await deps.deletion.checkpoint()
      const absent = await deps.deletion.verifyAbsent(record.memoryId)
      if (!absent) throw new StorageGateError('deletion-incomplete')
      await deps.deletion.clear(record.memoryId)
    }
  } catch (error) {
    asDeletionError(error)
  }
}

/**
 * Irreversible removal of one Local-only memory. Success is reported only
 * after the catalog row and media are gone and the WAL has been truncated.
 */
export async function hardDeleteMemory(
  deps: HardDeleteMemoryDeps,
  id: string,
): Promise<'deleted' | 'missing'> {
  let record: IndividualDeletionRecord | 'missing'
  try {
    record = await deps.deletion.markDeleting(id)
  } catch (error) {
    asDeletionError(error)
  }
  if (record === 'missing') return 'missing'
  await finishIndividualDeletion(deps, record)
  return 'deleted'
}

/** Continues every interrupted individual deletion before family content is shown. */
export async function resumeIndividualDeletions(deps: HardDeleteMemoryDeps): Promise<void> {
  const pending = await deps.deletion.listPending()
  for (const record of pending) {
    await finishIndividualDeletion(deps, record)
  }
}

async function finishFamilyWipe(wipe: FamilyWipePort): Promise<void> {
  try {
    await wipe.closeCatalog()
    await wipe.wipeFamilyContent()
    const gone = await wipe.verifyWiped()
    if (!gone) throw new StorageGateError('deletion-incomplete')
    await wipe.clearMarker()
  } catch (error) {
    asDeletionError(error)
  }
}

/**
 * Hard local deletion of the profile, transcripts, recordings, and other
 * family-bearing local content. A marker is written first so relaunch can
 * finish the wipe instead of showing a partial library.
 */
export async function deleteAllFamilyContent(deps: FamilyWipeDeps): Promise<'deleted'> {
  try {
    if (!(await deps.wipe.markerPresent())) {
      await deps.wipe.writeMarker()
    }
  } catch (error) {
    asDeletionError(error)
  }
  await finishFamilyWipe(deps.wipe)
  return 'deleted'
}

/**
 * If a wipe marker is present, finishes deletion before an empty store unlocks.
 * Never exposes leftover family content.
 */
export async function resumeFamilyWipe(deps: FamilyWipeDeps): Promise<'idle' | 'deleted'> {
  if (!(await deps.wipe.markerPresent())) return 'idle'
  await finishFamilyWipe(deps.wipe)
  return 'deleted'
}
