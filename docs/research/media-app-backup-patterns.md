# Media-app durability patterns under platform backup limits

**Decision supported:** choose an honest durability statement for Before They Grow (BTG) before public release. This is a research note, not a recommendation to adopt any pattern and not an audit of the current build.

## Scope and terms

BTG's stated proposal is **local-only child voice recordings**: no download, export, import, restore, product cloud, Apple cloud backup, or Google cloud backup. If that is the shipped behavior, recordings have no designed off-device recovery path. Device loss, hardware failure, app deletion, an unrecoverable OS/device migration, or local storage corruption can therefore be permanent loss events.

The terms below must not be collapsed in product copy:

| Term | Meaning | What it does *not* establish |
|---|---|---|
| **Platform cloud sync** | A platform library/service keeps a cloud copy and reconciles it across a user's devices. | An app's independent backup or a point-in-time archive. |
| **Platform device backup** | The OS backs up eligible app data for device recovery. Inclusion, timing, quota, and restore are controlled by the OS/user settings. | A promise that an individual recording has been uploaded or is recoverable at a chosen time. |
| **Dedicated product cloud/sync** | The product vendor operates (or contracts for) an account-backed service for the content. | An export, an immutable archive, or protection from synced deletion unless documented. |
| **User-managed export/download** | The person makes a copy and takes responsibility for storing it somewhere else. | Automatic ongoing protection. |
| **Local-only loss acceptance** | The product deliberately offers no off-device copy/recovery mechanism. | Durability. It is a privacy/storage posture with an explicit loss trade-off. |
| **Native-file ownership** | The person can access ordinary files in a location they control and can copy/back up with OS tools. | An automatic backup; the files can still be lost if the owner does not copy them. |

## Primary-source baseline

The linked sources below are first-party sources. URLs are included only where their exact address is known confidently; no live pages were retrieved for this note.

- **[A1] Apple Developer — _Optimizing your app's file management for iOS_.** Apple distinguishes user-created/irreplaceable data from replaceable or regenerable data when deciding what belongs in backed-up locations.
  https://developer.apple.com/documentation/foundation/optimizing_your_app_s_file_management_for_ios
- **[A2] Apple Developer — _QA1719: How do I prevent files from being backed up to iCloud and iTunes?_** This is an archived but still useful explanation of excluding files from device backup; it should not be read as approval to exclude irreplaceable user content.
  https://developer.apple.com/library/archive/qa/qa1719/_index.html
- **[A3] Apple Support — _Set up and use iCloud Photos_.** iCloud Photos maintains a photo/video library in iCloud and across signed-in devices; iCloud storage is part of the service boundary.
  https://support.apple.com/en-us/108782
- **[A4] Apple Developer — _App Review Guidelines_.** The public review rules are the review baseline; they do not turn an undocumented recovery assumption into a valid product promise.
  https://developer.apple.com/app-store/review/guidelines/
- **[G1] Google Photos Help — _Back up photos & videos_.** Google Photos documents an opt-in Backup feature for a Google account, including backup settings and storage-quality choices.
  https://support.google.com/photos/answer/6193313
- **[G2] Google One — _Plans & pricing_.** Google Account storage is a finite, plan-based service shared across Google products; its current capacity/pricing must be checked at decision time.
  https://one.google.com/about/plans
- **[G3] Android Developers — _Back up user data with Auto Backup_.** Android documents platform device backup separately from an app's own service and documents a per-app backup quota.
  https://developer.android.com/identity/data/autobackup
- **[G4] Google Play Console Help — _User Data policy_.** Google Play requires clear, accurate disclosure of collection, use, sharing, and handling of user data.
  https://support.google.com/googleplay/android-developer/answer/10144311
- **[O1] Obsidian Help — _How Obsidian stores data_.** Obsidian documents a vault as files/folders under the user's control, using open file formats; attachments live with that user-managed data.
  https://help.obsidian.md/Files+and+folders/How+Obsidian+stores+data
- **[O2] Obsidian — _Privacy Policy_.** A first-party statement of the privacy/service boundary for a local-first product.
  https://obsidian.md/privacy

## Representative documented patterns

### 1. Platform photo/video library: Apple Photos with iCloud Photos

