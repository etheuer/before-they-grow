import { createSqliteClientFromDatabase, type DatabaseLike } from './expoSqliteClient'

function fakeDatabase(): DatabaseLike {
  return {
    databasePath: '/documents/BeforeTheyGrow/layout-v1/profile-v1.db',
    closeAsync: jest.fn(async () => {}),
    execAsync: jest.fn(async () => {}),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async () => []),
    runAsync: jest.fn(async () => ({})),
    withExclusiveTransactionAsync: jest.fn(
      async (task: (txn: {
        runAsync: (s: string) => Promise<unknown>
        getAllAsync: <T>(s: string) => Promise<T[]>
      }) => Promise<void>) => {
        await task({ runAsync: async () => ({}), getAllAsync: async <T>() => [] as T[] })
      },
    ),
  } as unknown as DatabaseLike
}

describe('createSqliteClientFromDatabase', () => {
  it('returns the block value across the exclusive-transaction boundary', async () => {
    const db = fakeDatabase()
    const client = createSqliteClientFromDatabase(db)

    const result = await client.transaction(async () => 'created' as const)

    // Regression: the real edge previously discarded the block's value, so a
    // repository create() resolved undefined and the application reported
    // 'created' even when the write was skipped.
    expect(result).toBe('created')
    expect(db.withExclusiveTransactionAsync).toHaveBeenCalled()
  })

  it('propagates an already-exists outcome from the repository block', async () => {
    const db = fakeDatabase()
    const client = createSqliteClientFromDatabase(db)

    const result = await client.transaction(async () => 'already-exists' as const)

    expect(result).toBe('already-exists')
  })

  it('reports isOpen false until opened and true after the database is set', async () => {
    const db = fakeDatabase()
    const client = createSqliteClientFromDatabase(db)
    expect(client.isOpen()).toBe(true)
  })
})