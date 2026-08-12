import type { AgeBand } from '@before-they-grow/domain'
import {
  StorageGateError,
  classifyLayoutVersions,
  classifyStorageInventory,
  type ProfileRepositoryPort,
  type StorageInventoryPort,
  type UnavailableMemory,
} from '@before-they-grow/application'
import type { NativeProfileV1 } from '@before-they-grow/contracts'
import type { BackupExclusionPort } from './backupExclusion'
import {
  DATABASE_DDL_V2,
  MEMORIES_TABLE,
  MIGRATION_MEMORIES_V1_TO_V2,
  PROFILES_TABLE,
  SAVE_OPERATIONS_TABLE,
} from './sqliteSchema'
import { storageLayoutVersion } from './storageRoot'

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
  inventory?: StorageInventoryPort
  supportedLayoutVersion?: number
}

export type BootstrappingProfileRepository = ProfileRepositoryPort & {
  consumeUnavailable(): UnavailableMemory[]
}

type MediaCatalogRow = {
  id: string
  media_ref: string | null
  media_byte_count: number | null
  media_sha256: string | null
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
): BootstrappingProfileRepository {
  const {
    client,
    exclusion,
    userVersion,
    expectedDatabaseFileName,
    inventory,
    supportedLayoutVersion = storageLayoutVersion,
  } = options
  let opened = false
  let closed = false
  let unavailable: UnavailableMemory[] = []

  async function verifyRoots() {
    if (!inventory) return
    await inventory.verifyRoots()
    const versions = await inventory.listLayoutVersions()
    if (classifyLayoutVersions(versions, supportedLayoutVersion) === 'version-unsafe') {
      throw new StorageGateError('version-unsafe')
    }
  }

  async function verifyIntegrity() {
    const integrity = await client.integrityCheck()
    if (integrity !== 'ok') throw new StorageGateError('integrity-failed')
  }

  async function applySchemaInTransaction(execSql: string) {
    try {
      await client.transaction(async (txn) => {
        await txn.exec(execSql)
        await txn.exec(`PRAGMA user_version = ${userVersion}`)
      })
    } catch (error) {
      if (error instanceof StorageGateError) throw error
      throw new StorageGateError('version-unsafe')
    }
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
      await applySchemaInTransaction(DATABASE_DDL_V2)
    } else if (actualUserVersion === 1) {
      // Forward migration to v2: a v1 catalog that already has the memories
      // table is rebuilt in place (its CHECK constraints are relaxed for the
      // voice kind and media metadata); a v1 catalog without it simply gains
      // the v2 table. The profile catalog is never touched. user_version
      // advances in the same transaction so a mid-migration failure rolls back.
      const hasMemories = await client.tableExists(MEMORIES_TABLE)
      await applySchemaInTransaction(hasMemories ? MIGRATION_MEMORIES_V1_TO_V2 : DATABASE_DDL_V2)
    } else {
      if (actualUserVersion !== userVersion) {
        throw new StorageGateError('version-unsafe')
      }
      const hasProfiles = await client.tableExists(PROFILES_TABLE)
      // A missing profile catalog signals data loss and must block, never
      // present an empty onboarding store.
      if (!hasProfiles) throw new StorageGateError('version-unsafe')
      const hasMemories = await client.tableExists(MEMORIES_TABLE)
      const hasSaveOperations = await client.tableExists(SAVE_OPERATIONS_TABLE)
      if (!hasMemories || !hasSaveOperations) {
        // Additive, idempotent repair for a versioned catalog that somehow
        // lost a reliability table; nothing existing is touched.
        await applySchemaInTransaction(DATABASE_DDL_V2)
      }
    }
    const profilesTable = await client.tableExists(PROFILES_TABLE)
    const memoriesTable = await client.tableExists(MEMORIES_TABLE)
    const saveOperationsTable = await client.tableExists(SAVE_OPERATIONS_TABLE)
    if (!profilesTable || !memoriesTable || !saveOperationsTable) {
      throw new StorageGateError('version-unsafe')
    }
  }

  async function verifyBackupControls() {
    for (const path of client.existingDatabasePaths()) {
      const excluded = await exclusion.apply(path)
      if (!excluded) throw new StorageGateError('backup-control-failed')
    }
    if (inventory) await inventory.applyBackupControls()
  }

  async function verifyLayoutInventory() {
    if (!inventory) return
    const versions = await inventory.listLayoutVersions()
    if (classifyLayoutVersions(versions, supportedLayoutVersion) === 'version-unsafe') {
      throw new StorageGateError('version-unsafe')
    }
    const entries = await inventory.inspectInventory()
    if (entries.some((entry) => entry.kind === 'unknown')) {
      throw new StorageGateError('root-unsafe')
    }
  }

  async function reconcileCatalog() {
    if (!inventory) return
    const rows = await client.getAll<MediaCatalogRow>(
      `SELECT id, media_ref, media_byte_count, media_sha256
       FROM ${MEMORIES_TABLE}
       WHERE media_ref IS NOT NULL`,
    )
    const referenced = rows.flatMap((row) =>
      row.media_ref
        ? [{
            memoryId: row.id,
            relativePath: row.media_ref,
            byteCount: row.media_byte_count ?? 0,
            sha256: row.media_sha256 ?? '',
          }]
        : [],
    )
    const presence = await inventory.listReferenced(referenced.map((item) => item.relativePath))
    const inventoryEntries = await inventory.inspectInventory()
    const report = classifyStorageInventory({
      referenced,
      presence,
      inventory: inventoryEntries,
    })
    if (report.kind === 'blocked') throw new StorageGateError(report.reason)
    await inventory.cleanRecognizedStale()
    // Reconciling unreferenced final media during bootstrap can orphan
    // files from interrupted saves whose journal reconciliation has not yet
    // run (process death between media move and journal advance). For MVP,
    // unreferenced files are left on disk; only missing-media Unavailable
    // memories are surfaced. A safe cleanup pass follows in post-MVP
    // filesystem migration (#38 hardening).
    // await inventory.reconcileUnreferenced(referenced.map((item) => item.relativePath))
    unavailable = report.unavailable
  }

  async function applyExclusions() {
    await verifyBackupControls()
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
        await verifyRoots()
        await client.open()
        await verifyIntegrity()
        await verifyVersions()
        await verifyBackupControls()
        await verifyLayoutInventory()
        await reconcileCatalog()
      } catch (error) {
        await closeClient()
        throw error
      }
    },

    consumeUnavailable() {
      const current = unavailable
      unavailable = []
      return current
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