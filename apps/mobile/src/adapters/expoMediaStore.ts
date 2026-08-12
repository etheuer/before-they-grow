import * as Crypto from 'expo-crypto'
import { Directory, File, Paths } from 'expo-file-system'
import { documentDirectory } from 'expo-file-system/legacy'
import {
  SaveCapacityError,
  SaveIndeterminateError,
  StorageGateError,
  classifyLayoutVersions,
  type FilesystemEntry,
  type FilesystemEntryKind,
  type LayoutMigrationPort,
  type LayoutMigrationRecord,
  type MediaPresence,
  type MediaStorePort,
  type StorageInventoryPort,
  type UnavailableReason,
} from '@before-they-grow/application'
import type { BackupExclusionPort } from './backupExclusion'
import { familyStorageDirectoryName, storageLayoutVersion } from './storageRoot'

export const layoutMigrationJournalName = 'layout-migration.journal'

const RECOGNIZED_FINAL = /^[A-Za-z0-9_-]+\.m4a$/
const RECOGNIZED_STAGING = /^\.staging-[A-Za-z0-9._-]+$/
const RECOGNIZED_STALE = /^\.stale-[A-Za-z0-9._-]+$/
const LAYOUT_DIRECTORY = /^layout-v(\d+)$/
const CATALOG_FILES = new Set([
  'profile-v1.db',
  'profile-v1.db-wal',
  'profile-v1.db-shm',
])

