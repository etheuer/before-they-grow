import { requireNativeModule } from 'expo-modules-core'

/**
 * Lazy access to the BtgNative native module so importing this file never
 * touches native code (tests drive the persistence boundary with fakes).
 */
function native() {
  return requireNativeModule('BtgNative') as {
    setExcludedFromBackup(path: string, excluded: boolean): Promise<boolean>
  }
}

/**
 * Sets NSURLIsExcludedFromBackupKey on the resource and returns whether the
 * read-back value matches. A path that has nothing to exclude (a missing
 * transient sibling such as -wal) resolves true.
 */
export function setExcludedFromBackup(path: string, excluded: boolean): Promise<boolean> {
  return native().setExcludedFromBackup(path, excluded)
}