/**
 * Platform boundary for the researched cloud-backup exclusion policy.
 *
 * iOS excludes family-bearing resources per final file with
 * `NSURLIsExcludedFromBackupKey` and reads the value back; there is no
 * directory-level exclusion. Android relies on the app-private, no-backup
 * files root plus `allowBackup=false` and the generated backup/transfer rules
 * (a release-wide gate), so per-file exclusion is a policy no-op there.
 */
export type BackupExclusionPort = {
  /**
   * Ensures the resource will not be copied by the OS into cloud backup.
   * Resolves true when the resource is now excluded (or has nothing to
   * exclude because it does not exist), false when exclusion could not be
   * verified, and rejects on hard failure.
   */
  apply(path: string): Promise<boolean>
  /** Reads the current exclusion state of the resource. */
  isExcluded(path: string): Promise<boolean>
}

/**
 * Android policy adapter: the whole family storage root lives under the
 * app-private files directory and is excluded from cloud backup and device
 * transfer at the manifest/rules level. Per-file exclusion is not required.
 */
export function createAndroidBackupExclusion(): BackupExclusionPort {
  return {
    async apply() {
      return true
    },
    async isExcluded() {
      return true
    },
  }
}

/**
 * iOS policy adapter backed by the local `BtgNative` module
 * (`apps/mobile/modules/btg-native`), which sets and reads back
 * `NSURLIsExcludedFromBackupKey` per path. The native module is loaded
 * lazily so tests that drive the persistence boundary with fakes never touch
 * native code.
 */
export function createIosBackupExclusion(): BackupExclusionPort {
  return {
    async apply(path) {
      const { setExcludedFromBackup } = await import('../../modules/btg-native/src')
      return setExcludedFromBackup(path, true)
    },
    async isExcluded(path) {
      const { isExcludedFromBackup } = await import('../../modules/btg-native/src')
      return isExcludedFromBackup(path)
    },
  }
}