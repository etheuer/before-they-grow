jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock/private/',
  cacheDirectory: 'file:///mock/cache/',
}))

import { Directory, File } from 'expo-file-system'
import {
  SaveCapacityError,
  SaveIndeterminateError,
  StorageGateError,
  resumeFilesystemMigration,
} from '@before-they-grow/application'
import { createExpoMediaStorePort, layoutMigrationJournalName } from './expoMediaStore'
import type { BackupExclusionPort } from './backupExclusion'

function exclusion(): BackupExclusionPort & { allowed: boolean; applied: string[] } {
  const state: BackupExclusionPort & { allowed: boolean; applied: string[] } = {
    allowed: true,
    applied: [],
    async apply(path: string) {
      state.applied.push(path)
      return state.allowed
    },
  }
  return state
}

function cacheFile(name: string): File {
  const file = new File(`file:///mock/cache/${name}`)
  if (!file.exists) file.create({ intermediates: true })
  file.write('audio')
  return file
}

describe('createExpoMediaStorePort', () => {
  afterEach(async () => {
    const family = new Directory('file:///mock/private/BeforeTheyGrow')
    if (family.exists) await family.delete()
  })

  it('turns a failed post-move backup exclusion check into Indeterminate and reconciles it later', async () => {
    const gate = exclusion()
    gate.allowed = false
    const store = createExpoMediaStorePort(gate)
    const source = cacheFile('reliability-gate.m4a')

    await expect(store.commit(source.uri, 'media/reliability-gate.m4a')).rejects.toEqual(
      new SaveIndeterminateError('backup-control-failed'),
    )

    const final = new File('file:///mock/private/BeforeTheyGrow/layout-v1/media/reliability-gate.m4a')
    expect(final.exists).toBe(true)

    gate.allowed = true
    await expect(store.reconcileFinal?.('media/reliability-gate.m4a')).resolves.toBe(true)
    await store.removeFinal('media/reliability-gate.m4a')
    expect(final.exists).toBe(false)
  })

  it('refuses to overwrite an existing managed final and reports low preflight capacity', async () => {
    const gate = exclusion()
    const store = createExpoMediaStorePort(gate)
    const source = cacheFile('reliability-existing.m4a')
    await store.commit(source.uri, 'media/reliability-existing.m4a')

    const retrySource = cacheFile('reliability-existing-retry.m4a')
    await expect(store.commit(retrySource.uri, 'media/reliability-existing.m4a')).rejects.toEqual(
      new SaveIndeterminateError('media-commit-uncertain'),
    )
    await expect(store.preflight?.(Number.MAX_SAFE_INTEGER)).rejects.toBeInstanceOf(SaveCapacityError)
    await store.removeFinal('media/reliability-existing.m4a')
  })

  it('removes a cancelled cache recording without touching managed media', async () => {
    const gate = exclusion()
    const store = createExpoMediaStorePort(gate)
    const source = cacheFile('reliability-cancel.m4a')
    await store.removeCache?.(source.uri)
    expect(source.exists).toBe(false)
  })

  it('reports missing and wrong-size referenced finals without deleting them', async () => {
    const store = createExpoMediaStorePort(exclusion())
    await store.verifyRoots()
    const present = cacheFile('present.m4a')
    await store.commit(present.uri, 'media/present.m4a')

    const listed = await store.listReferenced([
      'media/present.m4a',
      'media/missing.m4a',
    ])
    const presentFile = new File('file:///mock/private/BeforeTheyGrow/layout-v1/media/present.m4a')
    presentFile.write('abcd')

    const afterResize = await store.listReferenced(['media/present.m4a'])
    expect(listed).toEqual([
      { relativePath: 'media/present.m4a', exists: true, byteCount: expect.any(Number) },
      { relativePath: 'media/missing.m4a', exists: false, byteCount: 0 },
    ])
    expect(afterResize[0]).toEqual({
      relativePath: 'media/present.m4a',
      exists: true,
      byteCount: 4,
    })
    expect(presentFile.exists).toBe(true)
    await store.removeFinal('media/present.m4a')
  })

  it('removes recognized unreferenced finals and recognized stale files only after a valid layout', async () => {
    const store = createExpoMediaStorePort(exclusion())
    await store.verifyRoots()
    const kept = cacheFile('kept.m4a')
    const orphan = cacheFile('orphan.m4a')
    await store.commit(kept.uri, 'media/kept.m4a')
    await store.commit(orphan.uri, 'media/orphan.m4a')
    const stale = new File('file:///mock/private/BeforeTheyGrow/layout-v1/media/.stale-cache.m4a')
    stale.create({ intermediates: true })
    stale.write('old')
    const staging = new File('file:///mock/private/BeforeTheyGrow/layout-v1/media/.staging-op1')
    staging.create({ intermediates: true })
    staging.write('tmp')
    const unknown = new File('file:///mock/private/BeforeTheyGrow/layout-v1/media/notes.txt')
    unknown.create({ intermediates: true })
    unknown.write('keep-unknown')

    await store.reconcileUnreferenced(['media/kept.m4a'])
    await store.cleanRecognizedStale()

    expect(new File('file:///mock/private/BeforeTheyGrow/layout-v1/media/kept.m4a').exists).toBe(true)
    expect(new File('file:///mock/private/BeforeTheyGrow/layout-v1/media/orphan.m4a').exists).toBe(false)
    expect(stale.exists).toBe(false)
    expect(staging.exists).toBe(false)
    expect(unknown.exists).toBe(true)
    await store.removeFinal('media/kept.m4a')
    await unknown.delete()
  })

  it('classifies an unknown file as unknown and leaves recognized catalog files alone', async () => {
    const store = createExpoMediaStorePort(exclusion())
    await store.verifyRoots()
    const mystery = new File('file:///mock/private/BeforeTheyGrow/surprise.bin')
    mystery.create({ intermediates: true })
    mystery.write('x')

    const inventory = await store.inspectInventory()
    expect(inventory.some((entry) => entry.relativePath === 'surprise.bin' && entry.kind === 'unknown')).toBe(true)

    await mystery.delete()
  })

  it('blocks verifyRoots when a newer layout is already on disk and does not create the current one', async () => {
    const future = new Directory('file:///mock/private/BeforeTheyGrow/layout-v2')
    future.create({ idempotent: true, intermediates: true })
    const store = createExpoMediaStorePort(exclusion())

    await expect(store.verifyRoots()).rejects.toEqual(new StorageGateError('version-unsafe'))
    expect(new Directory('file:///mock/private/BeforeTheyGrow/layout-v1').exists).toBe(false)

    await future.delete()
  })

  it('keeps the layout-migration journal opaque and resumes a same-version copy without family names', async () => {
    const store = createExpoMediaStorePort(exclusion())
    await store.verifyRoots()
    const source = cacheFile('migrate.m4a')
    await store.commit(source.uri, 'media/migrate.m4a')

    await store.writeJournal({
      operationId: 'op-layout-1',
      sourceLayout: 1,
      targetLayout: 1,
      phase: 'prepared',
    })
    const journal = new File(`file:///mock/private/BeforeTheyGrow/${layoutMigrationJournalName}`)
    expect(journal.exists).toBe(true)
    const body = await journal.text()
    expect(body).not.toMatch(/Mila|transcript|prompt/i)
    expect(JSON.parse(body)).toEqual({
      operationId: 'op-layout-1',
      sourceLayout: 1,
      targetLayout: 1,
      phase: 'prepared',
    })

    expect(await resumeFilesystemMigration(store, 1)).toBe('completed')
    expect(journal.exists).toBe(false)
    await store.removeFinal('media/migrate.m4a')
  })

  it('refuses a journal aimed at a future layout without copying or switching', async () => {
    const store = createExpoMediaStorePort(exclusion())
    await store.verifyRoots()
    await store.writeJournal({
      operationId: 'op-future',
      sourceLayout: 1,
      targetLayout: 2,
      phase: 'prepared',
    })

    await expect(resumeFilesystemMigration(store, 1)).rejects.toEqual(
      new StorageGateError('version-unsafe'),
    )
    expect(new Directory('file:///mock/private/BeforeTheyGrow/layout-v2').exists).toBe(false)
    expect(await store.readJournal()).toEqual({
      operationId: 'op-future',
      sourceLayout: 1,
      targetLayout: 2,
      phase: 'prepared',
    })
    await store.clearJournal()
  })

  it('treats a checksum mismatch at playback as unavailable without deleting the file', async () => {
    const store = createExpoMediaStorePort(exclusion())
    await store.verifyRoots()
    const source = cacheFile('play.m4a')
    await store.commit(source.uri, 'media/play.m4a')
    const final = new File('file:///mock/private/BeforeTheyGrow/layout-v1/media/play.m4a')

    const health = await store.verifyPlayback('media/play.m4a', {
      byteCount: final.size ?? 0,
      sha256: 'not-the-real-digest',
    })
    expect(health).toBe('checksum-mismatch')
    expect(final.exists).toBe(true)
    await store.removeFinal('media/play.m4a')
  })
})
