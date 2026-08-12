import {
  StorageGateError,
  type FilesystemEntry,
  type MediaPresence,
  type ProfileRepositoryPort,
  type StorageInventoryPort,
} from '@before-they-grow/application'
import type { NativeProfileV1 } from '@before-they-grow/contracts'
import { createSqliteProfileRepository, type SqliteClientPort, type SqliteTransactionPort } from './sqliteProfileRepository'
import {
  DATABASE_DDL_V2,
  DELETION_OPERATIONS_TABLE,
  MEMORIES_TABLE,
  PROFILES_TABLE,
  SAVE_OPERATIONS_TABLE,
} from './sqliteSchema'
import type { BackupExclusionPort } from './backupExclusion'

const USER_VERSION = 2
const DATABASE_NAME = 'profile-v1.db'

type Row = {
  id: string
  child_nickname: string
  age_band: string
  consented_at: string
  created_at: string
}

type FakeOptions = {
  userVersion?: number
  integrity?: 'ok' | 'failed'
  opened?: boolean
  mainDatabasePath?: string
}

type MediaRow = {
  id: string
  media_ref: string | null
  media_byte_count: number | null
  media_sha256: string | null
}

function applyExec(state: { userVersion: number; tables: Set<string> }, sql: string) {
  const pragma = /PRAGMA user_version\s*=\s*(\d+)/i.exec(sql)
  if (pragma) {
    state.userVersion = Number(pragma[1])
    return
  }
  if (sql.includes('memories_v2')) {
    state.tables.add(MEMORIES_TABLE)
    state.tables.add(SAVE_OPERATIONS_TABLE)
    state.tables.add(DELETION_OPERATIONS_TABLE)
    return
  }
  if (!sql.includes('CREATE TABLE')) throw new Error(`Unexpected non-DDL exec: ${sql}`)
  for (const statement of DATABASE_DDL_V2.split(';')) {
    if (statement.includes(PROFILES_TABLE)) state.tables.add(PROFILES_TABLE)
    if (statement.includes(MEMORIES_TABLE)) state.tables.add(MEMORIES_TABLE)
    if (statement.includes(SAVE_OPERATIONS_TABLE)) state.tables.add(SAVE_OPERATIONS_TABLE)
    if (statement.includes(DELETION_OPERATIONS_TABLE)) state.tables.add(DELETION_OPERATIONS_TABLE)
  }
}

