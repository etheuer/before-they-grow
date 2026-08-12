import { describe, expect, it } from 'vitest'
import type { MemoryEntryV1 } from '@before-they-grow/contracts'
import type { MemoryRepositoryPort } from './memory'
import {
  saveVoiceMemory,
  type MediaStorePort,
  type SaveVoiceMemoryInput,
} from './capture'
import {
  reconcileSaveOperations,
  SaveCapacityError,
  SaveIndeterminateError,
} from './saveReliability'
import type {
  SaveJournalPort,
  SaveOperationRecord,
} from './saveReliability'

const input: SaveVoiceMemoryInput = {
  promptSnapshot: {
    promptId: '6-8-memory-proud',
    question: 'What happened today that made you feel proud?',
    followUp: 'What did you do to make it happen?',
    ageBand: '6-8',
  },
  reviewedTranscript: '',
  now: new Date('2026-08-11T22:05:00Z'),
  validatedMedia: {
    uri: 'file:///cache/rec.m4a',
    durationMs: 30000,
    byteCount: 1000,
    sha256: 'deadbeef',
  },
}

function repository(): MemoryRepositoryPort & { memories: MemoryEntryV1[]; createError: Error | null } {
  const state: MemoryRepositoryPort & { memories: MemoryEntryV1[]; createError: Error | null } = {
    memories: [],
    createError: null,
    async create(memory) {
      if (state.createError) throw state.createError
      if (state.memories.some((entry) => entry.id === memory.id)) return 'duplicate'
      state.memories.push(memory)
      return 'created'
    },
    async updateReviewedTranscript(id, reviewedTranscript) {
      const memory = state.memories.find((entry) => entry.id === id)
      if (!memory) return 'missing'
      if (memory.reviewedTranscript === reviewedTranscript) return 'unchanged'
      memory.reviewedTranscript = reviewedTranscript
      return 'updated'
    },
    async findNewestFirst() {
      return [...state.memories]
    },
    async findAllWithMedia() {
      return state.memories.filter((entry) => entry.media !== null)
    },
    async remove(id) {
      const before = state.memories.length
      state.memories = state.memories.filter((entry) => entry.id !== id)
      return state.memories.length === before ? 'missing' : 'removed'
    },
  }
  return state
}

function mediaStore(): MediaStorePort & {
  fail: boolean
  preflightFail: boolean
  failRemove: boolean
  committed: string[]
  removed: string[]
  finals: Set<string>
} {
  const state: MediaStorePort & {
    fail: boolean
    preflightFail: boolean
    failRemove: boolean
    committed: string[]
    removed: string[]
    finals: Set<string>
  } = {
    fail: true,
    preflightFail: false,
    failRemove: false,
    committed: [],
    removed: [],
    finals: new Set(),
    async preflight() {
      if (state.preflightFail) throw new SaveCapacityError()
    },
    async commit(_sourceUri, relativePath) {
      if (state.fail) throw new Error('out of space')
      state.committed.push(relativePath)
      state.finals.add(relativePath)
    },
    async removeFinal(relativePath) {
      if (state.failRemove) throw new Error('cleanup unavailable')
      state.removed.push(relativePath)
      state.finals.delete(relativePath)
    },
    async reconcileFinal(relativePath) {
      return state.finals.has(relativePath)
    },
    async resolve(relativePath) {
      return `file:///documents/${relativePath}`
    },
  }
  return state
}

