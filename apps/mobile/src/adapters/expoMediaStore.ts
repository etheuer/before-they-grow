import { Directory, File } from 'expo-file-system'
import { StorageGateError, type MediaStorePort } from '@before-they-grow/application'
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
    const legacy = await import('expo-file-system/legacy')
    if (!legacy.documentDirectory) throw new StorageGateError('root-unsafe')
    return new Directory(
      legacy.documentDirectory,
      familyStorageDirectoryName,
      `layout-v${storageLayoutVersion}`,
      'media',
    )
  }

  return {
    async commit(sourceUri, relativePath) {
      const directory = await mediaRoot()
      directory.create({ idempotent: true, intermediates: true })

      const fileName = relativePath.split('/').pop()
      if (!fileName) throw new StorageGateError('root-unsafe')

      const target = new File(directory, fileName)
      const source = new File(sourceUri)
      await source.move(target)

      const excluded = await exclusion.apply(target.uri)
      if (!excluded) {
        await target.delete()
        throw new StorageGateError('backup-control-failed')
      }
    },

    async removeFinal(relativePath) {
      const fileName = relativePath.split('/').pop()
      if (!fileName) return
      const target = new File(await mediaRoot(), fileName)
      if (target.exists) await target.delete()
    },

    async resolve(relativePath) {
      const fileName = relativePath.split('/').pop()
      if (!fileName) throw new StorageGateError('root-unsafe')
      return new File(await mediaRoot(), fileName).uri
    },
  }
}