**Documented facts.** Apple presents iCloud Photos as a cloud-synced library: photos and videos are kept in iCloud and made available across the user's signed-in Apple devices [A3]. This is distinct from iCloud device backup. Content already synchronized by iCloud Photos is not simply the same thing as app-sandbox data awaiting an iCloud Backup restore. The service consumes the user's iCloud storage allocation.

**Pattern / inference.** The product promise is a library-level continuity promise: a person expects a signed-in replacement device to see the library after sync completes. The cost of high-volume originals moves to account storage, network availability, upload time, and the platform's service terms. It is a strong durability pattern for a library, but it is not a promise of an app-controlled backup point, nor protection from every user-initiated deletion or account problem.

**Privacy trade-off.** Content leaves the device for Apple's account service. The security, account-recovery, retention, and encryption protections are those selected by the user and defined by Apple/platform settings—not a local-only privacy boundary.

**Store implication.** An app that integrates with a platform library can accurately describe the platform service it uses, but must not imply that app-local recordings are in iCloud Photos unless they are actually written to that library with the appropriate permission and user-visible behavior. That would be a material change from BTG's stated scope.

### 2. User-generated media app with dedicated product cloud: Google Photos Backup

**Documented facts.** Google Photos calls its feature **Backup** and associates backed-up photos/videos with a Google account [G1]. The cloud storage boundary is the Google account and its available storage plan, rather than Android's device-backup mechanism [G2]. Google also documents Android Auto Backup separately; for that platform facility, an app has a documented 25 MB backup quota [G3].

**Pattern / inference.** This separates two often-confused durability mechanisms:

1. **Product cloud media backup/sync:** a media service accepts a potentially large library, applies its own account/storage rules, and makes it available to the account.
2. **Platform device backup:** an OS attempts to preserve eligible app state under OS scheduling, quota, transport, and restore rules.

For recordings, a product-cloud design must therefore make an explicit promise about upload completion, failed uploads, account/storage exhaustion, deletion propagation, and recovery. Calling an account sync feature “backup” is meaningful only to the extent those cases are documented and supported. A user-managed download (for example, an account data export) is a separate, user-triggered copy; it does not make the service itself an archive.

**Media-volume/storage limit.** The documented pattern puts capacity behind the account plan rather than an unlimited on-device assumption [G1][G2]. Large media increases upload time and makes quota exhaustion a normal product state. Android Auto Backup's 25 MB per-app quota [G3] illustrates why device backup is not an adequate unqualified durability model for an accumulating voice-media library.

**Privacy trade-off.** The provider receives and stores the media under an account and policy boundary. This buys cross-device recovery but requires disclosures about account data, transfers, service retention, and any product processing. It is not equivalent to “never leaves this device.”

**Store implication.** On Google Play, any account-backed handling needs truthful data disclosures under the User Data policy [G4]. For either store, product language should identify whether the recovery route is vendor cloud, platform backup, or an export—not use “saved” as a vague substitute for recoverable.

### 3. Privacy/local-first application: an Obsidian-style native vault

**Documented facts.** Obsidian documents the vault as a normal user-controlled file/folder structure using open formats [O1]. That is a native-file-ownership model: content and attachments can be copied, versioned, synced, or backed up by a tool chosen by the person. It is not, by itself, an automatic remote-copy promise. Obsidian's privacy boundary is described in its own policy [O2].

**Pattern / inference.** This pattern makes the durable unit a folder of user-owned files, rather than opaque app-database state. For media, volume is limited by available device/filesystem space and by whichever backup/sync destination the owner chooses. The app can preserve privacy and portability without operating a content cloud, but the person must still make and retain an off-device copy. A file that remains only on one phone is still local-only loss acceptance, even if it is natively accessible.

**Privacy trade-off.** This gives the person more control over storage destination and reduces mandatory vendor custody. It can also shift difficult tasks—backup configuration, conflict handling, encryption choice, and recovery—onto the person. Native ownership is more transparent than an opaque sandbox, but not automatically safer.

**Store implication.** A local-first app can honestly say data stays local only when no selected sync/backup path transmits it. If it advertises portability, the path must be usable for the actual attachment types and sizes; a text-only export is not meaningful recovery for voice recordings.

## Cross-pattern comparison