function journal(): SaveJournalPort & { records: Map<string, SaveOperationRecord>; failRemove: boolean } {
  const state: SaveJournalPort & { records: Map<string, SaveOperationRecord>; failRemove: boolean } = {
    records: new Map(),
    failRemove: false,
    async prepare(operation) {
      const existing = state.records.get(operation.identity.operationId)
      if (!existing) {
        state.records.set(operation.identity.operationId, operation)
        return { kind: 'created', record: operation }
      }
      const sameRetryContent = JSON.stringify({ ...existing.memory, reviewedTranscript: '' })
        === JSON.stringify({ ...operation.memory, reviewedTranscript: '' })
      if (sameRetryContent) {
        const updated = { ...existing, memory: operation.memory }
        state.records.set(operation.identity.operationId, updated)
        return { kind: 'existing', record: updated }
      }
      return { kind: 'conflict', existing: existing.memory }
    },
    async markMediaCommitted(operationId) {
      const existing = state.records.get(operationId)
      if (existing) state.records.set(operationId, { ...existing, phase: 'media-committed' })
    },
    async listPending() {
      return [...state.records.values()]
    },
    async remove(operationId) {
      if (state.failRemove) throw new Error('journal unavailable')
      state.records.delete(operationId)
    },
  }
  return state
}

