import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryRepository, type MemoryRepository } from './memoryRepository'

let repository: MemoryRepository

beforeEach(() => {
  repository = createMemoryRepository(`test-${crypto.randomUUID()}`)
})

afterEach(async () => {
  await repository.deleteAll()
  repository.close()
})

describe('memory repository', () => {
  it('persists the family profile', async () => {
    expect(await repository.getProfile()).toBeNull()

    await repository.saveProfile({
      childName: 'Milo',
      ageBand: '6-8',
      consentedAt: '2026-08-10T20:00:00.000Z',
    })

    await expect(repository.getProfile()).resolves.toEqual({
      childName: 'Milo',
      ageBand: '6-8',
      consentedAt: '2026-08-10T20:00:00.000Z',
    })
  })

  it('returns saved memories newest first and preserves audio', async () => {
    await repository.addMemory({
      id: 'older',
      promptId: 'prompt-1',
      question: 'What made you laugh today?',
      answerText: 'The dog sneezed.',
      audio: new Blob(['older-audio'], { type: 'audio/webm' }),
      recordedAt: '2026-08-09T20:00:00.000Z',
    })
    await repository.addMemory({
      id: 'newer',
      promptId: 'prompt-2',
      question: 'What made you proud today?',
      answerText: '',
      audio: null,
      recordedAt: '2026-08-10T20:00:00.000Z',
    })

    const memories = await repository.listMemories()

    expect(memories.map((memory) => memory.id)).toEqual(['newer', 'older'])
    expect(memories[1].audio).toBeInstanceOf(Blob)
    expect(await memories[1].audio?.text()).toBe('older-audio')
  })

  it('deletes all profile and memory data', async () => {
    await repository.saveProfile({
      childName: 'Milo',
      ageBand: '6-8',
      consentedAt: '2026-08-10T20:00:00.000Z',
    })
    await repository.addMemory({
      id: 'memory-1',
      promptId: 'prompt-1',
      question: 'What made you laugh today?',
      answerText: 'The dog sneezed.',
      audio: null,
      recordedAt: '2026-08-10T20:00:00.000Z',
    })

    await repository.deleteAll()

    await expect(repository.getProfile()).resolves.toBeNull()
    await expect(repository.listMemories()).resolves.toEqual([])
  })
})
