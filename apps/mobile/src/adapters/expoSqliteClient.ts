import { StorageGateError } from '@before-they-grow/application'
import { profileDatabaseFileNameV1 } from '@before-they-grow/contracts'
import type { SQLiteBindParams, SQLiteDatabase } from 'expo-sqlite'
import type { SqliteClientPort, SqliteTransactionPort } from './sqliteProfileRepository'
import { resolveProfileDatabasePath } from './storageRoot'

/**
 * The narrow surface of expo-sqlite this client needs, kept structural so the
 * real database and a test double share one contract.
 */
export type DatabaseLike = Pick<
  SQLiteDatabase,
  | 'closeAsync'
  | 'execAsync'
  | 'getFirstAsync'
  | 'getAllAsync'
  | 'runAsync'
  | 'withExclusiveTransactionAsync'
  | 'databasePath'
>

/**
 * Builds the SqliteClientPort over an already-open database. Kept as a pure
 * function so host-side tests can drive the exact same code against a fake
 * database, including the transaction-return semantics.
 */
export function createSqliteClientFromDatabase(database: DatabaseLike): SqliteClientPort {
  let closed = false
  const mainPath = database.databasePath

  return {
    async open() {
      // The database was opened eagerly; open() is the repository gate.
    },
    async close() {
      if (closed) return
      closed = true
      await database.closeAsync()
    },
    isOpen() {
      return !closed
    },
    async getUserVersion() {
      const row = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
      return row?.user_version ?? 0
    },
    async setUserVersion(version: number) {
      await database.execAsync(`PRAGMA user_version = ${version}`)
    },
    async integrityCheck() {
      const row = await database.getFirstAsync<{ integrity_check: string }>(
        'PRAGMA integrity_check',
      )
      return row?.integrity_check === 'ok' ? 'ok' : 'failed'
    },
    async tableExists(name: string) {
      const row = await database.getFirstAsync<{ name: string }>(
        'SELECT name FROM sqlite_master WHERE type = ? AND name = ?',
        ['table', name],
      )
      return row !== null
    },
    async exec(sql: string) {
      // execAsync maps to sqlite3_exec and compiles every statement in the
      // source; multi-statement DDL must never go through runAsync, which
      // prepares only the first statement.
      await database.execAsync(sql)
    },
    async run(sql: string, params: readonly unknown[] = []) {
      await database.runAsync(sql, params as SQLiteBindParams)
    },
    async getAll<T>(sql: string, params: readonly unknown[] = []) {
      return database.getAllAsync<T>(sql, params as SQLiteBindParams)
    },
    async transaction<T>(block: (txn: SqliteTransactionPort) => Promise<T>) {
      // withExclusiveTransactionAsync returns void; capture the block's value
      // so the repository's outcome (created / already-exists / duplicate)
      // survives the transaction boundary.
      let result: T | undefined
      await database.withExclusiveTransactionAsync(async (txn) => {
        const port: SqliteTransactionPort = {
          exec: (sql: string) => txn.execAsync(sql).then(() => undefined),
          run: (sql: string, params: readonly unknown[] = []) =>
            txn.runAsync(sql, params as SQLiteBindParams).then(() => undefined),
          getAll: <R,>(sql: string, params: readonly unknown[] = []) =>
            txn.getAllAsync<R>(sql, params as SQLiteBindParams),
        }
        result = await block(port)
      })
      return result as T
    },
    existingDatabasePaths() {
      // iOS per-resource exclusion treats a missing sibling as already
      // excluded; the main file always exists after open.
      return [mainPath, `${mainPath}-wal`, `${mainPath}-shm`]
    },
  }
}

/**
 * Thin expo-sqlite edge that opens the catalog under the canonical
 * backup-excluded root and exposes the narrow SqliteClientPort. Opening uses
 * WAL with FULL synchronous as stipulated by persistence contract v1. Any
 * failure to reach or open the catalog is a root-unsafe storage gate, so it
 * surfaces through the repository bootstrap rather than as a generic error.
 */
export function createExpoSqliteProfileClient(): SqliteClientPort {
  let inner: SqliteClientPort | null = null

  return {
    async open() {
      if (inner) return
      const sqlite = await import('expo-sqlite')
      const legacy = await import('expo-file-system/legacy')
      const documentDirectory = legacy.documentDirectory
      if (!documentDirectory) throw new StorageGateError('root-unsafe')

      const databasePath = resolveProfileDatabasePath(
        documentDirectory,
        profileDatabaseFileNameV1,
      )
      const directory = databasePath.slice(0, databasePath.lastIndexOf('/'))

      try {
        await legacy.makeDirectoryAsync(directory, { intermediates: true })
        const opened = await sqlite.openDatabaseAsync(
          profileDatabaseFileNameV1,
          { enableChangeListener: false },
          directory,
        )
        await opened.execAsync('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;')
        inner = createSqliteClientFromDatabase(opened)
      } catch {
        throw new StorageGateError('root-unsafe')
      }
    },
    async close() {
      await inner?.close()
      inner = null
    },
    isOpen() {
      return inner !== null
    },
    async getUserVersion() {
      return requireInner().getUserVersion()
    },
    async setUserVersion(version: number) {
      await requireInner().setUserVersion(version)
    },
    async integrityCheck() {
      return requireInner().integrityCheck()
    },
    async tableExists(name: string) {
      return requireInner().tableExists(name)
    },
    async exec(sql: string) {
      await requireInner().exec(sql)
    },
    async run(sql: string, params: readonly unknown[] = []) {
      await requireInner().run(sql, params)
    },
    async getAll<T>(sql: string, params: readonly unknown[] = []) {
      return requireInner().getAll<T>(sql, params)
    },
    async transaction<T>(block: (txn: SqliteTransactionPort) => Promise<T>) {
      return requireInner().transaction(block)
    },
    existingDatabasePaths() {
      return requireInner().existingDatabasePaths()
    },
  }

  function requireInner(): SqliteClientPort {
    if (!inner) throw new StorageGateError('integrity-failed')
    return inner
  }
}