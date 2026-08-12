import {
  SaveCapacityError,
  SaveIndeterminateError,
  StorageGateError,
  type SaveOperationRecord,
} from '@before-they-grow/application'
import type { MemoryEntryV1 } from '@before-they-grow/contracts'
import { createSqliteMemoryRepository } from './sqliteMemoryRepository'
import {
  DATABASE_DDL_V2,
  DELETION_OPERATIONS_TABLE,
  MEMORIES_TABLE,
  PROFILES_TABLE,
  SAVE_OPERATIONS_TABLE,
} from './sqliteSchema'
import type { SqliteClientPort, SqliteTransactionPort } from './sqliteProfileRepository'

type DeletionOperationRow = {
  memory_id: string
  relative_path: string | null
  phase: 'marked' | 'media-removed' | 'rows-deleted'
}

type SaveOperationRow = {
  operation_id: string
  memory_id: string
  media_sha256: string | null
  relative_path: string | null
  memory_json: string
  phase: 'prepared' | 'media-committed'
  created_at: string
}

type MemoryRow = {
  id: string
  kind: string
  prompt_id: string
  prompt_question: string
  prompt_follow_up: string
  prompt_age_band: string
  reviewed_transcript: string
  captured_at: string
  saved_at: string
  local_date: string
  time_zone: string
  media_ref: string | null
  media_byte_count: number | null
  media_sha256: string | null
}

