import { profileLayoutVersion } from '@before-they-grow/contracts'

/**
 * Application-private subdirectory for all family storage. The layout version
 * is encoded in the directory path so an upgraded layout is never silently
 * read as the current one.
 */
export const familyStorageDirectoryName = 'BeforeTheyGrow'

export function resolveStorageRoot(
  documentDirectory: string,
  layoutVersion: number = profileLayoutVersion,
): string {
  return `${documentDirectory}/${familyStorageDirectoryName}/layout-v${layoutVersion}`
}

export function resolveProfileDatabasePath(
  documentDirectory: string,
  databaseFileName: string,
  layoutVersion: number = profileLayoutVersion,
): string {
  return `${resolveStorageRoot(documentDirectory, layoutVersion)}/${databaseFileName}`
}