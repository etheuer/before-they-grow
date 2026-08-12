import { Directory, File, Paths } from 'expo-file-system'
import { documentDirectory } from 'expo-file-system/legacy'
import {
  SaveCapacityError,
  SaveIndeterminateError,
  StorageGateError,
  type MediaStorePort,
} from '@before-they-grow/application'
import type { BackupExclusionPort } from './backupExclusion'
import { familyStorageDirectoryName, storageLayoutVersion } from './storageRoot'

/**
 * Commits validated cache recordings into the canonical family root's media
 * area. The move happens on the same filesystem (an atomic rename), the final
 * file's backup exclusion is applied and read back, and only an opaque
 * relative path (`media/<uuid>.m4a`) is ever returned — filenames carry no
 * family content.
 */
export function createExpoMediaStorePort(exclusion: BackupExclusionPort): MediaStorePort {
  const mediaRoot = async (): Promise<Directory> => {
    if (!documentDirectory) throw new StorageGateError('root-unsafe')
    return new Directory(
      documentDirectory,
      familyStorageDirectoryName,
      `layout-v${storageLayoutVersion}`,
      'media',
    )
  }

  const targetFor = async (relativePath: string): Promise<File> => {
    const fileName = relativePath.split('/').pop()
    if (!fileName || relativePath !== `media/${fileName}`) {
      throw new StorageGateError('root-unsafe')
    }
    return new File(await mediaRoot(), fileName)
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
      const directory = await mediaRoot()
      directory.create({ idempotent: true, intermediates: true })
      const target = await targetFor(relativePath)
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
      const target = await targetFor(relativePath)
      if (target.exists) await target.delete()
    },

    async removeCache(uri) {
      const file = new File(uri)
      if (file.exists) await file.delete()
    },

    async reconcileFinal(relativePath) {
      const target = await targetFor(relativePath)
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
      return (await targetFor(relativePath)).uri
    },
  }
}