function fakeClient(initial: FakeOptions = {}): SqliteClientPort & {
  state: {
    userVersion: number
    opened: boolean
    closed: boolean
    rows: Row[]
    mediaRows: MediaRow[]
    integrity: 'ok' | 'failed'
    tables: Set<string>
    migrationFailure: Error | null
  }
} {
  const mainPath =
    initial.mainDatabasePath ?? `/documents/BeforeTheyGrow/layout-v1/${DATABASE_NAME}`
  const state = {
    userVersion: initial.userVersion ?? USER_VERSION,
    integrity: initial.integrity ?? 'ok' as 'ok' | 'failed',
    opened: initial.opened ?? false,
    closed: false,
    rows: [] as Row[],
    mediaRows: [] as MediaRow[],
    tables: new Set<string>(),
    migrationFailure: null as Error | null,
  }
  const client = {
    state,
    async open() {
      state.opened = true
    },
    async close() {
      state.closed = true
    },
    isOpen() {
      return state.opened && !state.closed
    },
    async getUserVersion() {
      return state.userVersion
    },
    async setUserVersion(version: number) {
      state.userVersion = version
    },
    async integrityCheck() {
      return state.integrity
    },
    async tableExists(name: string) {
      return state.tables.has(name)
    },
    async run(sql: string) {
      if (sql.includes('CREATE TABLE')) {
        throw new Error('DDL must go through exec, not run')
      }
    },
    async exec(sql: string) {
      applyExec(state, sql)
    },
    async getAll<T>(sql: string, _params?: readonly unknown[]) {
      if (sql.includes('COUNT(*)')) {
        return [{ n: state.rows.length }] as T[]
      }
      if (sql.includes('FROM profiles')) {
        return state.rows as unknown as T[]
      }
      if (sql.includes('FROM memories') && sql.includes('media_ref')) {
        return state.mediaRows.filter((row) => row.media_ref !== null) as unknown as T[]
      }
      throw new Error(`Unexpected query: ${sql}`)
    },
    async transaction<T>(block: (txn: SqliteTransactionPort) => Promise<T>) {
      const versionBefore = state.userVersion
      const tablesBefore = new Set(state.tables)
      const rowsBefore = state.rows.map((row) => ({ ...row }))
      const mediaBefore = state.mediaRows.map((row) => ({ ...row }))
      const txn: SqliteTransactionPort = {
        async exec(sql: string) {
          applyExec(state, sql)
        },
        async run(sql: string, params: readonly unknown[] = []) {
          if (sql.includes('CREATE TABLE')) {
            throw new Error('DDL must go through exec, not run')
          }
          if (sql.includes('INSERT INTO profiles')) {
            const [id, child_nickname, age_band, consented_at, created_at] = params
            state.rows.push({
              id: String(id),
              child_nickname: String(child_nickname),
              age_band: String(age_band),
              consented_at: String(consented_at),
              created_at: String(created_at),
            })
            return
          }
          throw new Error(`Unexpected txn statement: ${sql}`)
        },
        async getAll<T2>(sql: string) {
          if (sql.includes('COUNT(*)')) return [{ n: state.rows.length }] as T2[]
          throw new Error(`Unexpected txn query: ${sql}`)
        },
      }
      try {
        const result = await block(txn)
        if (state.migrationFailure) {
          const failure = state.migrationFailure
          state.migrationFailure = null
          throw failure
        }
        return result
      } catch (error) {
        state.userVersion = versionBefore
        state.tables = tablesBefore
        state.rows = rowsBefore
        state.mediaRows = mediaBefore
        throw error
      }
    },
    // Mirrors the real edge: the main catalog plus transient WAL/SHM
    // siblings are always candidates for per-resource backup exclusion.
    existingDatabasePaths() {
      return [mainPath, `${mainPath}-wal`, `${mainPath}-shm`]
    },
  }
  return client
}

type FakeExclusion = BackupExclusionPort & {
  applied: string[]
  failNext: boolean
}

function fakeExclusion(): FakeExclusion {
  const exclusion: FakeExclusion = {
    applied: [],
    failNext: false,
    async apply(path) {
      if (exclusion.failNext) {
        exclusion.failNext = false
        return false
      }
      exclusion.applied.push(path)
      return true
    },
  }
  return exclusion
}

function fakeInventory(): StorageInventoryPort & {
  rootsChecked: boolean
  cleaned: string[]
  unreferenced: string[][]
  backupApplied: number
  entries: FilesystemEntry[]
  presence: MediaPresence[]
  versions: number[]
  rootError: Error | null
} {
  const inventory: StorageInventoryPort & {
    rootsChecked: boolean
    cleaned: string[]
    unreferenced: string[][]
    backupApplied: number
    entries: FilesystemEntry[]
    presence: MediaPresence[]
    versions: number[]
    rootError: Error | null
  } = {
    rootsChecked: false,
    cleaned: [],
    unreferenced: [],
    backupApplied: 0,
    entries: [],
    presence: [],
    versions: [1],
    rootError: null,
    async verifyRoots() {
      inventory.rootsChecked = true
      if (inventory.rootError) throw inventory.rootError
    },
    async listLayoutVersions() {
      return [...inventory.versions]
    },
    async inspectInventory() {
      return [...inventory.entries]
    },
    async listReferenced() {
      return [...inventory.presence]
    },
    async reconcileUnreferenced(referenced) {
      inventory.unreferenced.push([...referenced])
    },
    async cleanRecognizedStale() {
      inventory.cleaned.push('stale')
    },
    async applyBackupControls() {
      inventory.backupApplied += 1
    },
  }
  return inventory
}

function repository(
  client: SqliteClientPort,
  exclusion: BackupExclusionPort,
  inventory?: StorageInventoryPort,
): ProfileRepositoryPort {
  return createSqliteProfileRepository({
    client,
    exclusion,
    userVersion: USER_VERSION,
    expectedDatabaseFileName: DATABASE_NAME,
    inventory,
  })
}

const profile: NativeProfileV1 = {
  id: 'profile-1',
  childNickname: 'Mila',
  ageBand: '6-8',
  consentedAt: '2026-08-11T22:05:00.000Z',
  createdAt: '2026-08-11T22:05:00.000Z',
}

