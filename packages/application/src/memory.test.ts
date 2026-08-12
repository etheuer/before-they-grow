import { describe, expect, it } from 'vitest'
import {
  saveManualMemory,
  loadMemoryTimeline,
  type MemoryRepositoryPort,
  type RecordingPermissionPort,
  type RecordingPermissionState,
  type SaveManualMemoryInput,
} from './memory'
import type { MemoryEntryV1 } from '@before-they-grow/contracts'

function fakeMemoryRepository(): MemoryRepositoryPort & { memories: MemoryEntryV1[]; failCreate: Error | null } {
  const repo: MemoryRepositoryPort & { memories: MemoryEntryV1[]; failCreate: Error | null } = {
    memories: [],
    failCreate: null,
    async create(memory) {
      if (repo.failCreate) throw repo.failCreate
      if (repo.memories.some((m) => m.id === memory.id)) return 'duplicate'
      repo.memories.push(memory)
      return 'created'
    },
    async updateReviewedTranscript(id, reviewedTranscript) {
      const memory = repo.memories.find((entry) => entry.id === id)
      if (!memory) return 'missing'
      if (memory.reviewedTranscript === reviewedTranscript) return 'unchanged'
      memory.reviewedTranscript = reviewedTranscript
      return 'updated'
    },
    async findNewestFirst() {
      return [...repo.memories].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    },
  }
  return repo
}

const baseInput: SaveManualMemoryInput = {
  promptSnapshot: {
    promptId: '6-8-memory-proud',
    question: 'What happened today that made you feel proud?',
    followUp: 'What did you do to make it happen?',
    ageBand: '6-8',
  },
  reviewedTranscript: '  I made my bed all by myself.  ',
  now: new Date('2026-08-11T22:05:00Z'),
  recordingWasAvailable: false,
}

describe('saveManualMemory', () => {
  it('saves a text-only memory with trimmed transcript and immutable prompt snapshot', async () => {
    const repo = fakeMemoryRepository()
    const result = await saveManualMemory(
      { repository: repo, generateId: () => 'memory-1' },
      baseInput,
    )

    expect(result.kind).toBe('saved')
    if (result.kind !== 'saved') return
    expect(result.memory).toMatchObject({
      id: 'memory-1',
      kind: 'text-only',
      reviewedTranscript: 'I made my bed all by myself.',
      media: null,
      promptSnapshot: baseInput.promptSnapshot,
      capturedAt: '2026-08-11T22:05:00.000Z',
      savedAt: '2026-08-11T22:05:00.000Z',
      localDate: '2026-08-11',
      timeZone: expect.any(String),
    })
    expect(repo.memories).toHaveLength(1)
  })

  it('rejects blank or whitespace transcript', async () => {
    const repo = fakeMemoryRepository()
    const blank = await saveManualMemory(
      { repository: repo, generateId: () => 'm' },
      { ...baseInput, reviewedTranscript: '   ' },
    )
    expect(blank).toEqual({ kind: 'invalid-transcript' })
    expect(repo.memories).toHaveLength(0)
  })

  it('returns Not saved on a database failure without touching prior memories', async () => {
    const repo = fakeMemoryRepository()
    await saveManualMemory(
      { repository: repo, generateId: () => 'prior' },
      { ...baseInput, operation: { operationId: 'prior', memoryId: 'prior', mediaSha256: null } },
    )
    repo.failCreate = new Error('database full')

    const result = await saveManualMemory(
      { repository: repo, generateId: () => 'new' },
      { ...baseInput, operation: { operationId: 'new', memoryId: 'new', mediaSha256: null } },
    )

    expect(result).toMatchObject({ kind: 'not-saved', reason: 'database-commit-failed' })
    expect(repo.memories.map((memory) => memory.id)).toEqual(['prior'])
  })

  it('refuses a text-only save when recording was available (no bypass)', async () => {
    const repo = fakeMemoryRepository()
    const result = await saveManualMemory(
      { repository: repo, generateId: () => 'm' },
      { ...baseInput, recordingWasAvailable: true },
    )
    expect(result).toEqual({ kind: 'recording-was-available' })
    expect(repo.memories).toHaveLength(0)
  })
})

describe('loadMemoryTimeline', () => {
  it('returns memories newest first', async () => {
    const repo = fakeMemoryRepository()
    await saveManualMemory(
      { repository: repo, generateId: () => 'older' },
      { ...baseInput, now: new Date('2026-08-10T20:00:00Z') },
    )
    await saveManualMemory(
      { repository: repo, generateId: () => 'newer' },
      { ...baseInput, now: new Date('2026-08-11T20:00:00Z') },
    )

    const timeline = await loadMemoryTimeline({ repository: repo })
    expect(timeline.map((m) => m.id)).toEqual(['newer', 'older'])
  })

  it('returns an empty list when no memories exist', async () => {
    const timeline = await loadMemoryTimeline({ repository: fakeMemoryRepository() })
    expect(timeline).toEqual([])
  })
})

describe('recording permission port shape', () => {
  it('accepts a minimal adapter', async () => {
    const states: RecordingPermissionState[] = ['granted', 'denied', 'unavailable']
    for (const state of states) {
      const port: RecordingPermissionPort = { requestPermission: async () => state }
      expect(await port.requestPermission()).toBe(state)
    }
  })
})