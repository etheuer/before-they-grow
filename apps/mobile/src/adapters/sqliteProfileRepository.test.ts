import {
  StorageGateError,
  type ProfileRepositoryPort,
} from '@before-they-grow/application'
import type { NativeProfileV1 } from '@before-they-grow/contracts'
import {
  createSqliteProfileRepository,
  type SqliteClientPort,
  type SqliteTransactionPort,
} from './sqliteProfileRepository'
import type { BackupExclusionPort } from './backupExclusion'

const USER_VERSION = 1
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

function fakeClient(initial: FakeOptions = {}): SqliteClientPort & {
  state: {
    userVersion: number
    opened: boolean
    closed: boolean
    rows: Row[]
    integrity: 'ok' | 'failed'
    tables: Set<string>
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
    tables: new Set<string>(),
  }
  const client = {
    state,
    async open() {
      state.opened = true
    },
    async close() {
      state.closed = true
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
      if (!sql.includes('CREATE TABLE')) throw new Error(`Unexpected non-DDL: ${sql}`)
      if (sql.includes('profiles')) state.tables.add('profiles')
    },
    async getAll<T>(sql: string, _params?: readonly unknown[]) {
      if (sql.includes('COUNT(*)')) {
        return [{ n: state.rows.length }] as T[]
      }
      if (sql.includes('FROM profiles')) {
        return state.rows as unknown as T[]
      }
      throw new Error(`Unexpected query: ${sql}`)
    },
    async transaction<T>(block: (txn: SqliteTransactionPort) => Promise<T>) {
      const txn: SqliteTransactionPort = {
        async run(sql: string, params: readonly unknown[] = []) {
          if (sql.includes('CREATE TABLE')) {
            state.tables.add('profiles')
            return
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
      return block(txn)
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
    async isExcluded() {
      return true
    },
  }
  return exclusion
}

function repository(client: SqliteClientPort, exclusion: BackupExclusionPort): ProfileRepositoryPort {
  return createSqliteProfileRepository({
    client,
    exclusion,
    userVersion: USER_VERSION,
    expectedDatabaseFileName: DATABASE_NAME,
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
})