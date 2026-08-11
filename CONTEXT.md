# Before They Grow

Before They Grow is a private family voice journal for parents or guardians to preserve a child's answers and voice through a small recurring ritual.

## Language

**Native mobile application**:
The iOS and Android product distributed through the Apple App Store and Google Play. It is the intended production family-memory client, distinct from the existing web PWA.
_Avoid_: app, when the platform is ambiguous; web app

**Web PWA**:
The existing browser-based Before They Grow prototype. Its interactive family-journal flow will not be maintained as a second production product.
_Avoid_: native app, dual product

**Web companion**:
The public marketing, legal, support, and native-download website that succeeds the Web PWA as the product's web footprint.
_Avoid_: browser journal, feature-parity web app

**Initial native release**:
The free, focused first store release: one child profile, voice capture, transcript review, and local-only memory. It has no download, export, import, restore, or Apple/Google cloud-backup capability. Billing, sharing, cloud sync, reminders, and non-operational analytics are outside this release.
_Avoid_: full-featured launch, commercial feature set

**Production-ready native release**:
The publicly releasable Initial native release for the Apple App Store and Google Play, supported by signed artifacts, physical-device and local-data-loss evidence, compliant disclosures, and owned release, support, incident, and rollback operations. It is more than a beta build.
_Avoid_: prototype, store beta, release candidate

**Local-only memory**:
A saved answer and its prompt context held in application-managed storage on one phone. It contains either validated audio with an optional parent-reviewed transcript, or a non-empty manual transcript when audio capture was unavailable; it is excluded from Apple and Google cloud backup and has no download, export, import, restore, or recovery promise.
_Avoid_: backup, recovery archive, Export copy, restore, import

**Native transcription**:
Platform-provided speech recognition where it is available, with manual transcript entry where it is not. Before They Grow does not run a transcription backend for the Initial native release.
_Avoid_: Before They Grow transcription service

**Manual transcript entry**:
Parent-entered or parent-corrected text used when Native transcription is unavailable or inaccurate. It may stand alone only when audio capture was unavailable.
_Avoid_: manual recovery, recovered transcript

**Unsaved recording**:
A completed voice capture that has not become a Local-only memory. It may be retained briefly for an immediate retry, but has no persistence or recovery promise.
_Avoid_: draft memory, saved recording

**Indeterminate save**:
An attempted save whose final outcome cannot yet be stated safely. It is neither reported as successful nor retried as a new memory until local storage has been checked.
_Avoid_: failed save, duplicate retry

**Unavailable memory**:
A previously saved Local-only memory whose required content can no longer be read or validated. Its remaining metadata is not silently hidden or deleted, but Before They Grow offers no recovery route.
_Avoid_: recovered memory, deleted memory

**Hard local deletion**:
Irreversible removal of a Local-only memory from application-managed reachable storage, with no trash, undo, or recovery feature. It is not a promise of forensic erasure from physical flash storage.
_Avoid_: archive, soft delete, recoverable delete

**Initial launch market**:
The adult-directed, English-language US release, where a parent or guardian operates the product even when recording a child.
_Avoid_: child-directed app, global launch

**Supported phone matrix**:
The defined and physically tested iPhone and Android phone versions for the Initial native release. Tablets must be responsive but have no bespoke launch features.
_Avoid_: universal device support

**App lock**:
An app-level biometric or passcode gate that protects access to family memories, in addition to platform file and database protection.
_Avoid_: device protection alone
