import { describe, expect, it } from 'vitest'
import type { MemoryEntryV1 } from '@before-they-grow/contracts'
import { StorageGateError } from './profile'
import {
  deleteAllFamilyContent,
  hardDeleteMemory,
  resumeFamilyWipe,
  resumeIndividualDeletions,
  type FamilyWipePort,
  type IndividualDeletionPhase,
  type IndividualDeletionPort,
  type IndividualDeletionRecord,
} from './hardDelete'

const voice: MemoryEntryV1 = {
  id: 'memory-voice-1',
  kind: 'voice',
  promptSnapshot: {
    promptId: '6-8-memory-proud',
    question: 'What happened today that made you feel proud?',
    followUp: 'What did you do to make it happen?',
    ageBand: '6-8',
  },
  reviewedTranscript: 'I made my bed.',
  capturedAt: '2026-08-11T22:05:00.000Z',
  savedAt: '2026-08-11T22:05:00.000Z',
  localDate: '2026-08-11',
  timeZone: 'UTC',
  media: {
    relativePath: 'media/memory-voice-1.m4a',
    byteCount: 1000,
    sha256: 'deadbeef',
  },
}

const other: MemoryEntryV1 = {
  ...voice,
  id: 'keep',
  kind: 'text-only',
  reviewedTranscript: 'kept',
  media: null,
}

type FailAt =
  | IndividualDeletionPhase
  | 'mark'
  | 'media'
  | 'checkpoint'
  | 'verify'
  | 'clear'
  | 'write-marker'
  | 'close'
  | 'wipe'
  | 'verify-wipe'
  | 'clear-marker'

function deletionCatalog(initial: MemoryEntryV1[] = [], failAt: FailAt | null = null) {
  const memories = [...initial]
  const pending: IndividualDeletionRecord[] = []
  const removedMedia: string[] = []
  const presentMedia = new Set(
    initial.flatMap((entry) => (entry.media ? [entry.media.relativePath] : [])),
  )
  let checkpoints = 0

  const throwIf = (step: FailAt) => {
    if (failAt === step) throw new Error(`injected failure at ${step}`)
  }

  const deletion: IndividualDeletionPort = {
    async findById(id) {
      return memories.find((entry) => entry.id === id) ?? null
    },
    async markDeleting(id) {
      throwIf('mark')
      const existing = pending.find((entry) => entry.memoryId === id)
      if (existing) return existing
      const memory = memories.find((entry) => entry.id === id)
      if (!memory) return 'missing'
      const record: IndividualDeletionRecord = {
        memoryId: id,
        relativePath: memory.media?.relativePath ?? null,
        phase: 'marked',
      }
      pending.push(record)
      return record
    },
    async listPending() {
      return pending.map((entry) => ({ ...entry }))
    },
    async advancePhase(memoryId, phase) {
      const record = pending.find((entry) => entry.memoryId === memoryId)
      if (record) record.phase = phase
    },
    async removeRows(memoryId) {
      throwIf('rows-deleted')
      const before = memories.length
      memories.splice(0, memories.length, ...memories.filter((entry) => entry.id !== memoryId))
      if (before === memories.length) throw new Error('row delete missed the identity')
    },
    async checkpoint() {
      throwIf('checkpoint')
      checkpoints += 1
    },
    async verifyAbsent(memoryId) {
      throwIf('verify')
      const rowGone = !memories.some((entry) => entry.id === memoryId)
      const record = pending.find((entry) => entry.memoryId === memoryId)
      const mediaGone = !record?.relativePath || !presentMedia.has(record.relativePath)
      return rowGone && mediaGone
    },
    async clear(memoryId) {
      throwIf('clear')
      const index = pending.findIndex((entry) => entry.memoryId === memoryId)
      if (index >= 0) pending.splice(index, 1)
    },
  }

  return {
    memories,
    pending,
    removedMedia,
    presentMedia,
    get checkpoints() {
      return checkpoints
    },
    deletion,
    mediaStore: {
      async removeFinal(relativePath: string) {
        throwIf('media')
        removedMedia.push(relativePath)
        presentMedia.delete(relativePath)
      },
    },
    visible() {
      const hidden = new Set(pending.map((entry) => entry.memoryId))
      return memories.filter((entry) => !hidden.has(entry.id)).map((entry) => entry.id)
    },
  }
}

