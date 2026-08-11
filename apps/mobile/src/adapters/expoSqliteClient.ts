import { StorageGateError } from '@before-they-grow/application'
import {
  profileDatabaseFileNameV1,
  profileLayoutVersion,
} from '@before-they-grow/contracts'
import type { SQLiteBindParams, SQLiteDatabase } from 'expo-sqlite'
import type { SqliteClientPort, SqliteTransactionPort } from './sqliteProfileRepository'
import { resolveProfileDatabasePath } from './storageRoot'

/**
 * Thin expo-sqlite edge that turns the native database into the narrow
 * SqliteClientPort the profile catalog depends on. The database lives under
 * the canonical backup-excluded root and uses WAL with FULL synchronous as
 * stipulated by persistence contract v1. Opening happens lazily inside
 * `open()` so storage-gate failures surface through the repository bootstrap.
 */
export function createExpoSqliteProfileClient(): SqliteClientPort {
  let database: SQLiteDatabase | null = null
  let closed = false

  return {
    async open() {
      if (database || closed) return
      const sqlite = await import('expo-sqlite')
      const legacy = await import('expo-file-system/legacy')
      const documentDirectory = legacy.documentDirectory
      if (!documentDirectory) throw new StorageGateError('root-unsafe')

      const databasePath = resolveProfileDatabasePath(
        documentDirectory,
        profileDatabaseFileNameV1,
        profileLayoutVersion,
      )
      const directory = databasePath.slice(0, databasePath.lastIndexOf('/'))

      try {
        await legacy.makeDirectoryAsync(directory, { intermediates: true })
      } catch {
        throw new StorageGateError('root-unsafe')
      }
      const opened = await sqlite.openDatabaseAsync(
        profileDatabaseFileNameV1,
        { enableChangeListener: false },
        directory,
      )
      await opened.execAsync('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;')
      database = opened
    },

    async close() {
      if (closed) return
      closed = true
      await database?.closeAsync()
      database = null
    },

    async getUserVersion() {
      const row = await requireDatabase().getFirstAsync<{ user_version: number }>(
        'PRAGMA user_version',
      )
      return row?.user_version ?? 0
    },

    async setUserVersion(version: number) {
      await requireDatabase().execAsync(`PRAGMA user_version = ${version}`)
    },

    async integrityCheck() {
      const row = await requireDatabase().getFirstAsync<{ integrity_check: string }>(
        'PRAGMA integrity_check',
      )
      return row?.integrity_check === 'ok' ? 'ok' : 'failed'
    },

    async tableExists(name: string) {
      const row = await requireDatabase().getFirstAsync<{ name: string }>(
        'SELECT name FROM sqlite_master WHERE type = ? AND name = ?',
        ['table', name],
      )
      return row !== null
    },

    async run(sql: string, params: readonly unknown[] = []) {
      await requireDatabase().runAsync(sql, params as SQLiteBindParams)
    },

    async getAll<T>(sql: string, params: readonly unknown[] = []) {
      return requireDatabase().getAllAsync<T>(sql, params as SQLiteBindParams)
    },

    async transaction<T>(block: (txn: SqliteTransactionPort) => Promise<T>) {
      return requireDatabase().withExclusiveTransactionAsync(async (txn) => {
        const port: SqliteTransactionPort = {
          run: (sql: string, params: readonly unknown[] = []) =>
            txn.runAsync(sql, params as SQLiteBindParams).then(() => undefined),
          getAll: <R,>(sql: string, params: readonly unknown[] = []) =>
            txn.getAllAsync<R>(sql, params as SQLiteBindParams),
        }
        await block(port)
      }) as Promise<T>
    },

    existingDatabasePaths() {
      if (!database) return []
      const mainPath = database.databasePath
      // iOS per-resource exclusion treats a missing sibling as already
      // excluded; the main file always exists after open.
      return [mainPath, `${mainPath}-wal`, `${mainPath}-shm`]
    },
  }

  function requireDatabase(): SQLiteDatabase {
    if (!database) throw new StorageGateError('integrity-failed')
    return database
  }
}