function fakeClient() {
  const state = {
    opened: false,
    closed: false,
    tables: new Set<string>(),
    memories: [] as MemoryRow[],
    operations: [] as SaveOperationRow[],
    deletions: [] as DeletionOperationRow[],
    transactionFailure: null as Error | null,
    postCommitFailure: null as Error | null,
    hideVerification: false,
    checkpoints: 0,
    checkpointFailure: null as Error | null,
  }
  const client: SqliteClientPort = {
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
      return 1
    },
    async setUserVersion() {},
    async integrityCheck() {
      return 'ok'
    },
    async tableExists(name: string) {
      return state.tables.has(name)
    },
    async run() {},
    async exec(sql: string) {
      if (sql.includes('wal_checkpoint')) {
        if (state.checkpointFailure) throw state.checkpointFailure
        state.checkpoints += 1
        return
      }
      for (const statement of DATABASE_DDL_V2.split(';')) {
        if (statement.includes(PROFILES_TABLE)) state.tables.add(PROFILES_TABLE)
        if (statement.includes(MEMORIES_TABLE)) state.tables.add(MEMORIES_TABLE)
        if (statement.includes(SAVE_OPERATIONS_TABLE)) state.tables.add(SAVE_OPERATIONS_TABLE)
        if (statement.includes(DELETION_OPERATIONS_TABLE)) state.tables.add(DELETION_OPERATIONS_TABLE)
      }
    },
    async getAll<T>(sql: string, params: readonly unknown[] = []) {
      if (sql.includes(`FROM ${DELETION_OPERATIONS_TABLE}`) && !sql.includes(`FROM ${MEMORIES_TABLE}`)) {
        const rows = sql.includes('WHERE memory_id = ?')
          ? state.deletions.filter((entry) => entry.memory_id === params[0])
          : state.deletions
        return rows.map((entry) => ({ ...entry })) as unknown as T[]
      }
      if (sql.includes(`FROM ${SAVE_OPERATIONS_TABLE}`)) {
        const operations = state.operations.filter((operation) =>
          sql.includes('ORDER BY')
            || operation.operation_id === params[0]
            || operation.operation_id === params[1]
            || operation.memory_id === params[0]
            || operation.memory_id === params[1],
        )
        if (sql.includes('ORDER BY created_at ASC')) {
          operations.sort((left, right) => left.created_at.localeCompare(right.created_at))
        }
        return operations.map((operation) => ({ ...operation })) as unknown as T[]
      }
      if (sql.includes('FROM memories') && sql.includes('WHERE media_ref IS NOT NULL')) {
        return state.memories
          .filter((memory) => memory.media_ref !== null)
          .map((memory) => ({ ...memory })) as unknown as T[]
      }
      if (sql.includes('FROM memories') && sql.includes('ORDER BY saved_at DESC')) {
        const hidden = new Set(state.deletions.map((entry) => entry.memory_id))
        return [...state.memories]
          .filter((memory) => !hidden.has(memory.id))
          .sort((a, b) => b.saved_at.localeCompare(a.saved_at))
          .map((m) => ({ ...m })) as unknown as T[]
      }
      if (sql.includes('SELECT id FROM memories')) {
        if (state.hideVerification) return [] as T[]
        return state.memories.filter((m) => m.id === params[0]).map((m) => ({ id: m.id })) as T[]
      }
      if (sql.includes('FROM memories') && sql.includes('WHERE id = ?')) {
        return state.memories.filter((m) => m.id === params[0]).map((m) => ({ ...m })) as unknown as T[]
      }
      throw new Error(`Unexpected query: ${sql}`)
    },
    async transaction<T>(block: (txn: SqliteTransactionPort) => Promise<T>) {
      const memoriesBefore = state.memories.map((memory) => ({ ...memory }))
      const operationsBefore = state.operations.map((operation) => ({ ...operation }))
      const deletionsBefore = state.deletions.map((entry) => ({ ...entry }))
      const tablesBefore = new Set(state.tables)
      let blockCompleted = false
      const txn: SqliteTransactionPort = {
        async exec(sql: string) {
          if (sql.includes('secure_delete')) return
          for (const statement of DATABASE_DDL_V2.split(';')) {
            if (statement.includes(PROFILES_TABLE)) state.tables.add(PROFILES_TABLE)
            if (statement.includes(MEMORIES_TABLE)) state.tables.add(MEMORIES_TABLE)
            if (statement.includes(SAVE_OPERATIONS_TABLE)) state.tables.add(SAVE_OPERATIONS_TABLE)
            if (statement.includes(DELETION_OPERATIONS_TABLE)) state.tables.add(DELETION_OPERATIONS_TABLE)
          }
        },
        async run(sql: string, params: readonly unknown[] = []) {
          if (sql.includes('CREATE TABLE')) {
            throw new Error('DDL must go through exec, not run')
          }
          if (sql.includes(`INSERT INTO ${SAVE_OPERATIONS_TABLE}`)) {
            const [operation_id, memory_id, media_sha256, relative_path, memory_json, phase, created_at] = params
            state.operations.push({
              operation_id: String(operation_id),
              memory_id: String(memory_id),
              media_sha256: media_sha256 as string | null,
              relative_path: relative_path as string | null,
              memory_json: String(memory_json),
              phase: phase as 'prepared' | 'media-committed',
              created_at: String(created_at),
            })
            return
          }
          if (sql.includes(`UPDATE ${SAVE_OPERATIONS_TABLE}`)) {
            if (sql.includes('memory_json')) {
              const [memoryJson, operationId] = params
              const operation = state.operations.find((entry) => entry.operation_id === operationId)
              if (operation) operation.memory_json = String(memoryJson)
            } else {
              const [phase, operationId] = params
              const operation = state.operations.find((entry) => entry.operation_id === operationId)
              if (operation) operation.phase = phase as 'prepared' | 'media-committed'
            }
            return
          }
          if (sql.includes(`INSERT INTO ${DELETION_OPERATIONS_TABLE}`)) {
            if (state.transactionFailure) throw state.transactionFailure
            const [memory_id, relative_path, phase] = params
            state.deletions.push({
              memory_id: String(memory_id),
              relative_path: relative_path as string | null,
              phase: phase as DeletionOperationRow['phase'],
            })
            return
          }
          if (sql.includes(`UPDATE ${DELETION_OPERATIONS_TABLE}`)) {
            if (state.transactionFailure) throw state.transactionFailure
            const [phase, memoryId] = params
            const entry = state.deletions.find((row) => row.memory_id === memoryId)
            if (entry) entry.phase = phase as DeletionOperationRow['phase']
            return
          }
          if (sql.includes(`DELETE FROM ${DELETION_OPERATIONS_TABLE}`)) {
            if (state.transactionFailure) throw state.transactionFailure
            state.deletions = state.deletions.filter((entry) => entry.memory_id !== params[0])
            return
          }
          if (sql.includes(`DELETE FROM ${SAVE_OPERATIONS_TABLE}`)) {
            if (sql.includes('memory_id')) {
              state.operations = state.operations.filter((entry) => entry.memory_id !== params[0])
              return
            }
            const operationId = params[0]
            state.operations = state.operations.filter((entry) => entry.operation_id !== operationId)
            return
          }
          if (sql.includes('DELETE FROM memories')) {
            if (state.transactionFailure) throw state.transactionFailure
            const memoryId = String(params[0])
            state.memories = state.memories.filter((entry) => entry.id !== memoryId)
            return
          }
          if (sql.includes('UPDATE memories')) {
            const [reviewedTranscript, memoryId] = params
            const memory = state.memories.find((entry) => entry.id === memoryId)
            if (memory) memory.reviewed_transcript = String(reviewedTranscript)
            return
          }
          if (sql.includes('INSERT INTO memories')) {
            if (state.transactionFailure && /(?:out of space|disk is full)/i.test(state.transactionFailure.message)) {
              throw state.transactionFailure
            }
            const [
              id, kind, prompt_id, prompt_question, prompt_follow_up,
              prompt_age_band, reviewed_transcript, captured_at, saved_at,
              local_date, time_zone, media_ref, media_byte_count, media_sha256,
            ] = params
            state.memories.push({
              id: String(id),
              kind: String(kind),
              prompt_id: String(prompt_id),
              prompt_question: String(prompt_question),
              prompt_follow_up: String(prompt_follow_up),
              prompt_age_band: String(prompt_age_band),
              reviewed_transcript: String(reviewed_transcript),
              captured_at: String(captured_at),
              saved_at: String(saved_at),
              local_date: String(local_date),
              time_zone: String(time_zone),
              media_ref: media_ref as string | null,
              media_byte_count: media_byte_count as number | null,
              media_sha256: media_sha256 as string | null,
            })
            if (state.transactionFailure) throw state.transactionFailure
            return
          }
          throw new Error(`Unexpected txn statement: ${sql}`)
        },
        async getAll<T2>(sql: string, params: readonly unknown[] = []) {
          if (sql.includes(`FROM ${DELETION_OPERATIONS_TABLE}`)) {
            return state.deletions
              .filter((entry) => entry.memory_id === params[0])
              .map((entry) => ({ ...entry })) as T2[]
          }
          if (sql.includes(`FROM ${SAVE_OPERATIONS_TABLE}`)) {
            return state.operations.filter((operation) =>
              operation.operation_id === params[0]
                || operation.operation_id === params[1]
                || operation.memory_id === params[0]
                || operation.memory_id === params[1],
            ).map((operation) => ({ ...operation })) as T2[]
          }
          if (sql.includes('FROM memories') && sql.includes('WHERE id = ?')) {
            return state.memories.filter((m) => m.id === params[0]).map((m) => ({ ...m })) as T2[]
          }
          if (sql.includes('WHERE id = ?')) {
            return state.memories.filter((m) => m.id === params[0]).map((m) => ({ id: m.id })) as T2[]
          }
          throw new Error(`Unexpected txn query: ${sql}`)
        },
      }
      try {
        const result = await block(txn)
        blockCompleted = true
        if (state.postCommitFailure) {
          const failure = state.postCommitFailure
          state.postCommitFailure = null
          throw failure
        }
        return result
      } catch (error) {
        if (!blockCompleted) {
          state.memories = memoriesBefore
          state.operations = operationsBefore
          state.deletions = deletionsBefore
          state.tables = tablesBefore
        }
        throw error
      }
    },
    existingDatabasePaths() {
      return ['/documents/BeforeTheyGrow/layout-v1/profile-v1.db']
    },
  }
  return { client, state }
}