function wipeStore(options: {
  failAt?: FailAt | null
  familyFiles?: string[]
  unrelatedFiles?: string[]
} = {}) {
  const failAt = options.failAt ?? null
  const family = new Set(options.familyFiles ?? ['profile-v1.db', 'media/voice.m4a', 'layout-migration.journal'])
  const unrelated = new Set(options.unrelatedFiles ?? ['../unrelated-notes.txt'])
  let marker = false
  let catalogOpen = true
  const events: string[] = []

  const throwIf = (step: FailAt) => {
    if (failAt === step) throw new Error(`injected failure at ${step}`)
  }

  const wipe: FamilyWipePort = {
    async markerPresent() {
      return marker
    },
    async writeMarker() {
      throwIf('write-marker')
      marker = true
      events.push('write-marker')
    },
    async clearMarker() {
      throwIf('clear-marker')
      marker = false
      events.push('clear-marker')
    },
    async closeCatalog() {
      throwIf('close')
      catalogOpen = false
      events.push('close')
    },
    async wipeFamilyContent() {
      throwIf('wipe')
      family.clear()
      events.push('wipe')
    },
    async verifyWiped() {
      throwIf('verify-wipe')
      return family.size === 0
    },
  }

  return {
    wipe,
    events,
    get marker() {
      return marker
    },
    set marker(value: boolean) {
      marker = value
    },
    get catalogOpen() {
      return catalogOpen
    },
    family,
    unrelated,
  }
}

describe('hardDeleteMemory', () => {
  it('marks the memory hidden, removes media and rows, checkpoints, then reports deleted only after absence', async () => {
    const catalog = deletionCatalog([voice, other])

    const result = await hardDeleteMemory(
      { deletion: catalog.deletion, mediaStore: catalog.mediaStore },
      voice.id,
    )

    expect(result).toBe('deleted')
    expect(catalog.visible()).toEqual(['keep'])
    expect(catalog.memories.map((entry) => entry.id)).toEqual(['keep'])
    expect(catalog.removedMedia).toEqual(['media/memory-voice-1.m4a'])
    expect(catalog.presentMedia.size).toBe(0)
    expect(catalog.checkpoints).toBe(1)
    expect(catalog.pending).toEqual([])
  })

  it('reports missing when the memory is already gone', async () => {
    const catalog = deletionCatalog()
    expect(
      await hardDeleteMemory({ deletion: catalog.deletion, mediaStore: catalog.mediaStore }, 'gone'),
    ).toBe('missing')
  })

  it('does not claim success when media removal fails after the memory is marked', async () => {
    const catalog = deletionCatalog([voice, other], 'media')

    await expect(
      hardDeleteMemory({ deletion: catalog.deletion, mediaStore: catalog.mediaStore }, voice.id),
    ).rejects.toEqual(new StorageGateError('deletion-incomplete'))

    expect(catalog.visible()).toEqual(['keep'])
    expect(catalog.memories.map((entry) => entry.id)).toContain(voice.id)
    expect(catalog.pending[0]?.phase).toBe('marked')
    expect(catalog.presentMedia.has('media/memory-voice-1.m4a')).toBe(true)
  })

  it('does not claim success when row delete fails after media is gone', async () => {
    const catalog = deletionCatalog([voice, other], 'rows-deleted')

    await expect(
      hardDeleteMemory({ deletion: catalog.deletion, mediaStore: catalog.mediaStore }, voice.id),
    ).rejects.toEqual(new StorageGateError('deletion-incomplete'))

    expect(catalog.removedMedia).toEqual(['media/memory-voice-1.m4a'])
    expect(catalog.memories.map((entry) => entry.id)).toContain(voice.id)
    expect(catalog.pending[0]?.phase).toBe('media-removed')
  })

  it('does not claim success when the WAL checkpoint fails', async () => {
    const catalog = deletionCatalog([voice], 'checkpoint')

    await expect(
      hardDeleteMemory({ deletion: catalog.deletion, mediaStore: catalog.mediaStore }, voice.id),
    ).rejects.toEqual(new StorageGateError('deletion-incomplete'))

    expect(catalog.memories).toEqual([])
    expect(catalog.pending[0]?.phase).toBe('rows-deleted')
  })

  it('does not claim success when absence cannot be verified', async () => {
    const catalog = deletionCatalog([voice], 'verify')

    await expect(
      hardDeleteMemory({ deletion: catalog.deletion, mediaStore: catalog.mediaStore }, voice.id),
    ).rejects.toEqual(new StorageGateError('deletion-incomplete'))

    expect(catalog.pending.length).toBe(1)
  })
})

