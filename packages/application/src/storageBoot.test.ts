import { describe, expect, it } from 'vitest'
import { StorageGateError } from './profile'
import {
  classifyLayoutVersions,
  classifyMediaHealth,
  classifyStorageInventory,
  resumeFilesystemMigration,
  type FilesystemEntry,
  type LayoutMigrationPort,
  type LayoutMigrationRecord,
  type ReferencedMedia,
} from './storageBoot'

const referenced: ReferencedMedia = {
  memoryId: 'memory-voice-1',
  relativePath: 'media/memory-voice-1.m4a',
  byteCount: 1000,
  sha256: 'deadbeef',
}

function finalEntry(relativePath: string, byteCount: number): FilesystemEntry {
  return { relativePath, byteCount, kind: 'recognized-final' }
}

describe('classifyLayoutVersions', () => {
  it('accepts only supported and older layouts', () => {
    expect(classifyLayoutVersions([1], 1)).toBe('ok')
    expect(classifyLayoutVersions([], 1)).toBe('ok')
    expect(classifyLayoutVersions([1, 2], 1)).toBe('version-unsafe')
    expect(classifyLayoutVersions([3], 1)).toBe('version-unsafe')
  })
})

describe('classifyStorageInventory', () => {
  it('reports a missing referenced file as unavailable without dropping the catalog row', () => {
    const report = classifyStorageInventory({
      referenced: [referenced],
      presence: [{ relativePath: referenced.relativePath, exists: false, byteCount: 0 }],
      inventory: [],
    })

    expect(report).toEqual({
      kind: 'dangerous',
      unavailable: [{ memoryId: 'memory-voice-1', reason: 'missing-file' }],
      unreferencedFinals: [],
      stale: [],
    })
  })

  it('reports a wrong-size referenced file as unavailable and keeps the identity', () => {
    const report = classifyStorageInventory({
      referenced: [referenced],
      presence: [{ relativePath: referenced.relativePath, exists: true, byteCount: 4 }],
      inventory: [finalEntry(referenced.relativePath, 4)],
    })

    expect(report).toEqual({
      kind: 'dangerous',
      unavailable: [{ memoryId: 'memory-voice-1', reason: 'wrong-size' }],
      unreferencedFinals: [],
      stale: [],
    })
  })

  it('collects recognized unreferenced finals and stale files only when the layout is known', () => {
    const report = classifyStorageInventory({
      referenced: [referenced],
      presence: [{ relativePath: referenced.relativePath, exists: true, byteCount: 1000 }],
      inventory: [
        finalEntry(referenced.relativePath, 1000),
        finalEntry('media/orphan.m4a', 80),
        { relativePath: 'media/.stale-cache.m4a', byteCount: 12, kind: 'recognized-stale' },
        { relativePath: 'media/.staging-op1', byteCount: 12, kind: 'recognized-staging' },
      ],
    })

    expect(report).toEqual({
      kind: 'safe',
      unavailable: [],
      unreferencedFinals: ['media/orphan.m4a'],
      stale: ['media/.stale-cache.m4a', 'media/.staging-op1'],
    })
  })

  it('blocks on unknown files and does not nominate anything for deletion', () => {
    const report = classifyStorageInventory({
      referenced: [referenced],
      presence: [{ relativePath: referenced.relativePath, exists: true, byteCount: 1000 }],
      inventory: [
        finalEntry(referenced.relativePath, 1000),
        { relativePath: 'media/notes.txt', byteCount: 20, kind: 'unknown' },
      ],
    })

    expect(report).toEqual({ kind: 'blocked', reason: 'root-unsafe' })
  })

  it('is safe when every referenced file matches and nothing else is present', () => {
    const report = classifyStorageInventory({
      referenced: [referenced],
      presence: [{ relativePath: referenced.relativePath, exists: true, byteCount: 1000 }],
      inventory: [finalEntry(referenced.relativePath, 1000)],
    })

    expect(report.kind).toBe('safe')
  })
})

describe('classifyMediaHealth', () => {
  it('requires a matching byte count before a checksum is considered', () => {
    expect(classifyMediaHealth({
      exists: false,
      actualByteCount: 0,
      expectedByteCount: 1000,
    })).toBe('missing-file')
    expect(classifyMediaHealth({
      exists: true,
      actualByteCount: 4,
      expectedByteCount: 1000,
      actualSha256: 'deadbeef',
      expectedSha256: 'deadbeef',
    })).toBe('wrong-size')
  })

  it('treats a checksum mismatch discovered at playback as unavailable', () => {
    expect(classifyMediaHealth({
      exists: true,
      actualByteCount: 1000,
      expectedByteCount: 1000,
      actualSha256: 'cafebabe',
      expectedSha256: 'deadbeef',
    })).toBe('checksum-mismatch')
    expect(classifyMediaHealth({
      exists: true,
      actualByteCount: 1000,
      expectedByteCount: 1000,
      actualSha256: 'deadbeef',
      expectedSha256: 'deadbeef',
    })).toBe('ok')
  })
})