| Durability pattern | Off-device copy by default? | Who operates recovery? | Media-volume constraint | Honest user promise |
|---|---:|---|---|---|
| Platform cloud sync (Apple Photos/iCloud Photos) | Yes, after service sync | Platform account service | Account storage, upload/network, service rules | “This library syncs with your account/devices.” |
| Platform device backup (iCloud Backup / Android Auto Backup) | Conditional | OS + user backup settings | Eligibility, timing, quota; Android documents 25 MB per app for Auto Backup [G3] | “Eligible app data may be restored from a device backup”; never “every recording is safely backed up” without verification. |
| Dedicated product cloud/sync (Google Photos Backup) | Yes, after product backup succeeds | Product account service | Account quota/plan, upload state, service retention | “Backed up to your product account,” with failure/deletion/recovery limits stated. |
| User-managed export/download | Only after user action | User and their chosen destination | Export format, attachment inclusion, local/destination capacity | “You can make your own copy.” |
| Native-file ownership | Not necessarily | User and filesystem/selected tools | Device/destination capacity and file compatibility | “Your files are accessible to copy or back up.” |
| Local-only loss acceptance | No | Nobody beyond the current device | Device free space only; no recovery reservoir | “Stored only on this device; loss of the device or app data can permanently lose recordings.” |

## Apple backup-guidance tension for BTG

**Documented fact.** Apple's file-management guidance distinguishes user-created, irreplaceable data from data that can be recreated or downloaded, and associates the former with backed-up app storage [A1]. Apple also documents the technical ability to exclude files from backup [A2].

**Pattern / inference.** A child's original voice recording is ordinarily both user-created and irreproducible. Therefore, deliberately excluding it from Apple device backup in order to preserve a strict local-only stance creates a real tension with Apple's stated storage principle: the strongest reason to back up data is precisely that it cannot be recreated. The technical exclusion API does not resolve that product/durability tension.

This is **not** a claim that Apple publishes an automatic-rejection rule for every local-only app. The public App Review Guidelines should be checked at submission [A4]. It is a review and trust risk: an app that frames these recordings as a lasting journal while intentionally offering no recovery may look inconsistent with user expectations and Apple's data-preservation guidance. Conversely, silently allowing platform backup would make a “never leaves your device” claim untrue.

## Consequences for the current proposal (no replacement selected)

1. **Truthfulness boundary — pattern / inference.** “Private” and “stored locally” are supportable only if qualified with the absence of recovery. They do not mean durable, backed up, exportable, or transferable.
2. **Capacity boundary — pattern / inference.** A voice journal grows with recording duration, codec/bitrate, attachments, and retention. Without an off-device tier, the only reservoir is device free space. Any future capacity calculation needs real encoded-byte measurements, not a count of entries.
3. **Migration boundary — pattern / inference.** A new-device flow is not a restore flow unless a documented platform backup, product cloud, export/import, or user-controlled file copy actually carries recordings end to end.
4. **Deletion boundary — pattern / inference.** Sync and backup differ most when data is deleted. A future durable model would need explicit semantics for accidental deletion, device loss, account loss, failed upload, and whether deletions propagate.
5. **Privacy boundary — pattern / inference.** Each durability mechanism changes the disclosure: platform service, BTG/vendor service, or a user-selected destination. None is a free privacy-neutral add-on.

## Open questions before any durability model is selected

These are verification questions, not implementation instructions:

- Where would each recording and its metadata reside on iOS and Android, and is that location included in or excluded from OS backup today?
- What exact recording codec, maximum duration, expected monthly capture volume, and storage-warning behavior apply? What happens at zero free space?
- If a future model used platform backup, what data is eligible, what is actually restored, and how would BTG communicate that it is conditional on the user's platform account/settings?
- If a future model used product cloud, what are the upload-completion indicator, retry policy, encryption/access model, account recovery model, deletion/retention policy, quota behavior, and support obligation?
- If a future model used export or native ownership, does it include original audio plus metadata in a documented, independently usable format, and can the user re-import/restore it?
- Which claims would be tested in a lost-device, replacement-device, offline, low-storage, deleted-app, expired-account, and failed-upload scenario before release?
- What exact App Store and Google Play privacy labels/disclosures would each chosen data flow require at submission time?

## Bottom line

The three documented patterns make different promises: a platform library promises account-linked continuity, a product media backup service promises account-backed storage subject to its service limits, and a local-first native-vault app promises user control over files rather than automatic recovery. BTG's current local-only proposal makes none of those durability promises. Its truthful model must therefore explicitly accept permanent loss until a separately specified and verified recovery path exists.
