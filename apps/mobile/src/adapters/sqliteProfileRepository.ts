import type { AgeBand } from '@before-they-grow/domain'
import {
  StorageGateError,
  type ProfileRepositoryPort,
} from '@before-they-grow/application'
import type { NativeProfileV1 } from '@before-they-grow/contracts'
import type { BackupExclusionPort } from './backupExclusion'
import { DATABASE_DDL_V2, MEMORIES_TABLE, MIGRATION_MEMORIES_V1_TO_V2, PROFILES_TABLE } from './sqliteSchema'

/**
 * Narrows the expo-sqlite surface to exactly what the profile catalog needs,
 * so the repository contract can be exercised against a deterministic fake in
 * tests and against the real database in a custom development build.
 */
export type SqliteTransactionPort = {
  /** Executes one or more statements (multi-statement DDL). */
  exec(sql: string): Promise<void>
  run(sql: string, params?: readonly unknown[]): Promise<void>
  getAll<T>(sql: string, params?: readonly unknown[]): Promise<T[]>
}

export type SqliteClientPort = {
  open(): Promise<void>
  close(): Promise<void>
  isOpen(): boolean
  getUserVersion(): Promise<number>
  setUserVersion(version: number): Promise<void>
  integrityCheck(): Promise<'ok' | 'failed'>
  tableExists(name: string): Promise<boolean>
  /** Executes one or more statements (multi-statement DDL). */
  exec(sql: string): Promise<void>
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

/**
 * SQLite-backed authoritative profile catalog with the persistence-contract
 * v1 gates: integrity, user/schema/layout version, and per-resource backup
 * exclusion. Any unsafe result blocks the catalog with a StorageGateError and
 * closes the client; it never presents an empty healthy store. The catalog
 * owns the full v1 schema (profiles + memories).
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
        await txn.exec(DATABASE_DDL_V2)
      })
      await client.setUserVersion(userVersion)
    } else if (actualUserVersion === 1) {
      // Forward migration to v2: a v1 catalog that already has the memories
      // table is rebuilt in place (its CHECK constraints are relaxed for the
      // voice kind and media metadata); a v1 catalog without it simply gains
      // the v2 table. The profile catalog is never touched.
      const hasMemories = await client.tableExists(MEMORIES_TABLE)
      await client.transaction(async (txn) => {
        if (hasMemories) {
          await txn.exec(MIGRATION_MEMORIES_V1_TO_V2)
        } else {
          await txn.exec(DATABASE_DDL_V2)
        }
      })
      await client.setUserVersion(userVersion)
    } else {
      if (actualUserVersion !== userVersion) {
        throw new StorageGateError('version-unsafe')
      }
      const hasProfiles = await client.tableExists(PROFILES_TABLE)
      // A missing profile catalog signals data loss and must block, never
      // present an empty onboarding store.
      if (!hasProfiles) throw new StorageGateError('version-unsafe')
      const hasMemories = await client.tableExists(MEMORIES_TABLE)
      if (!hasMemories) {
        // Additive, idempotent repair for a versioned catalog that somehow
        // lost its memories table; nothing existing is touched.
        await client.transaction(async (txn) => {
          await txn.exec(DATABASE_DDL_V2)
        })
      }
    }
    const profilesTable = await client.tableExists(PROFILES_TABLE)
    const memoriesTable = await client.tableExists(MEMORIES_TABLE)
    if (!profilesTable || !memoriesTable) {
      throw new StorageGateError('version-unsafe')
    }
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
      // A previous failed open may have closed the client; retrying must run
      // the full verification again so the truthful gate reason is reported
      // (a closed-forever repository would relabel every retry as
      // integrity-failed and make the blocked screen's retry inert).
      if (opened && !closed) return
      opened = true
      closed = false
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