function migrationPort(initial: {
  journal?: LayoutMigrationRecord | null
  failAt?: LayoutMigrationRecord['phase'] | 'remove-source' | 'write'
}): LayoutMigrationPort & {
  journal: LayoutMigrationRecord | null
  copies: number
  validations: number
  switches: number
  removals: number
  writes: LayoutMigrationRecord[]
} {
  const state: LayoutMigrationPort & {
    journal: LayoutMigrationRecord | null
    copies: number
    validations: number
    switches: number
    removals: number
    writes: LayoutMigrationRecord[]
  } = {
    journal: initial.journal ?? null,
    copies: 0,
    validations: 0,
    switches: 0,
    removals: 0,
    writes: [],
    async readJournal() {
      return state.journal
    },
    async writeJournal(record) {
      if (initial.failAt === 'write') throw new Error('journal write failed')
      state.writes.push(record)
      state.journal = record
    },
    async clearJournal() {
      state.journal = null
    },
    async copyLayout() {
      state.copies += 1
      if (initial.failAt === 'copied') throw new Error('copy failed')
    },
    async validateCopy() {
      state.validations += 1
      if (initial.failAt === 'validated') return false
      return true
    },
    async switchTo() {
      state.switches += 1
      if (initial.failAt === 'switched') throw new Error('switch failed')
    },
    async removeSourceLayout() {
      state.removals += 1
      if (initial.failAt === 'remove-source') throw new Error('remove failed')
    },
  }
  return state
}

describe('resumeFilesystemMigration', () => {
  it('is idle when no journal exists', async () => {
    const port = migrationPort({})
    expect(await resumeFilesystemMigration(port, 1)).toBe('idle')
    expect(port.copies).toBe(0)
  })

  it('refuses a newer target layout without writing', async () => {
    const port = migrationPort({
      journal: { operationId: 'op-1', sourceLayout: 1, targetLayout: 2, phase: 'prepared' },
    })

    await expect(resumeFilesystemMigration(port, 1)).rejects.toEqual(
      new StorageGateError('version-unsafe'),
    )
    expect(port.copies).toBe(0)
    expect(port.writes).toEqual([])
    expect(port.switches).toBe(0)
    expect(port.removals).toBe(0)
  })

  it('copies, validates, switches, then removes the source only after success', async () => {
    const port = migrationPort({
      journal: { operationId: 'op-1', sourceLayout: 1, targetLayout: 1, phase: 'prepared' },
    })

    expect(await resumeFilesystemMigration(port, 1)).toBe('completed')
    expect(port.copies).toBe(1)
    expect(port.validations).toBe(1)
    expect(port.switches).toBe(1)
    expect(port.removals).toBe(1)
    expect(port.journal).toBeNull()
    expect(port.writes.map((entry) => entry.phase)).toEqual(['copied', 'validated', 'switched'])
  })

  it('preserves the source and the journal when copy fails', async () => {
    const prepared: LayoutMigrationRecord = {
      operationId: 'op-1',
      sourceLayout: 1,
      targetLayout: 1,
      phase: 'prepared',
    }
    const port = migrationPort({ journal: prepared, failAt: 'copied' })

    await expect(resumeFilesystemMigration(port, 1)).rejects.toEqual(
      new StorageGateError('version-unsafe'),
    )
    expect(port.journal).toEqual(prepared)
    expect(port.switches).toBe(0)
    expect(port.removals).toBe(0)
  })

  it('does not remove the source when validation fails', async () => {
    const port = migrationPort({
      journal: { operationId: 'op-1', sourceLayout: 1, targetLayout: 1, phase: 'copied' },
      failAt: 'validated',
    })

    await expect(resumeFilesystemMigration(port, 1)).rejects.toEqual(
      new StorageGateError('version-unsafe'),
    )
    expect(port.removals).toBe(0)
    expect(port.switches).toBe(0)
    expect(port.journal?.phase).toBe('copied')
  })

  it('resumes from switched and retries source removal', async () => {
    const port = migrationPort({
      journal: { operationId: 'op-1', sourceLayout: 1, targetLayout: 1, phase: 'switched' },
    })

    expect(await resumeFilesystemMigration(port, 1)).toBe('completed')
    expect(port.copies).toBe(0)
    expect(port.removals).toBe(1)
    expect(port.journal).toBeNull()
  })
})