export type FamilyMediaStore = MediaStorePort & StorageInventoryPort & LayoutMigrationPort & {
  verifyPlayback(
    relativePath: string,
    expected: { byteCount: number; sha256: string },
  ): Promise<'ok' | UnavailableReason>
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let hex = ''
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

function familyRoot(): Directory {
  if (!documentDirectory) throw new StorageGateError('root-unsafe')
  return new Directory(documentDirectory, familyStorageDirectoryName)
}

function layoutRoot(version: number = storageLayoutVersion): Directory {
  return new Directory(familyRoot(), `layout-v${version}`)
}

function mediaRoot(version: number = storageLayoutVersion): Directory {
  return new Directory(layoutRoot(version), 'media')
}

function journalFile(): File {
  return new File(familyRoot(), layoutMigrationJournalName)
}

function classifyMediaName(name: string): FilesystemEntryKind | null {
  if (RECOGNIZED_FINAL.test(name)) return 'recognized-final'
  if (RECOGNIZED_STAGING.test(name)) return 'recognized-staging'
  if (RECOGNIZED_STALE.test(name)) return 'recognized-stale'
  return null
}

function targetFor(relativePath: string, version: number = storageLayoutVersion): File {
  const fileName = relativePath.split('/').pop()
  if (!fileName || relativePath !== `media/${fileName}`) {
    throw new StorageGateError('root-unsafe')
  }
  return new File(mediaRoot(version), fileName)
}

/**
 * Commits validated cache recordings into the canonical family root's media
 * area. The same adapter owns bootstrap inventory, stale/orphan cleanup, and
 * the opaque filesystem-migration journal.
 */
export function createExpoMediaStorePort(exclusion: BackupExclusionPort): FamilyMediaStore {
  const listLayoutVersions = async (): Promise<number[]> => {
    const family = familyRoot()
    if (!family.exists) return []
    const versions: number[] = []
    for (const entry of family.list()) {
      if (!(entry instanceof Directory)) continue
      const match = LAYOUT_DIRECTORY.exec(entry.name)
      if (match) versions.push(Number(match[1]))
    }
    return versions
  }

  const inspectInventory = async (): Promise<FilesystemEntry[]> => {
    const family = familyRoot()
    if (!family.exists) return []
    const entries: FilesystemEntry[] = []

    for (const entry of family.list()) {
      if (entry instanceof Directory) {
        if (LAYOUT_DIRECTORY.test(entry.name)) continue
        entries.push({ relativePath: entry.name, byteCount: 0, kind: 'unknown' })
        continue
      }
      if (entry instanceof File) {
        if (entry.name === layoutMigrationJournalName) {
          entries.push({
            relativePath: entry.name,
            byteCount: entry.size ?? 0,
            kind: 'recognized-journal',
          })
          continue
        }
        entries.push({
          relativePath: entry.name,
          byteCount: entry.size ?? 0,
          kind: 'unknown',
        })
      }
    }

    const layout = layoutRoot()
    if (!layout.exists) return entries
    for (const entry of layout.list()) {
      if (entry instanceof Directory) {
        if (entry.name === 'media') continue
        entries.push({ relativePath: entry.name, byteCount: 0, kind: 'unknown' })
        continue
      }
      if (entry instanceof File) {
        const kind: FilesystemEntryKind = CATALOG_FILES.has(entry.name)
          ? 'recognized-catalog'
          : 'unknown'
        entries.push({
          relativePath: entry.name,
          byteCount: entry.size ?? 0,
          kind,
        })
      }
    }

    const media = mediaRoot()
    if (!media.exists) return entries
    for (const entry of media.list()) {
      if (!(entry instanceof File)) {
        entries.push({ relativePath: `media/${entry.name}`, byteCount: 0, kind: 'unknown' })
        continue
      }
      const kind = classifyMediaName(entry.name) ?? 'unknown'
      entries.push({
        relativePath: `media/${entry.name}`,
        byteCount: entry.size ?? 0,
        kind,
      })
    }
    return entries
  }

  return {
    async preflight(requiredBytes) {
      try {
        if (Paths.availableDiskSpace < requiredBytes) throw new SaveCapacityError()
      } catch (error) {
        if (error instanceof SaveCapacityError) throw error
        throw new StorageGateError('root-unsafe')
      }
    },

    async commit(sourceUri, relativePath) {
      const directory = mediaRoot()
      directory.create({ idempotent: true, intermediates: true })
      const target = targetFor(relativePath)
      if (target.exists) {
        // A target with no observed catalog row is an unresolved prior attempt.
        // Never overwrite it during a retry; bootstrap owns reconciliation.
        throw new SaveIndeterminateError('media-commit-uncertain')
      }

      const source = new File(sourceUri)
      let moved = false
      try {
        await source.move(target)
        moved = true
        const excluded = await exclusion.apply(target.uri)
        if (!excluded) {
          throw new SaveIndeterminateError('backup-control-failed')
        }
      } catch (error) {
        if (error instanceof SaveCapacityError) throw error
        if (moved) {
          if (error instanceof SaveIndeterminateError) throw error
          throw new SaveIndeterminateError('media-commit-uncertain')
        }
        const message = error instanceof Error ? error.message : String(error)
        if (/(?:out of space|no space|disk full|enospc)/i.test(message)) {
          throw new SaveCapacityError()
        }
        throw error
      }
    },

    async removeFinal(relativePath) {
      const target = targetFor(relativePath)
      if (target.exists) await target.delete()
    },

    async removeCache(uri) {
      const file = new File(uri)
      if (file.exists) await file.delete()
    },

    async reconcileFinal(relativePath) {
      const target = targetFor(relativePath)
      if (!target.exists) return false
      try {
        const excluded = await exclusion.apply(target.uri)
        if (!excluded) throw new StorageGateError('backup-control-failed')
      } catch (error) {
        if (error instanceof StorageGateError) throw error
        throw new StorageGateError('backup-control-failed')
      }
      return true
    },

    async resolve(relativePath) {
      return targetFor(relativePath).uri
    },

    async verifyRoots() {
      if (!documentDirectory) throw new StorageGateError('root-unsafe')
      const family = familyRoot()
      if (family.exists) {
        const versions = await listLayoutVersions()
        if (classifyLayoutVersions(versions, storageLayoutVersion) === 'version-unsafe') {
          throw new StorageGateError('version-unsafe')
        }
        for (const entry of family.list()) {
          if (entry instanceof Directory && LAYOUT_DIRECTORY.test(entry.name)) continue
          if (entry instanceof File && entry.name === layoutMigrationJournalName) continue
          throw new StorageGateError('root-unsafe')
        }
      }
      try {
        layoutRoot().create({ idempotent: true, intermediates: true })
        mediaRoot().create({ idempotent: true, intermediates: true })
      } catch {
        throw new StorageGateError('root-unsafe')
      }
    },

    listLayoutVersions,

    inspectInventory,

    async listReferenced(relativePaths) {
      const presence: MediaPresence[] = []
      for (const relativePath of relativePaths) {
        try {
          const file = targetFor(relativePath)
          presence.push({
            relativePath,
            exists: file.exists,
            byteCount: file.exists ? file.size ?? 0 : 0,
          })
        } catch {
          presence.push({ relativePath, exists: false, byteCount: 0 })
        }
      }
      return presence
    },

    async reconcileUnreferenced(referencedRelativePaths) {
      const keep = new Set(referencedRelativePaths)
      const media = mediaRoot()
      if (!media.exists) return
      for (const entry of media.list()) {
        if (!(entry instanceof File)) continue
        if (!RECOGNIZED_FINAL.test(entry.name)) continue
        const relativePath = `media/${entry.name}`
        if (!keep.has(relativePath) && entry.exists) await entry.delete()
      }
    },

    async cleanRecognizedStale() {
      const media = mediaRoot()
      if (!media.exists) return
      for (const entry of media.list()) {
        if (!(entry instanceof File)) continue
        if (RECOGNIZED_STALE.test(entry.name) || RECOGNIZED_STAGING.test(entry.name)) {
          if (entry.exists) await entry.delete()
        }
      }
    },

    async applyBackupControls() {
      const media = mediaRoot()
      if (!media.exists) return
      for (const entry of media.list()) {
        if (!(entry instanceof File) || !RECOGNIZED_FINAL.test(entry.name)) continue
        const excluded = await exclusion.apply(entry.uri)
        if (!excluded) throw new StorageGateError('backup-control-failed')
      }
    },

    async verifyPlayback(relativePath, expected) {
      const target = targetFor(relativePath)
      if (!target.exists) return 'missing-file'
      const byteCount = target.size ?? 0
      if (byteCount !== expected.byteCount) return 'wrong-size'
      const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await target.arrayBuffer())
      if (toHex(digest) !== expected.sha256) return 'checksum-mismatch'
      return 'ok'
    },

    async readJournal() {
      const file = journalFile()
      if (!file.exists) return null
      try {
        const parsed = JSON.parse(await file.text()) as LayoutMigrationRecord
        if (
          !parsed
          || typeof parsed.operationId !== 'string'
          || typeof parsed.sourceLayout !== 'number'
          || typeof parsed.targetLayout !== 'number'
          || (parsed.phase !== 'prepared'
            && parsed.phase !== 'copied'
            && parsed.phase !== 'validated'
            && parsed.phase !== 'switched')
        ) {
          throw new StorageGateError('integrity-failed')
        }
        return parsed
      } catch (error) {
        if (error instanceof StorageGateError) throw error
        throw new StorageGateError('integrity-failed')
      }
    },

    async writeJournal(record) {
      const family = familyRoot()
      family.create({ idempotent: true, intermediates: true })
      const file = journalFile()
      file.write(JSON.stringify({
        operationId: record.operationId,
        sourceLayout: record.sourceLayout,
        targetLayout: record.targetLayout,
        phase: record.phase,
      }))
    },

    async clearJournal() {
      const file = journalFile()
      if (file.exists) await file.delete()
    },

    async copyLayout(sourceLayout, targetLayout) {
      const source = layoutRoot(sourceLayout)
      const target = layoutRoot(targetLayout)
      if (!source.exists) throw new StorageGateError('version-unsafe')
      target.create({ idempotent: true, intermediates: true })
      mediaRoot(targetLayout).create({ idempotent: true, intermediates: true })
      const sourceMedia = mediaRoot(sourceLayout)
      if (!sourceMedia.exists) return
      for (const entry of sourceMedia.list()) {
        if (!(entry instanceof File) || !RECOGNIZED_FINAL.test(entry.name)) continue
        const destination = new File(mediaRoot(targetLayout), entry.name)
        if (destination.exists) continue
        await entry.copy(destination)
      }
    },

    async validateCopy(sourceLayout, targetLayout) {
      const sourceMedia = mediaRoot(sourceLayout)
      if (!sourceMedia.exists) return true
      for (const entry of sourceMedia.list()) {
        if (!(entry instanceof File) || !RECOGNIZED_FINAL.test(entry.name)) continue
        const destination = new File(mediaRoot(targetLayout), entry.name)
        if (!destination.exists || destination.size !== entry.size) return false
      }
      return true
    },

    async switchTo() {
      // Relative catalog paths stay stable across layout directories; the
      // supported-layout constant is the switch. Journal phase records it.
    },

    async removeSourceLayout(sourceLayout) {
      if (sourceLayout === storageLayoutVersion) return
      const source = layoutRoot(sourceLayout)
      if (source.exists) await source.delete()
    },
  }
}
