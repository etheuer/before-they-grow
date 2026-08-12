/**
 * Application-private subdirectory for all family storage. The layout version
 * is encoded in the directory path so an upgraded layout is never silently
 * read as the current one.
 */
export const familyStorageDirectoryName = 'BeforeTheyGrow'

/** Version of the on-disk layout under the canonical storage root. */
export const storageLayoutVersion = 1

export function resolveStorageRoot(
  documentDirectory: string,
  layoutVersion: number = storageLayoutVersion,
): string {
  return `${documentDirectory}/${familyStorageDirectoryName}/layout-v${layoutVersion}`
}

export function resolveProfileDatabasePath(
  documentDirectory: string,
  databaseFileName: string,
  layoutVersion: number = storageLayoutVersion,
): string {
  return `${resolveStorageRoot(documentDirectory, layoutVersion)}/${databaseFileName}`
}