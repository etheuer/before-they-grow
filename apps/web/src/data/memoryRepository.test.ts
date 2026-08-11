import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRepository, type MemoryRepository } from './memoryRepository'

let repository: MemoryRepository

beforeEach(() => {
  repository = createMemoryRepository(`test-${crypto.randomUUID()}`)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await repository.deleteAll()
  repository.close()
})

describe('memory repository', () => {
  it('defers IndexedDB access so synchronous open failures reject instead of crashing creation', async () => {
    const open = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new DOMException('Access to IndexedDB is denied', 'SecurityError')
    })

    let recoveringRepository: MemoryRepository | undefined
    expect(() => {
      recoveringRepository = createMemoryRepository(`denied-${crypto.randomUUID()}`)
    }).not.toThrow()

    await expect(recoveringRepository!.getProfile()).rejects.toMatchObject({
      name: 'SecurityError',
    })
    open.mockRestore()
  })

  it('retries opening IndexedDB after a synchronous access failure', async () => {
    const databaseName = `retry-${crypto.randomUUID()}`
    const actualOpen = indexedDB.open.bind(indexedDB)
    const open = vi.spyOn(indexedDB, 'open')
      .mockImplementationOnce(() => {
        throw new DOMException('Access to IndexedDB is denied', 'SecurityError')
      })
      .mockImplementation((name, version) => actualOpen(name, version))
    const recoveringRepository = createMemoryRepository(databaseName)

    await expect(recoveringRepository.getProfile()).rejects.toMatchObject({
      name: 'SecurityError',
    })
    await expect(recoveringRepository.getProfile()).resolves.toBeNull()

    await recoveringRepository.deleteAll()
    recoveringRepository.close()
    open.mockRestore()
  })

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