const memory: MemoryEntryV1 = {
  id: 'memory-1',
  kind: 'text-only',
  promptSnapshot: {
    promptId: '6-8-memory-proud',
    question: 'What happened today that made you feel proud?',
    followUp: 'What did you do to make it happen?',
    ageBand: '6-8',
  },
  reviewedTranscript: 'I made my bed all by myself.',
  capturedAt: '2026-08-11T22:05:00.000Z',
  savedAt: '2026-08-11T22:05:00.000Z',
  localDate: '2026-08-11',
  timeZone: 'America/Recife',
  media: null,
}

const voiceMemory: MemoryEntryV1 = {
  ...memory,
  id: 'memory-voice-1',
  kind: 'voice',
  reviewedTranscript: '',
  media: {
    relativePath: 'media/memory-voice-1.m4a',
    byteCount: 123456,
    sha256: 'abcd1234',
  },
}

describe('createSqliteMemoryRepository', () => {
  it('persists a memory and reports created only after it is queryable', async () => {
    const { client, state } = fakeClient()
    await client.open()
    const repo = createSqliteMemoryRepository(client)

    expect(await repo.create(memory)).toBe('created')
    expect(state.memories).toHaveLength(1)
    expect(state.memories[0].reviewed_transcript).toBe('I made my bed all by myself.')
  })

  it('returns duplicate for an already-present id without inserting again', async () => {
    const { client, state } = fakeClient()
    await client.open()
    const repo = createSqliteMemoryRepository(client)
    await repo.create(memory)

    expect(await repo.create({ ...memory })).toBe('duplicate')
    expect(state.memories).toHaveLength(1)
  })

  it('maps a database out-of-space failure to a Not saved capacity error', async () => {
    const { client, state } = fakeClient()
    await client.open()
    state.transactionFailure = new Error('database or disk is full')
    const repo = createSqliteMemoryRepository(client)

    await expect(repo.create(memory)).rejects.toEqual(new SaveCapacityError())
    expect(state.memories).toHaveLength(0)
  })

  it('rolls back a failed transaction instead of leaving a phantom row', async () => {
    const { client, state } = fakeClient()
    await client.open()
    state.transactionFailure = new Error('database write failed')
    const repo = createSqliteMemoryRepository(client)

    await expect(repo.create(memory)).rejects.toThrow()
    expect(state.memories).toHaveLength(0)
  })

  it('keeps a post-commit database uncertainty distinguishable from a pre-commit failure', async () => {
    const { client, state } = fakeClient()
    await client.open()
    state.postCommitFailure = new Error('connection lost after commit')
    const repo = createSqliteMemoryRepository(client)

    await expect(repo.create(memory)).rejects.toEqual(
      new SaveIndeterminateError('database-commit-uncertain'),
    )
    expect(state.memories).toHaveLength(1)
  })

  it('reports verification uncertainty after a row was committed', async () => {
    const { client, state } = fakeClient()
    await client.open()
    state.hideVerification = true
    const repo = createSqliteMemoryRepository(client)

    await expect(repo.create(memory)).rejects.toEqual(
      new SaveIndeterminateError('post-commit-verification-failed'),
    )
    expect(state.memories).toHaveLength(1)
  })

  it('rejects same-memory journal reuse with different operation identity', async () => {
    const { client } = fakeClient()
    await client.open()
    const repo = createSqliteMemoryRepository(client)
    const operation: SaveOperationRecord = {
      identity: { operationId: 'operation-1', memoryId: voiceMemory.id, mediaSha256: voiceMemory.media?.sha256 ?? null },
      relativePath: voiceMemory.media?.relativePath ?? null,
      memory: voiceMemory,
      phase: 'prepared',
    }
    await repo.saveJournal?.prepare(operation)
    const conflict = await repo.saveJournal?.prepare({
      ...operation,
      identity: { ...operation.identity, operationId: 'different-operation' },
    })
    expect(conflict).toEqual({ kind: 'conflict', existing: voiceMemory })
  })

  it('updates only reviewed text when a same-identity voice retry changes the draft', async () => {
    const { client } = fakeClient()
    await client.open()
    const repo = createSqliteMemoryRepository(client)
    const operation: SaveOperationRecord = {
      identity: { operationId: 'operation-1', memoryId: voiceMemory.id, mediaSha256: voiceMemory.media?.sha256 ?? null },
      relativePath: voiceMemory.media?.relativePath ?? null,
      memory: voiceMemory,
      phase: 'prepared',
    }
    await repo.saveJournal?.prepare(operation)
    const updated = { ...voiceMemory, reviewedTranscript: 'Parent words' }
    const result = await repo.saveJournal?.prepare({ ...operation, memory: updated })
    expect(result).toEqual({ kind: 'existing', record: { ...operation, memory: updated } })
  })

  it('persists, advances, lists, and removes a save operation journal entry', async () => {
    const { client } = fakeClient()
    await client.open()
    const repo = createSqliteMemoryRepository(client)
    const operation: SaveOperationRecord = {
      identity: {
        operationId: 'operation-1',
        memoryId: voiceMemory.id,
        mediaSha256: voiceMemory.media?.sha256 ?? null,
      },
      relativePath: voiceMemory.media?.relativePath ?? null,
      memory: voiceMemory,
      phase: 'prepared',
    }

    const prepared = await repo.saveJournal?.prepare(operation)
    expect(prepared?.kind).toBe('created')
    await repo.saveJournal?.markMediaCommitted('operation-1')
    expect((await repo.saveJournal?.listPending())?.[0].phase).toBe('media-committed')
    await repo.saveJournal?.remove('operation-1')
    expect(await repo.saveJournal?.listPending()).toEqual([])
  })

  it('persists a voice memory with media metadata and empty (audio-only) text', async () => {
    const { client, state } = fakeClient()
    await client.open()
    const repo = createSqliteMemoryRepository(client)

    expect(await repo.create(voiceMemory)).toBe('created')
    const row = state.memories[0]
    expect(row.kind).toBe('voice')
    expect(row.reviewed_transcript).toBe('')
    expect(row.media_ref).toBe('media/memory-voice-1.m4a')
    expect(row.media_byte_count).toBe(123456)
    expect(row.media_sha256).toBe('abcd1234')
  })

  it('reads a voice memory back with its media reference', async () => {
    const { client } = fakeClient()
    await client.open()
    const repo = createSqliteMemoryRepository(client)
    await repo.create(voiceMemory)

    const [loaded] = await repo.findNewestFirst()
    expect(loaded).toEqual(voiceMemory)
  })

  it('returns memories newest first with the full contract mapping', async () => {
    const { client } = fakeClient()
    await client.open()
    const repo = createSqliteMemoryRepository(client)
    await repo.create({ ...memory, id: 'older', savedAt: '2026-08-10T20:00:00.000Z' })
    await repo.create({ ...memory, id: 'newer', savedAt: '2026-08-11T20:00:00.000Z' })

    const timeline = await repo.findNewestFirst()
    expect(timeline.map((m) => m.id)).toEqual(['newer', 'older'])
    expect(timeline[0]).toEqual({
      ...memory,
      id: 'newer',
      savedAt: '2026-08-11T20:00:00.000Z',
    })
  })

  it('returns an empty timeline when nothing is saved', async () => {
    const { client } = fakeClient()
    await client.open()

    expect(await createSqliteMemoryRepository(client).findNewestFirst()).toEqual([])
  })

  it('fails closed when the catalog is not open', async () => {
    const { client } = fakeClient()
    const repo = createSqliteMemoryRepository(client)

    await expect(repo.create(memory)).rejects.toEqual(new StorageGateError('integrity-failed'))
    await expect(repo.findNewestFirst()).rejects.toEqual(
      new StorageGateError('integrity-failed'),
    )
  })

  it('lists only memories that carry a media reference', async () => {
    const { client } = fakeClient()
    await client.open()
    const repo = createSqliteMemoryRepository(client)
    await repo.create(memory)
    await repo.create(voiceMemory)

    expect(await repo.findAllWithMedia()).toEqual([voiceMemory])
  })

  it('marks a memory deleting so it disappears from the timeline before rows are removed', async () => {
    const { client, state } = fakeClient()
    await client.open()
    const repo = createSqliteMemoryRepository(client)
    await repo.create(memory)
    await repo.create(voiceMemory)

    const marked = await repo.markDeleting(voiceMemory.id)

    expect(marked).toMatchObject({
      memoryId: voiceMemory.id,
      relativePath: 'media/memory-voice-1.m4a',
      phase: 'marked',
    })
    expect((await repo.findNewestFirst()).map((entry) => entry.id)).toEqual([memory.id])
    expect(state.memories.map((row) => row.id)).toEqual([memory.id, voiceMemory.id])
  })

  it('rolls back a failed mark so the memory stays visible', async () => {
    const { client, state } = fakeClient()
    await client.open()
    const repo = createSqliteMemoryRepository(client)
    await repo.create(voiceMemory)
    state.transactionFailure = new Error('disk is full')

    await expect(repo.markDeleting(voiceMemory.id)).rejects.toEqual(
      new StorageGateError('deletion-incomplete'),
    )
    expect(state.deletions).toEqual([])
    expect((await repo.findNewestFirst()).map((entry) => entry.id)).toEqual([voiceMemory.id])
  })

  it('deletes catalog and save-journal rows, checkpoints WAL, then verifies absence', async () => {
    const { client, state } = fakeClient()
    await client.open()
    const repo = createSqliteMemoryRepository(client)
    await repo.create(voiceMemory)
    await repo.markDeleting(voiceMemory.id)

    await repo.removeRows(voiceMemory.id)
    await repo.checkpoint()

    expect(state.memories).toEqual([])
    expect(await repo.verifyAbsent(voiceMemory.id)).toBe(true)
    expect(state.checkpoints).toBe(1)
    expect(state.deletions).toHaveLength(1)

    await repo.clear(voiceMemory.id)
    expect(state.deletions).toEqual([])
  })

  it('does not remove rows when the delete transaction fails', async () => {
    const { client, state } = fakeClient()
    await client.open()
    const repo = createSqliteMemoryRepository(client)
    await repo.create(voiceMemory)
    await repo.markDeleting(voiceMemory.id)
    state.transactionFailure = new Error('delete failed')

    await expect(repo.removeRows(voiceMemory.id)).rejects.toEqual(
      new StorageGateError('deletion-incomplete'),
    )
    expect(state.memories.map((row) => row.id)).toEqual([voiceMemory.id])
  })

  it('reports a failed WAL checkpoint as an incomplete deletion', async () => {
    const { client, state } = fakeClient()
    await client.open()
    const repo = createSqliteMemoryRepository(client)
    state.checkpointFailure = new Error('checkpoint failed')

    await expect(repo.checkpoint()).rejects.toEqual(new StorageGateError('deletion-incomplete'))
    expect(state.checkpoints).toBe(0)
  })

  it('hard-deletes a catalog row by identity and reports missing afterward', async () => {
    const { client, state } = fakeClient()
    await client.open()
    const repo = createSqliteMemoryRepository(client)
    await repo.create(memory)
    await repo.create(voiceMemory)

    expect(await repo.remove(voiceMemory.id)).toBe('removed')
    expect(state.memories.map((row) => row.id)).toEqual([memory.id])
    expect(await repo.remove(voiceMemory.id)).toBe('missing')
  })

  it('the shared DDL creates both catalog tables idempotently via exec', async () => {
    const { client, state } = fakeClient()
    await client.open()

    await client.transaction(async (txn) => {
      await txn.exec(DATABASE_DDL_V2)
      await txn.exec(DATABASE_DDL_V2)
    })

    expect(state.tables.has(PROFILES_TABLE)).toBe(true)
    expect(state.tables.has(MEMORIES_TABLE)).toBe(true)
    expect(state.tables.has(DELETION_OPERATIONS_TABLE)).toBe(true)
  })

  it('refuses to run multi-statement DDL through run (single-statement API)', async () => {
    const { client } = fakeClient()
    await client.open()

    // Regression: runAsync compiles only the first statement, so DDL sent
    // through run() would silently create just the profiles table and brick
    // every fresh catalog. DDL must travel via exec().
    await expect(
      client.transaction(async (txn) => {
        await txn.run(DATABASE_DDL_V2)
      }),
    ).rejects.toThrow('DDL must go through exec, not run')
  })
})