describe('createSqliteProfileRepository', () => {
  it('bootstraps an empty catalog: integrity, schema, user version, exclusions', async () => {
    const client = fakeClient({ userVersion: 0 })
    const exclusion = fakeExclusion()
    const repo = repository(client, exclusion)

    await repo.open()

    expect(client.state.opened).toBe(true)
    expect(client.state.userVersion).toBe(USER_VERSION)
    expect(client.state.tables.has('profiles')).toBe(true)
    expect(exclusion.applied).toEqual([
      '/documents/BeforeTheyGrow/layout-v1/profile-v1.db',
      '/documents/BeforeTheyGrow/layout-v1/profile-v1.db-wal',
      '/documents/BeforeTheyGrow/layout-v1/profile-v1.db-shm',
    ])
  })

  it('accepts an already-versioned catalog without rewriting it', async () => {
    const client = fakeClient({ userVersion: USER_VERSION })
    const exclusion = fakeExclusion()
    client.state.tables.add('profiles')
    client.state.tables.add('memories')

    await repository(client, exclusion).open()

    expect(client.state.userVersion).toBe(USER_VERSION)
    expect(exclusion.applied.length).toBeGreaterThan(0)
  })

  it('blocks a catalog whose user version is newer', async () => {
    const client = fakeClient({ userVersion: USER_VERSION + 1 })
    const exclusion = fakeExclusion()
    const repo = repository(client, exclusion)

    await expect(repo.open()).rejects.toEqual(new StorageGateError('version-unsafe'))
    expect(client.state.closed).toBe(true)
  })

  it('blocks a versioned catalog that lost its schema table', async () => {
    const client = fakeClient({ userVersion: USER_VERSION })
    const exclusion = fakeExclusion()
    const repo = repository(client, exclusion)

    await expect(repo.open()).rejects.toEqual(new StorageGateError('version-unsafe'))
  })

  it('upgrades a pre-memory v1 catalog by adding only the memories table', async () => {
    const client = fakeClient({ userVersion: 1 })
    const exclusion = fakeExclusion()
    client.state.tables.add('profiles')

    await repository(client, exclusion).open()

    expect(client.state.userVersion).toBe(USER_VERSION)
    expect(client.state.tables.has('profiles')).toBe(true)
    expect(client.state.tables.has('memories')).toBe(true)
  })

  it('migrates a v1 catalog that already has a memories table to v2 in place', async () => {
    const client = fakeClient({ userVersion: 1 })
    const exclusion = fakeExclusion()
    client.state.tables.add('profiles')
    client.state.tables.add('memories')

    await repository(client, exclusion).open()

    expect(client.state.userVersion).toBe(USER_VERSION)
    expect(client.state.tables.has('profiles')).toBe(true)
    expect(client.state.tables.has('memories')).toBe(true)
  })

  it('blocks a catalog at an unexpected database file name', async () => {
    const client = fakeClient({
      userVersion: 0,
      mainDatabasePath: '/documents/BeforeTheyGrow/layout-v1/other.db',
    })
    const exclusion = fakeExclusion()
    const repo = repository(client, exclusion)

    await expect(repo.open()).rejects.toEqual(new StorageGateError('version-unsafe'))
  })

  it('blocks when integrity check fails and closes the client', async () => {
    const client = fakeClient({ integrity: 'failed' })
    const exclusion = fakeExclusion()
    const repo = repository(client, exclusion)

    await expect(repo.open()).rejects.toEqual(new StorageGateError('integrity-failed'))
    expect(client.state.closed).toBe(true)
  })

  it('blocks when a resource cannot be excluded from backup', async () => {
    const client = fakeClient({ userVersion: USER_VERSION })
    const exclusion = fakeExclusion()
    client.state.tables.add('profiles')
    exclusion.failNext = true

    await expect(repository(client, exclusion).open()).rejects.toEqual(
      new StorageGateError('backup-control-failed'),
    )
    expect(client.state.closed).toBe(true)
  })

  it('re-runs full verification on retry after a failed open, reporting the true blocked reason', async () => {
    const client = fakeClient({ userVersion: USER_VERSION })
    client.state.tables.add('profiles')
    const exclusion = fakeExclusion()
    const repo = repository(client, exclusion)
    exclusion.failNext = true

    await expect(repo.open()).rejects.toEqual(new StorageGateError('backup-control-failed'))

    // A retry must re-verify rather than stay closed and misreport the cause.
    await repo.open()
    expect(await repo.findOnly()).toBeNull()
  })

  it('persists one profile and returns it with the v1 column mapping', async () => {
    const client = fakeClient({ userVersion: USER_VERSION })
    const exclusion = fakeExclusion()
    client.state.tables.add('profiles')
    const repo = repository(client, exclusion)
    await repo.open()

    expect(await repo.create(profile)).toBe('created')
    expect(await repo.findOnly()).toEqual(profile)
  })

  it('never stores a second profile', async () => {
    const client = fakeClient({ userVersion: USER_VERSION })
    client.state.tables.add('profiles')
    const repo = repository(client, fakeExclusion())
    await repo.open()

    expect(await repo.create(profile)).toBe('created')
    expect(await repo.create({ ...profile, id: 'profile-2', childNickname: 'Milo' })).toBe(
      'already-exists',
    )
    expect(await repo.findOnly()).toEqual(profile)
  })

  it('reapplies exclusions after the first commit so WAL/SHM siblings are always covered', async () => {
    const client = fakeClient({ userVersion: USER_VERSION })
    client.state.tables.add('profiles')
    const exclusion = fakeExclusion()
    const repo = repository(client, exclusion)
    await repo.open()
    const before = exclusion.applied.length

    await repo.create(profile)

    expect(exclusion.applied.length).toBeGreaterThan(before)
    expect(exclusion.applied).toContain('/documents/BeforeTheyGrow/layout-v1/profile-v1.db')
    expect(exclusion.applied).toContain('/documents/BeforeTheyGrow/layout-v1/profile-v1.db-wal')
    expect(exclusion.applied).toContain('/documents/BeforeTheyGrow/layout-v1/profile-v1.db-shm')
  })

  it('returns null for an empty catalog', async () => {
    const client = fakeClient({ userVersion: USER_VERSION })
    client.state.tables.add('profiles')
    const repo = repository(client, fakeExclusion())
    await repo.open()

    expect(await repo.findOnly()).toBeNull()
  })

  it('blocks reads and writes before open', async () => {
    const client = fakeClient({ userVersion: USER_VERSION })
    const repo = repository(client, fakeExclusion())

    await expect(repo.findOnly()).rejects.toEqual(new StorageGateError('integrity-failed'))
    await expect(repo.create(profile)).rejects.toEqual(new StorageGateError('integrity-failed'))
  })

  it('rolls back a failed forward migration and leaves the existing catalog untouched', async () => {
    const client = fakeClient({ userVersion: 1 })
    client.state.tables.add('profiles')
    client.state.tables.add('memories')
    client.state.migrationFailure = new Error('disk full during migration')
    const repo = repository(client, fakeExclusion())

    await expect(repo.open()).rejects.toEqual(new StorageGateError('version-unsafe'))
    expect(client.state.userVersion).toBe(1)
    expect(client.state.tables.has('profiles')).toBe(true)
    expect(client.state.closed).toBe(true)
  })

  it('refuses a newer user version without writing schema or advancing the version', async () => {
    const client = fakeClient({ userVersion: USER_VERSION + 3 })
    const exclusion = fakeExclusion()
    const repo = repository(client, exclusion)

    await expect(repo.open()).rejects.toEqual(new StorageGateError('version-unsafe'))
    expect(client.state.userVersion).toBe(USER_VERSION + 3)
    expect(client.state.tables.size).toBe(0)
    expect(exclusion.applied).toEqual([])
  })

  it('does not clean stale files when integrity fails', async () => {
    const client = fakeClient({ integrity: 'failed' })
    const inventory = fakeInventory()
    inventory.entries = [
      { relativePath: 'media/.stale-cache.m4a', byteCount: 8, kind: 'recognized-stale' },
    ]
    const repo = repository(client, fakeExclusion(), inventory)

    await expect(repo.open()).rejects.toEqual(new StorageGateError('integrity-failed'))
    expect(inventory.cleaned).toEqual([])
    expect(inventory.unreferenced).toEqual([])
  })

  it('blocks an unknown file and never deletes it', async () => {
    const client = fakeClient({ userVersion: USER_VERSION })
    client.state.tables.add('profiles')
    client.state.tables.add('memories')
    client.state.tables.add('save_operations')
    const inventory = fakeInventory()
    inventory.entries = [
      { relativePath: 'media/notes.txt', byteCount: 12, kind: 'unknown' },
    ]
    const repo = repository(client, fakeExclusion(), inventory)

    await expect(repo.open()).rejects.toEqual(new StorageGateError('root-unsafe'))
    expect(inventory.cleaned).toEqual([])
    expect(inventory.unreferenced).toEqual([])
  })

  it('keeps a missing referenced file as an Unavailable memory and then cleans recognized stale files', async () => {
    const client = fakeClient({ userVersion: USER_VERSION })
    client.state.tables.add('profiles')
    client.state.tables.add('memories')
    client.state.tables.add('save_operations')
    client.state.mediaRows.push({
      id: 'memory-voice-1',
      media_ref: 'media/memory-voice-1.m4a',
      media_byte_count: 1000,
      media_sha256: 'deadbeef',
    })
    const inventory = fakeInventory()
    inventory.presence = [
      { relativePath: 'media/memory-voice-1.m4a', exists: false, byteCount: 0 },
    ]
    inventory.entries = [
      { relativePath: 'media/.stale-cache.m4a', byteCount: 8, kind: 'recognized-stale' },
      { relativePath: 'media/orphan.m4a', byteCount: 40, kind: 'recognized-final' },
    ]
    const repo = createSqliteProfileRepository({
      client,
      exclusion: fakeExclusion(),
      userVersion: USER_VERSION,
      expectedDatabaseFileName: DATABASE_NAME,
      inventory,
    })

    await repo.open()

    expect(repo.consumeUnavailable()).toEqual([
      { memoryId: 'memory-voice-1', reason: 'missing-file' },
    ])
    expect(inventory.cleaned).toEqual(['stale'])
    expect(inventory.unreferenced).toEqual([]) // deferred post-MVP
  })

  it('reports a wrong-size referenced file as unavailable and does not recreate the catalog', async () => {
    const client = fakeClient({ userVersion: USER_VERSION })
    client.state.tables.add('profiles')
    client.state.tables.add('memories')
    client.state.tables.add('save_operations')
    client.state.mediaRows.push({
      id: 'memory-voice-1',
      media_ref: 'media/memory-voice-1.m4a',
      media_byte_count: 1000,
      media_sha256: 'deadbeef',
    })
    const inventory = fakeInventory()
    inventory.presence = [
      { relativePath: 'media/memory-voice-1.m4a', exists: true, byteCount: 4 },
    ]
    inventory.entries = [
      { relativePath: 'media/memory-voice-1.m4a', byteCount: 4, kind: 'recognized-final' },
    ]
    const repo = createSqliteProfileRepository({
      client,
      exclusion: fakeExclusion(),
      userVersion: USER_VERSION,
      expectedDatabaseFileName: DATABASE_NAME,
      inventory,
    })

    await repo.open()

    expect(repo.consumeUnavailable()).toEqual([
      { memoryId: 'memory-voice-1', reason: 'wrong-size' },
    ])
    expect(client.state.userVersion).toBe(USER_VERSION)
  })

  it('blocks a future layout version discovered on disk before cleanup', async () => {
    const client = fakeClient({ userVersion: USER_VERSION })
    client.state.tables.add('profiles')
    const inventory = fakeInventory()
    inventory.versions = [1, 2]
    const repo = repository(client, fakeExclusion(), inventory)

    await expect(repo.open()).rejects.toEqual(new StorageGateError('version-unsafe'))
    expect(inventory.cleaned).toEqual([])
  })

  it('checks canonical roots before opening the catalog', async () => {
    const client = fakeClient({ userVersion: USER_VERSION })
    const inventory = fakeInventory()
    inventory.rootError = new StorageGateError('root-unsafe')
    const repo = repository(client, fakeExclusion(), inventory)

    await expect(repo.open()).rejects.toEqual(new StorageGateError('root-unsafe'))
    expect(client.state.opened).toBe(false)
    expect(inventory.rootsChecked).toBe(true)
  })
})