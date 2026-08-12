import { describe, expect, it } from 'vitest'
import type { MemoryEntryV1 } from '@before-they-grow/contracts'
import type { MemoryRepositoryPort } from './memory'
import {
  MAX_CAPTURE_BYTES,
  MAX_CAPTURE_DURATION_MS,
  finalizeVoiceCapture,
  saveVoiceMemory,
  type CapturedAudio,
  type MediaInspectorPort,
  type MediaStorePort,
  type SaveVoiceMemoryInput,
} from './capture'

function fakeInspector(overrides: Partial<{
  readable: boolean
  byteCount: number
  sha256: string
  decodable: boolean
  durationMs: number
  stable: boolean
}> = {}): MediaInspectorPort {
  return {
    async inspect() {
      return {
        readable: overrides.readable ?? true,
        byteCount: overrides.byteCount ?? 1000,
        sha256: overrides.sha256 ?? 'deadbeef',
        decodable: overrides.decodable ?? true,
        durationMs: overrides.durationMs ?? 30000,
        stable: overrides.stable ?? true,
      }
    },
  }
}

function fakeMediaStore(): MediaStorePort & {
  committed: string[]
  removed: string[]
  failCommit: Error | null
} {
  const store: MediaStorePort & { committed: string[]; removed: string[]; failCommit: Error | null } = {
    committed: [],
    removed: [],
    failCommit: null,
    async commit(sourceUri, relativePath) {
      if (store.failCommit) throw store.failCommit
      store.committed.push(`${sourceUri} -> ${relativePath}`)
    },
    async removeFinal(relativePath) {
      store.removed.push(relativePath)
    },
    async resolve(relativePath) {
      return `file:///documents/${relativePath}`
    },
  }
  return store
}

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
    async findNewestFirst() {
      return [...repo.memories].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    },
  }
  return repo
}

const captured: CapturedAudio = { uri: 'file:///cache/rec.m4a', durationMs: 30000 }

const voiceInput: SaveVoiceMemoryInput = {
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

describe('finalizeVoiceCapture', () => {
  it('accepts a decodable, in-policy, stable recording', async () => {
    const result = await finalizeVoiceCapture({ inspector: fakeInspector() }, captured)
    expect(result).toEqual({ kind: 'valid', media: voiceInput.validatedMedia })
  })

  it('rejects an unreadable recording without calling it empty', async () => {
    const result = await finalizeVoiceCapture(
      { inspector: fakeInspector({ readable: false }) },
      captured,
    )
    expect(result).toEqual({ kind: 'unreadable' })
  })

  it('rejects a zero-byte recording', async () => {
    const result = await finalizeVoiceCapture({ inspector: fakeInspector({ byteCount: 0 }) }, captured)
    expect(result).toEqual({ kind: 'empty' })
  })

  it('rejects a recording over the duration policy', async () => {
    const result = await finalizeVoiceCapture(
      { inspector: fakeInspector({ durationMs: MAX_CAPTURE_DURATION_MS + 1 }) },
      captured,
    )
    expect(result).toEqual({ kind: 'over-duration', durationMs: MAX_CAPTURE_DURATION_MS + 1 })
  })

  it('rejects a recording over the size policy', async () => {
    const result = await finalizeVoiceCapture(
      { inspector: fakeInspector({ byteCount: MAX_CAPTURE_BYTES + 1 }) },
      captured,
    )
    expect(result).toEqual({ kind: 'over-size', byteCount: MAX_CAPTURE_BYTES + 1 })
  })

  it('rejects a non-decodable file', async () => {
    const result = await finalizeVoiceCapture(
      { inspector: fakeInspector({ decodable: false }) },
      captured,
    )
    expect(result).toEqual({ kind: 'not-decodable' })
  })

  it('rejects an unstable file (byte count changed between reads)', async () => {
    const result = await finalizeVoiceCapture(
      { inspector: fakeInspector({ stable: false }) },
      captured,
    )
    expect(result).toEqual({ kind: 'unstable' })
  })
})

describe('saveVoiceMemory', () => {
  it('saves a voice memory with no transcript (audio-only)', async () => {
    const repo = fakeMemoryRepository()
    const store = fakeMediaStore()
    const result = await saveVoiceMemory(
      { repository: repo, mediaStore: store, generateId: () => 'memory-1' },
      voiceInput,
    )

    expect(result.kind).toBe('saved')
    if (result.kind !== 'saved') return
    expect(result.memory).toMatchObject({
      id: 'memory-1',
      kind: 'voice',
      reviewedTranscript: '',
      media: { relativePath: 'media/memory-1.m4a', byteCount: 1000, sha256: 'deadbeef' },
      promptSnapshot: voiceInput.promptSnapshot,
    })
    expect(store.committed).toEqual(['file:///cache/rec.m4a -> media/memory-1.m4a'])
    expect(repo.memories).toHaveLength(1)
  })

  it('saves a voice memory with parent-reviewed text (audio-plus-text)', async () => {
    const repo = fakeMemoryRepository()
    const result = await saveVoiceMemory(
      { repository: repo, mediaStore: fakeMediaStore(), generateId: () => 'm' },
      { ...voiceInput, reviewedTranscript: '  I made my bed!  ' },
    )
    expect(result.kind).toBe('saved')
    if (result.kind !== 'saved') return
    expect(result.memory.reviewedTranscript).toBe('I made my bed!')
  })

  it('refuses to save media that is out of policy', async () => {
    const repo = fakeMemoryRepository()
    const result = await saveVoiceMemory(
      { repository: repo, mediaStore: fakeMediaStore(), generateId: () => 'm' },
      { ...voiceInput, validatedMedia: { ...voiceInput.validatedMedia, byteCount: MAX_CAPTURE_BYTES + 1 } },
    )
    expect(result).toMatchObject({ kind: 'not-saved', reason: 'invalid-audio', retry: { memoryId: 'm', operationId: 'm' } })
    expect(repo.memories).toHaveLength(0)
  })

  it('removes the committed media file when the database write fails', async () => {
    const repo = fakeMemoryRepository()
    repo.failCreate = new Error('db down')
    const store = fakeMediaStore()
    const result = await saveVoiceMemory(
      { repository: repo, mediaStore: store, generateId: () => 'm' },
      voiceInput,
    )
    expect(result).toMatchObject({ kind: 'not-saved', reason: 'database-commit-failed', retry: { memoryId: 'm', operationId: 'm' } })
    expect(store.removed).toEqual(['media/m.m4a'])
    expect(repo.memories).toHaveLength(0)
  })

  it('retries the same identity idempotently without creating a duplicate or orphan', async () => {
    const repo = fakeMemoryRepository()
    const store = fakeMediaStore()
    const deps = { repository: repo, mediaStore: store, generateId: () => 'm' }
    await saveVoiceMemory(deps, voiceInput)

    const second = await saveVoiceMemory(deps, voiceInput)

    expect(second.kind).toBe('saved')
    expect(repo.memories).toHaveLength(1)
    expect(store.committed).toEqual(['file:///cache/rec.m4a -> media/m.m4a'])
    expect(store.removed).toEqual([])
  })
})

it('exposes the capture policy limits', () => {
  expect(MAX_CAPTURE_DURATION_MS).toBe(5 * 60 * 1000)
  expect(MAX_CAPTURE_BYTES).toBe(32 * 1024 * 1024)
})