describe('resumeIndividualDeletions', () => {
  it('finishes a marked deletion before any memory stays visible', async () => {
    const catalog = deletionCatalog([voice, other])
    catalog.pending.push({
      memoryId: voice.id,
      relativePath: 'media/memory-voice-1.m4a',
      phase: 'marked',
    })

    await resumeIndividualDeletions({ deletion: catalog.deletion, mediaStore: catalog.mediaStore })

    expect(catalog.memories.map((entry) => entry.id)).toEqual(['keep'])
    expect(catalog.removedMedia).toEqual(['media/memory-voice-1.m4a'])
    expect(catalog.pending).toEqual([])
    expect(catalog.visible()).toEqual(['keep'])
  })

  it('resumes from media-removed without deleting unrelated files', async () => {
    const catalog = deletionCatalog([voice, other])
    catalog.pending.push({
      memoryId: voice.id,
      relativePath: 'media/memory-voice-1.m4a',
      phase: 'media-removed',
    })
    catalog.presentMedia.delete('media/memory-voice-1.m4a')

    await resumeIndividualDeletions({ deletion: catalog.deletion, mediaStore: catalog.mediaStore })

    expect(catalog.removedMedia).toEqual([])
    expect(catalog.memories.map((entry) => entry.id)).toEqual(['keep'])
  })

  it('resumes a rows-deleted memory by checkpointing and verifying absence', async () => {
    const catalog = deletionCatalog([other])
    catalog.pending.push({
      memoryId: voice.id,
      relativePath: 'media/memory-voice-1.m4a',
      phase: 'rows-deleted',
    })
    catalog.presentMedia.delete('media/memory-voice-1.m4a')

    await resumeIndividualDeletions({ deletion: catalog.deletion, mediaStore: catalog.mediaStore })

    expect(catalog.checkpoints).toBe(1)
    expect(catalog.pending).toEqual([])
  })

  it('keeps storage blocked when resume cannot finish', async () => {
    const catalog = deletionCatalog([voice], 'media')
    catalog.pending.push({
      memoryId: voice.id,
      relativePath: 'media/memory-voice-1.m4a',
      phase: 'marked',
    })

    await expect(
      resumeIndividualDeletions({ deletion: catalog.deletion, mediaStore: catalog.mediaStore }),
    ).rejects.toEqual(new StorageGateError('deletion-incomplete'))
    expect(catalog.pending[0]?.phase).toBe('marked')
  })
})

describe('deleteAllFamilyContent', () => {
  it('writes a marker, closes the catalog, wipes family content, verifies, then clears the marker', async () => {
    const store = wipeStore()

    expect(await deleteAllFamilyContent({ wipe: store.wipe })).toBe('deleted')
    expect(store.events).toEqual(['write-marker', 'close', 'wipe', 'clear-marker'])
    expect(store.marker).toBe(false)
    expect(store.catalogOpen).toBe(false)
    expect([...store.family]).toEqual([])
    expect([...store.unrelated]).toEqual(['../unrelated-notes.txt'])
  })

  it('does not claim success when wipe fails after the marker is written', async () => {
    const store = wipeStore({ failAt: 'wipe' })

    await expect(deleteAllFamilyContent({ wipe: store.wipe })).rejects.toEqual(
      new StorageGateError('deletion-incomplete'),
    )
    expect(store.marker).toBe(true)
    expect(store.family.size).toBeGreaterThan(0)
  })

  it('does not claim success when absence cannot be verified', async () => {
    const store = wipeStore({ failAt: 'verify-wipe' })

    await expect(deleteAllFamilyContent({ wipe: store.wipe })).rejects.toEqual(
      new StorageGateError('deletion-incomplete'),
    )
    expect(store.marker).toBe(true)
  })
})

describe('resumeFamilyWipe', () => {
  it('is idle when no wipe marker exists', async () => {
    const store = wipeStore()
    expect(await resumeFamilyWipe({ wipe: store.wipe })).toBe('idle')
    expect(store.events).toEqual([])
    expect(store.family.size).toBeGreaterThan(0)
  })

  it('finishes a marked wipe before an empty store can unlock', async () => {
    const store = wipeStore()
    store.marker = true

    expect(await resumeFamilyWipe({ wipe: store.wipe })).toBe('deleted')
    expect(store.events).toEqual(['close', 'wipe', 'clear-marker'])
    expect(store.marker).toBe(false)
    expect([...store.family]).toEqual([])
    expect([...store.unrelated]).toEqual(['../unrelated-notes.txt'])
  })

  it('keeps the marker and blocks when resume cannot finish', async () => {
    const store = wipeStore({ failAt: 'wipe' })
    store.marker = true

    await expect(resumeFamilyWipe({ wipe: store.wipe })).rejects.toEqual(
      new StorageGateError('deletion-incomplete'),
    )
    expect(store.marker).toBe(true)
    expect(store.family.size).toBeGreaterThan(0)
  })
})