describe('saveVoiceMemory reliability contract', () => {
  it('returns a retry identity for a pre-commit failure and retries the same operation', async () => {
    const repo = repository()
    const store = mediaStore()
    const first = await saveVoiceMemory(
      { repository: repo, mediaStore: store, generateId: () => 'memory-1' },
      input,
    )

    expect(first.kind).toBe('not-saved')
    if (first.kind !== 'not-saved') return
    expect(first.retry).toEqual({
      operationId: 'memory-1',
      memoryId: 'memory-1',
      mediaSha256: 'deadbeef',
    })

    store.fail = false
    const second = await saveVoiceMemory(
      { repository: repo, mediaStore: store, generateId: () => 'a-different-id' },
      { ...input, operation: first.retry },
    )

    expect(second.kind).toBe('saved')
    expect(repo.memories).toHaveLength(1)
    expect(store.committed).toEqual(['media/memory-1.m4a'])
  })

  it('stops only the new save when preflight reports low storage', async () => {
    const repo = repository()
    const store = mediaStore()
    store.fail = false
    const prior = await saveVoiceMemory(
      { repository: repo, mediaStore: store, generateId: () => 'prior' },
      { ...input, operation: { operationId: 'prior', memoryId: 'prior', mediaSha256: 'deadbeef' } },
    )
    expect(prior.kind).toBe('saved')

    store.preflightFail = true
    const blocked = await saveVoiceMemory(
      { repository: repo, mediaStore: store, generateId: () => 'new' },
      { ...input, operation: { operationId: 'new', memoryId: 'new', mediaSha256: 'deadbeef' } },
    )

    expect(blocked.kind).toBe('not-saved')
    if (blocked.kind !== 'not-saved') return
    expect(blocked.reason).toBe('low-storage')
    expect(repo.memories.map((memory) => memory.id)).toEqual(['prior'])
    expect(store.committed).toEqual(['media/prior.m4a'])
  })

  it('does not remove a prior memory media reference during compensation', async () => {
    const repo = repository()
    const prior = {
      ...input,
      operation: { operationId: 'prior', memoryId: 'prior', mediaSha256: 'deadbeef' },
    }
    const store = mediaStore()
    store.fail = false
    await saveVoiceMemory({ repository: repo, mediaStore: store, generateId: () => 'prior' }, prior)
    const priorMemory = repo.memories[0]
    priorMemory.media = { relativePath: 'media/new.m4a', byteCount: 1000, sha256: 'deadbeef' }
    repo.createError = new Error('database failed')

    const result = await saveVoiceMemory(
      { repository: repo, mediaStore: store, generateId: () => 'new' },
      { ...input, operation: { operationId: 'new', memoryId: 'new', mediaSha256: 'deadbeef' } },
    )

    expect(result).toMatchObject({ kind: 'not-saved', cleanupPending: true })
    expect(store.removed).toEqual([])
    expect(repo.memories).toHaveLength(1)
  })

  it('stops only the new save when the database reports low storage', async () => {
    const repo = repository()
    const store = mediaStore()
    store.fail = false
    await saveVoiceMemory(
      { repository: repo, mediaStore: store, generateId: () => 'prior' },
      { ...input, operation: { operationId: 'prior', memoryId: 'prior', mediaSha256: 'deadbeef' } },
    )
    repo.createError = new SaveCapacityError()

    const result = await saveVoiceMemory(
      { repository: repo, mediaStore: store, generateId: () => 'new' },
      { ...input, operation: { operationId: 'new', memoryId: 'new', mediaSha256: 'deadbeef' } },
    )

    expect(result).toMatchObject({ kind: 'not-saved', reason: 'low-storage' })
    expect(repo.memories.map((memory) => memory.id)).toEqual(['prior'])
    expect(store.removed).toEqual(['media/new.m4a'])
  })

  it('returns the already committed memory for the same identity without a second media commit', async () => {
    const repo = repository()
    const store = mediaStore()
    store.fail = false
    const first = await saveVoiceMemory(
      { repository: repo, mediaStore: store, generateId: () => 'memory-1' },
      input,
    )
    expect(first.kind).toBe('saved')
    if (first.kind !== 'saved') return

    const second = await saveVoiceMemory(
      { repository: repo, mediaStore: store, generateId: () => 'different' },
      { ...input, operation: { operationId: 'memory-1', memoryId: 'memory-1', mediaSha256: 'deadbeef' } },
    )

    expect(second).toEqual(first)
    expect(store.committed).toEqual(['media/memory-1.m4a'])
    expect(repo.memories).toHaveLength(1)
  })

  it('keeps a journal for bootstrap when pre-commit orphan cleanup fails', async () => {
    const repo = repository()
    const store = mediaStore()
    const pending = journal()
    store.failRemove = true

    const result = await saveVoiceMemory(
      { repository: repo, mediaStore: store, journal: pending, generateId: () => 'memory-1' },
      input,
    )

    expect(result).toMatchObject({ kind: 'not-saved', reason: 'low-storage', cleanupPending: true })
    expect(repo.memories).toHaveLength(0)
    expect(pending.records.size).toBe(1)

    store.failRemove = false
    const reconciliation = await reconcileSaveOperations({ repository: repo, mediaStore: store, journal: pending })
    expect(reconciliation[0]).toMatchObject({ kind: 'not-saved', operationId: 'memory-1' })
    expect(pending.records.size).toBe(0)
  })

  it('continues a prepared journal on same-identity retry after media is present', async () => {
    const repo = repository()
    const store = mediaStore()
    store.fail = false
    const pending = journal()
    const prepared = await pending.prepare({
      identity: { operationId: 'memory-1', memoryId: 'memory-1', mediaSha256: 'deadbeef' },
      relativePath: 'media/memory-1.m4a',
      memory: {
        id: 'memory-1',
        kind: 'voice',
        promptSnapshot: input.promptSnapshot,
        reviewedTranscript: '',
        capturedAt: input.now.toISOString(),
        savedAt: input.now.toISOString(),
        localDate: '2026-08-11',
        timeZone: 'America/Sao_Paulo',
        media: { relativePath: 'media/memory-1.m4a', byteCount: 1000, sha256: 'deadbeef' },
      },
      phase: 'prepared',
    })
    expect(prepared.kind).toBe('created')
    store.finals.add('media/memory-1.m4a')

    const retry = await saveVoiceMemory(
      { repository: repo, mediaStore: store, journal: pending, generateId: () => 'memory-1' },
      input,
    )

    expect(retry.kind).toBe('saved')
    expect(repo.memories).toHaveLength(1)
    expect(store.committed).toEqual([])
    expect(pending.records.size).toBe(0)
  })

  it('reconciles an indeterminate operation as Not saved when no row committed', async () => {
    const repo = repository()
    const store = mediaStore()
    store.fail = false
    const pending = journal()
    const originalCommit = store.commit
    store.commit = async (sourceUri, relativePath) => {
      await originalCommit(sourceUri, relativePath)
      throw new SaveIndeterminateError('backup-control-failed')
    }

    const result = await saveVoiceMemory(
      { repository: repo, mediaStore: store, journal: pending, generateId: () => 'memory-1' },
      input,
    )

    expect(result).toEqual({
      kind: 'indeterminate',
      reason: 'backup-control-failed',
      operation: { operationId: 'memory-1', memoryId: 'memory-1', mediaSha256: 'deadbeef' },
    })
    expect(repo.memories).toHaveLength(0)

    const reconciliation = await reconcileSaveOperations({
      repository: repo,
      mediaStore: store,
      journal: pending,
    })
    expect(reconciliation).toEqual([{
      kind: 'saved',
      operationId: 'memory-1',
      memory: repo.memories[0],
    }])
    expect(repo.memories).toHaveLength(1)
    expect(store.removed).toEqual([])
    expect(pending.records.size).toBe(0)
  })

  it('reconciles a committed row as Saved after post-commit journal uncertainty', async () => {
    const repo = repository()
    const store = mediaStore()
    store.fail = false
    const pending = journal()
    pending.failRemove = true

    const result = await saveVoiceMemory(
      { repository: repo, mediaStore: store, journal: pending, generateId: () => 'memory-1' },
      input,
    )

    expect(result.kind).toBe('indeterminate')
    expect(repo.memories).toHaveLength(1)
    pending.failRemove = false
    const reconciliation = await reconcileSaveOperations({
      repository: repo,
      mediaStore: store,
      journal: pending,
    })
    expect(reconciliation).toEqual([{ kind: 'saved', operationId: 'memory-1', memory: repo.memories[0] }])
    expect(store.removed).toEqual([])
  })

  it('reconciles a database commit that throws after making the row visible', async () => {
    const repo = repository()
    const store = mediaStore()
    store.fail = false
    const pending = journal()
    repo.create = async (memory) => {
      repo.memories.push(memory)
      throw new SaveIndeterminateError('database-commit-uncertain')
    }

    const result = await saveVoiceMemory(
      { repository: repo, mediaStore: store, journal: pending, generateId: () => 'memory-1' },
      input,
    )

    expect(result.kind).toBe('indeterminate')
    expect(repo.memories).toHaveLength(1)
    const reconciliation = await reconcileSaveOperations({ repository: repo, mediaStore: store, journal: pending })
    expect(reconciliation[0]).toMatchObject({ kind: 'saved', operationId: 'memory-1' })
    expect(repo.memories).toHaveLength(1)
  })

  it('allows a same-identity voice retry to fill parent-reviewed text', async () => {
    const repo = repository()
    const store = mediaStore()
    store.fail = false
    const first = await saveVoiceMemory(
      { repository: repo, mediaStore: store, generateId: () => 'memory-1' },
      input,
    )
    expect(first.kind).toBe('saved')

    const retry = await saveVoiceMemory(
      { repository: repo, mediaStore: store, generateId: () => 'unused' },
      { ...input, reviewedTranscript: 'Parent-reviewed words', operation: { operationId: 'memory-1', memoryId: 'memory-1', mediaSha256: 'deadbeef' } },
    )

    expect(retry.kind).toBe('saved')
    expect(repo.memories).toHaveLength(1)
    expect(repo.memories[0].reviewedTranscript).toBe('Parent-reviewed words')
  })

  it('reports a conflict and never overwrites content under an existing identity', async () => {
    const repo = repository()
    const store = mediaStore()
    store.fail = false
    const operation = { operationId: 'memory-1', memoryId: 'memory-1', mediaSha256: 'deadbeef' as const }
    await saveVoiceMemory(
      { repository: repo, mediaStore: store, generateId: () => 'unused' },
      { ...input, operation },
    )

    const conflict = await saveVoiceMemory(
      { repository: repo, mediaStore: store, generateId: () => 'unused' },
      { ...input, reviewedTranscript: 'Different words', operation },
    )

    expect(conflict.kind).toBe('saved')
    if (conflict.kind !== 'saved') return
    expect(conflict.memory.reviewedTranscript).toBe('Different words')
    expect(repo.memories).toHaveLength(1)
    expect(repo.memories[0].reviewedTranscript).toBe('Different words')
    expect(store.committed).toEqual(['media/memory-1.m4a'])
  })
})
