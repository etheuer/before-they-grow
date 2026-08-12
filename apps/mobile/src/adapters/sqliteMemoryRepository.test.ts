import { StorageGateError } from '@before-they-grow/application'
import type { MemoryEntryV1 } from '@before-they-grow/contracts'
import { createSqliteMemoryRepository } from './sqliteMemoryRepository'
import { DATABASE_DDL_V2, MEMORIES_TABLE, PROFILES_TABLE } from './sqliteSchema'
import type { SqliteClientPort, SqliteTransactionPort } from './sqliteProfileRepository'

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
    async exec(_sql: string) {
      for (const statement of DATABASE_DDL_V2.split(';')) {
        if (statement.includes(PROFILES_TABLE)) state.tables.add(PROFILES_TABLE)
        if (statement.includes(MEMORIES_TABLE)) state.tables.add(MEMORIES_TABLE)
      }
    },
    async getAll<T>(sql: string, params: readonly unknown[] = []) {
      if (sql.includes('FROM memories') && sql.includes('ORDER BY saved_at DESC')) {
        return [...state.memories]
          .sort((a, b) => b.saved_at.localeCompare(a.saved_at))
          .map((m) => ({ ...m })) as unknown as T[]
      }
      if (sql.includes('WHERE id = ?')) {
        return state.memories.filter((m) => m.id === params[0]).map((m) => ({ id: m.id })) as T[]
      }
      throw new Error(`Unexpected query: ${sql}`)
    },
    async transaction<T>(block: (txn: SqliteTransactionPort) => Promise<T>) {
      const txn: SqliteTransactionPort = {
        async exec() {
          for (const statement of DATABASE_DDL_V2.split(';')) {
            if (statement.includes(PROFILES_TABLE)) state.tables.add(PROFILES_TABLE)
            if (statement.includes(MEMORIES_TABLE)) state.tables.add(MEMORIES_TABLE)
          }
        },
        async run(sql: string, params: readonly unknown[] = []) {
          if (sql.includes('CREATE TABLE')) {
            throw new Error('DDL must go through exec, not run')
          }
          if (sql.includes('INSERT INTO memories')) {
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
            return
          }
          throw new Error(`Unexpected txn statement: ${sql}`)
        },
        async getAll<T2>(sql: string, params: readonly unknown[] = []) {
          if (sql.includes('WHERE id = ?')) {
            return state.memories.filter((m) => m.id === params[0]).map((m) => ({ id: m.id })) as T2[]
          }
          throw new Error(`Unexpected txn query: ${sql}`)
        },
      }
      return block(txn)
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

  it('the shared DDL creates both catalog tables idempotently via exec', async () => {
    const { client, state } = fakeClient()
    await client.open()

    await client.transaction(async (txn) => {
      await txn.exec(DATABASE_DDL_V2)
      await txn.exec(DATABASE_DDL_V2)
    })

    expect(state.tables.has(PROFILES_TABLE)).toBe(true)
    expect(state.tables.has(MEMORIES_TABLE)).toBe(true)
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