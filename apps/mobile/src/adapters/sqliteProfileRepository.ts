import type { AgeBand } from '@before-they-grow/domain'
import {
  StorageGateError,
  type ProfileRepositoryPort,
} from '@before-they-grow/application'
import type { NativeProfileV1 } from '@before-they-grow/contracts'
import type { BackupExclusionPort } from './backupExclusion'

/**
 * Narrows the expo-sqlite surface to exactly what the profile catalog needs,
 * so the repository contract can be exercised against a deterministic fake in
 * tests and against the real database in a custom development build.
 */
export type SqliteTransactionPort = {
  run(sql: string, params?: readonly unknown[]): Promise<void>
  getAll<T>(sql: string, params?: readonly unknown[]): Promise<T[]>
}

export type SqliteClientPort = {
  open(): Promise<void>
  close(): Promise<void>
  getUserVersion(): Promise<number>
  setUserVersion(version: number): Promise<void>
  integrityCheck(): Promise<'ok' | 'failed'>
  tableExists(name: string): Promise<boolean>
  run(sql: string, params?: readonly unknown[]): Promise<void>
  getAll<T>(sql: string, params?: readonly unknown[]): Promise<T[]>
  /** Runs a block inside one exclusive transaction. */
  transaction<T>(block: (txn: SqliteTransactionPort) => Promise<T>): Promise<T>
  /** Absolute paths of the database resources currently on disk (main, WAL, SHM). */
  existingDatabasePaths(): string[]
}

export type SqliteProfileRepositoryOptions = {
  client: SqliteClientPort
  exclusion: BackupExclusionPort
  userVersion: number
  expectedDatabaseFileName: string
}

type ProfileRow = {
  id: string
  child_nickname: string
  age_band: AgeBand
  consented_at: string
  created_at: string
}

const PROFILES_TABLE = 'profiles'

const CREATE_PROFILES_SCHEMA = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY NOT NULL,
  child_nickname TEXT NOT NULL CHECK (length(child_nickname) BETWEEN 1 AND 40),
  age_band TEXT NOT NULL CHECK (age_band IN ('3-5', '6-8', '9-12')),
  consented_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`

/**
 * SQLite-backed authoritative profile catalog with the persistence-contract
 * v1 gates: integrity, user/schema/layout version, and per-resource backup
 * exclusion. Any unsafe result blocks the catalog with a StorageGateError and
 * closes the client; it never presents an empty healthy store.
 */
export function createSqliteProfileRepository(
  options: SqliteProfileRepositoryOptions,
): ProfileRepositoryPort {
  const { client, exclusion, userVersion, expectedDatabaseFileName } = options
  let opened = false
  let closed = false

  async function verifyIntegrity() {
    const integrity = await client.integrityCheck()
    if (integrity !== 'ok') throw new StorageGateError('integrity-failed')
  }

  async function verifyVersions() {
    // The layout/contract version is encoded in the canonical database file
    // name; a catalog living at any other name is a layout mismatch.
    const mainPath = client.existingDatabasePaths()[0]
    const catalogFileName = mainPath?.split('/').pop() ?? ''
    if (catalogFileName !== expectedDatabaseFileName) {
      throw new StorageGateError('version-unsafe')
    }
    const actualUserVersion = await client.getUserVersion()
    if (actualUserVersion === 0) {
      await client.transaction(async (txn) => {
        await txn.run(CREATE_PROFILES_SCHEMA)
      })
      await client.setUserVersion(userVersion)
      return
    }
    if (actualUserVersion !== userVersion) {
      throw new StorageGateError('version-unsafe')
    }
    const hasTable = await client.tableExists(PROFILES_TABLE)
    if (!hasTable) throw new StorageGateError('version-unsafe')
  }

  async function applyExclusions() {
    for (const path of client.existingDatabasePaths()) {
      const excluded = await exclusion.apply(path)
      if (!excluded) throw new StorageGateError('backup-control-failed')
    }
  }

  async function closeClient() {
    if (closed) return
    closed = true
    await client.close()
  }

  return {
    async open() {
      if (opened || closed) return
      opened = true
      try {
        await client.open()
        await verifyIntegrity()
        await verifyVersions()
        await applyExclusions()
      } catch (error) {
        await closeClient()
        throw error
      }
    },

    async close() {
      await closeClient()
    },

    async create(profile) {
      if (!opened || closed) throw new StorageGateError('integrity-failed')

      const outcome = await client.transaction(async (txn) => {
        const existing = await txn.getAll<{ n: number }>(
          `SELECT COUNT(*) AS n FROM ${PROFILES_TABLE}`,
        )
        if ((existing[0]?.n ?? 0) > 0) return 'already-exists' as const
        await txn.run(
          `INSERT INTO ${PROFILES_TABLE} (
             id, child_nickname, age_band, consented_at, created_at
           ) VALUES (?, ?, ?, ?, ?)`,
          [
            profile.id,
            profile.childNickname,
            profile.ageBand,
            profile.consentedAt,
            profile.createdAt,
          ],
        )
        return 'created' as const
      })

      // After the first commit the WAL/SHM siblings may exist; they must be
      // under the same exclusion policy as the main catalog file.
      await applyExclusions()

      return outcome
    },

    async findOnly() {
      if (!opened || closed) throw new StorageGateError('integrity-failed')
      const rows = await client.getAll<ProfileRow>(
        `SELECT id, child_nickname, age_band, consented_at, created_at
         FROM ${PROFILES_TABLE}
         ORDER BY created_at ASC
         LIMIT 2`,
      )
      if (rows.length > 1) throw new StorageGateError('integrity-failed')
      const row = rows[0]
      if (!row) return null
      return {
        id: row.id,
        childNickname: row.child_nickname,
        ageBand: row.age_band,
        consentedAt: row.consented_at,
        createdAt: row.created_at,
      } satisfies NativeProfileV1
    },
  }
}