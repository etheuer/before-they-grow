# Local-only storage and cloud-backup exclusion

**Decision for the initial native release:** recordings, transcripts, child/profile metadata, and any derived local files stay in app-private on-device storage. The release provides no product cloud backup, sync, download, export, import, or restore. OS migration is not a product feature or promise.

**Reading key:** **Verified** is supported by the linked primary source. **Recommendation** is the implementation choice. **Drill** is deliberately not asserted until observed on signed physical-device builds.

## What “local only” can truthfully mean

**Verified.** iCloud Backup periodically includes app data; Apple provides a per-resource exclusion mechanism. Android Auto Backup includes most app internal files, databases, preferences, and app-specific external files by default, and uploads backup data to the user’s Google Drive. [Apple QA1719](https://developer.apple.com/library/archive/qa/qa1719/_index.html) · [Android Auto Backup](https://developer.android.com/identity/data/autobackup)

**Recommendation.** Product copy may say: *“Memories are stored locally in this app. We configure family recordings and memory metadata to be excluded from iCloud Backup and Google cloud backup. We do not provide cloud sync or recovery.”* It must also say that deleting the app can remove local memories and must not promise survival of device replacement, transfer, offload, or reinstall. The exclusion configuration and a physical drill—not the phrase “local only”—are the evidence for the cloud-backup claim.

## iOS

### Storage and exclusion

**Verified.** Apple’s supported iOS 5.1+ mechanism is the `NSURLIsExcludedFromBackupKey` resource value. It is applied to the file or directory URL rather than being an app-wide switch. QA1719 distinguishes this from using cache space merely to evade backup. [Apple QA1719](https://developer.apple.com/library/archive/qa/qa1719/_index.html)

**Recommendation.** Store final recordings and the metadata store in one app-private, persistent `Library/Application Support/<bundle-id>/local-memory` tree, not in `tmp` or `Library/Caches`. The File System Programming Guide identifies Application Support as app-specific persistent support data, while caches and temporary files are reclaimable; cache is therefore suitable only for an in-progress recording before its final move. [Apple File System Programming Guide](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html)

Apply and verify `NSURLIsExcludedFromBackupKey = true` for **every concrete family-memory resource**: the final audio file, the metadata database and its companion files, attachments, and any generated derivative. Keep a single inventory of all paths that can contain a child name, transcript, prompt-answer relation, or audio bytes; a new storage path is not releasable until it is added to this exclusion check. This is defense against a future file being created outside the protected tree. [Apple QA1719](https://developer.apple.com/library/archive/qa/qa1719/_index.html)

### Expo/native seam

**Verified.** Expo FileSystem supplies device-local file and directory APIs, including document and cache locations. Expo Modules supports writing Swift and Kotlin when an application needs a native capability. [Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/) · [Expo Modules](https://docs.expo.dev/modules/overview/)

**Recommendation.** Put the policy behind a narrow `LocalMemoryStorage` adapter. If the selected Expo FileSystem version does not expose the iOS URL backup resource value, add a small local Expo Module whose iOS operation creates/receives a final path and sets/verifies `NSURLIsExcludedFromBackupKey`; do not scatter native calls through capture or UI code. Its Android half should return/use the selected no-backup location. The module requires a native build, not a JavaScript-only assumption. Keep app configuration declarative and generated through Expo app config/config-plugin mechanisms rather than hand-editing generated native projects. [Expo Modules](https://docs.expo.dev/modules/overview/) · [Expo app config](https://docs.expo.dev/versions/latest/config/app/)

**Verified.** No backup-specific iOS permission or manifest key replaces the per-resource flag. Recording permission and the later biometric/passcode lock are separate platform concerns; neither is evidence that recordings are excluded from backup. [Apple QA1719](https://developer.apple.com/library/archive/qa/qa1719/_index.html)

### Uninstall, offload, and transfer

**Drill.** The approved Apple developer sources establish storage locations and backup exclusion, but do not establish the user-facing result of iOS **Offload App**, deletion, Quick Start/device-to-device migration, or every restore path for this app. Do not infer that a backup exclusion also excludes device transfer. The release contract is no recovery promise; the matrix below must record the observed result for each action.

## Android

### Storage and cloud-backup rules

**Verified.** App-private internal storage needs no storage permission and is inaccessible to other apps; Android removes app-specific files when the app is uninstalled. Android documents `getNoBackupFilesDir()` as excluded from Auto Backup, whereas ordinary internal files and databases are included by default. [Android app-specific storage](https://developer.android.com/training/data-storage/app-specific) · [Android Auto Backup](https://developer.android.com/identity/data/autobackup)

**Recommendation.** Make a dedicated app-private no-backup root the canonical home for final recordings and the metadata database; do not put family memories in shared/external media storage. Put temporary capture only in cache, then atomically move it to the canonical root before committing its metadata. The metadata adapter must use that same root or be explicitly covered by the rules below—using a database library’s default location without checking it is not acceptable. [Android app-specific storage](https://developer.android.com/training/data-storage/app-specific) · [Android Auto Backup](https://developer.android.com/identity/data/autobackup)

**Verified.** For apps targeting Android 12/API 31+, the manifest can reference `android:dataExtractionRules`; its `cloud-backup` and `device-transfer` sections have independent include/exclude rules. Android 11 and lower use the manifest’s `android:fullBackupContent` XML rules. A directory exclusion applies recursively. [Android Auto Backup](https://developer.android.com/identity/data/autobackup)

**Recommendation.** Use defense in depth in the generated Android manifest/resources:

1. Declare `dataExtractionRules` for API 31+ with `cloud-backup` exclusions covering every domain/path where family content can occur (the dedicated files root, metadata/database location, and any preferences location if it ever contains family metadata).
2. Supply the legacy `fullBackupContent` exclusions for Android 11 and lower.
3. Explicitly decide and document `android:allowBackup`; do **not** use it as the only control. Android documents that, on Android 12+ devices from some manufacturers, `allowBackup="false"` can disable cloud backup while not disabling device-to-device transfer.
4. Keep the core files in `getNoBackupFilesDir()` as an additional location-level safeguard, and test the generated manifest and both resource files in the signed artifact.

These are configuration requirements, not product code. The app config/config plugin must produce the manifest attributes and XML resources during native generation; Expo app config is the source-of-truth boundary for that generated native configuration. [Android Auto Backup](https://developer.android.com/identity/data/autobackup) · [Expo app config](https://docs.expo.dev/versions/latest/config/app/)

**Verified.** Android’s separate `cloud-backup` and `device-transfer` sections mean that cloud exclusion does **not** imply transfer exclusion. If there are no rules for a transfer mode, Android documents that mode as enabled for content other than cache and no-backup directories. [Android Auto Backup](https://developer.android.com/identity/data/autobackup)

**Recommendation.** Do not create a product transfer feature or copy that says memories migrate. Leave OS transfer behavior unpromised, record the result of the device drill, and re-review it for every target-SDK, storage-path, and backup-rule change. The no-backup directory is documented as excluded from Auto Backup, but the actual transfer outcome remains a release drill rather than a marketing claim. [Android Auto Backup](https://developer.android.com/identity/data/autobackup)

### Permissions and lifecycle limits

**Verified.** App-private internal storage itself requires no Android storage permission. The backup exclusions are manifest/resource configuration, not a runtime permission. [Android app-specific storage](https://developer.android.com/training/data-storage/app-specific) · [Android Auto Backup](https://developer.android.com/identity/data/autobackup)

**Drill.** Android app archival/offload behavior is not established by the approved source set. Test it separately from uninstall. After an Android uninstall, missing memories are the expected result for app-specific storage; after archival/offload, record the observed result but do not promise it as recovery. [Android app-specific storage](https://developer.android.com/training/data-storage/app-specific)

## Required physical-device evidence

Use a signed production-equivalent build, not a simulator or a JavaScript-only runtime. For every run, capture: build ID and commit, app/bundle ID, OS version, device model/OEM, target SDK, backup-rule artifact hash, whether the device account has cloud backup enabled, and two unique sentinels—a short recording whose audible phrase is unique and a unique transcript/profile value.

| Platform and action | Procedure | Passing evidence / interpretation |
| --- | --- | --- |
| iOS — local persistence | Save both sentinels, force-quit, relaunch, and play/read them. Inspect the app’s storage inventory through development tooling to confirm every final family path received the exclusion flag. | Sentinels remain locally playable/readable; path inventory is complete; every family resource reports excluded. This proves ordinary on-device persistence and the per-file mechanism, not cloud exclusion. [Apple QA1719](https://developer.apple.com/library/archive/qa/qa1719/_index.html) |
| iOS — iCloud Backup | Enable iCloud Backup on a dedicated test account, finish a backup after saving sentinels, then use only OS backup recovery on a clean physical test device. This is a test operation, not a product restore feature. | The restored app has no sentinel recording or metadata. A sentinel is a release blocker; inspect every unexpected path and repeat after correction. [Apple QA1719](https://developer.apple.com/library/archive/qa/qa1719/_index.html) |
| iOS — uninstall, Offload App, and OS transfer | Run three separate source-device experiments after saving sentinels: delete/reinstall; offload/reinstall; and an OS-assisted transfer to a second device. | Record present/absent separately. These outcomes are **unanswered until drilled** and are never release-copy promises. In particular, a cloud-backup pass does not answer transfer. |
| Android — artifact and local persistence | On a physical Android 12+ device, inspect the installed build’s generated manifest/resource rules, save sentinels, force-stop, relaunch, and verify playback/text. Also repeat on the oldest supported Android version to exercise the legacy rule resource. | Correct API-specific resources are present; sentinels survive local relaunch only; metadata and recording live under the approved inventory. [Android Auto Backup](https://developer.android.com/identity/data/autobackup) |
| Android — Google cloud backup | With an enrolled Google backup account, save sentinels, allow/trigger the platform cloud-backup path, then perform the platform’s clean-install/OS recovery test on physical hardware. | No recording or metadata sentinel is restored. A sentinel is a release blocker. Android documents that installation can restore Auto Backup data, which makes this a necessary negative test. [Android Auto Backup](https://developer.android.com/identity/data/autobackup) |
| Android — D2D and archival/offload | Transfer to a separately initialized physical device; separately archive/offload then reinstall on the source device. Repeat on at least one non-reference OEM if supported. | Record the actual result, OEM, and rule set. Do not convert either result into a product promise. Cloud rules and D2D rules are separate, so this is not covered by the cloud test. [Android Auto Backup](https://developer.android.com/identity/data/autobackup) |
| Both — regression | Repeat cloud and transfer drills after changing a storage path, database implementation, Expo SDK/native module, target SDK, backup configuration, or lock implementation. | The evidence record ties the exact signed artifact to a no-sentinel cloud result. |

## Release gate and unresolved fact

**Gate:** do not claim iCloud/Google cloud-backup exclusion until the matching physical cloud test has a no-sentinel result for the signed artifact. Do not claim device migration, offload retention, reinstall recovery, or deletion persistence at all.

**Key unresolved fact:** the behavior of **iOS OS-assisted device transfer and Offload App** for files marked with `NSURLIsExcludedFromBackupKey` is not established by the approved source set. It requires the iOS device drill and remains outside the product promise regardless of the observed result.

## Sources

- [Apple QA1719 — *How do I prevent files from being backed up to iCloud and iTunes?*](https://developer.apple.com/library/archive/qa/qa1719/_index.html)
- [Apple File System Programming Guide — *File System Basics*](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html)
- [Android Developers — *Back up user data with Auto Backup*](https://developer.android.com/identity/data/autobackup)
- [Android Developers — *App-specific storage*](https://developer.android.com/training/data-storage/app-specific)
- [Expo — *App config*](https://docs.expo.dev/versions/latest/config/app/)
- [Expo — *FileSystem*](https://docs.expo.dev/versions/latest/sdk/filesystem/)
- [Expo — *Expo Modules API: Overview*](https://docs.expo.dev/modules/overview/)
