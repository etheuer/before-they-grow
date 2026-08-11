# Handoff — Before They Grow native local-only launch

## Goal

Deliver a publicly releasable, free iOS/Android native Before They Grow application for one child. It records and reviews voice memories on one phone. The Web companion is marketing/legal/support/native-download only, not a production family journal.

## Authoritative map

- Active map: [Ship Before They Grow’s local-only native mobile application](https://github.com/etheuer/before-they-grow/issues/23)
- Only open Wayfinder child: [Define native local-only persistence contracts](https://github.com/etheuer/before-they-grow/issues/28)
- Do **not** write native product code until the map is clear. After it is clear, use `/to-spec` → `/to-tickets` → implementation.

Read `AGENTS.md`, `CONTEXT.md`, the map, and issue #28 before acting. Follow the map rule: claim the first unassigned, unblocked child before work; resolve one non-research ticket per session.

## Locked release posture

- Native phones only: iOS 17+ and Android 10/API 29+. Tablets are unsupported.
- English UI and English-only attempted transcription. On-device-only platform transcription may be attempted where verified; manual transcript entry and audio-only save are always available.
- Strict local-only/no-recovery: no Apple/Google cloud backup, Before They Grow cloud, download, export, import, restore, accounts, sharing, or recovery promise. Device loss, uninstall, deletion, corruption, and failed transfer may permanently lose memories.
- Adult-directed, English-language, US-first. One child. No billing, ads, reminders, social features, generated advice, or non-operational analytics.
- App-level biometric/passcode lock is required.
- No third-party diagnostics/analytics SDK in v1; only Apple/Google store crash reporting.
- The owner intentionally accepted Apple’s developer-guidance tension around excluding irrecoverable user-created data. Do not reopen that decision unless scope changes.

## Closed Wayfinder work

- [Native application boundaries](https://github.com/etheuer/before-they-grow/issues/4): isolated `apps/mobile` and `apps/web`; neutral shared `packages/domain`, `packages/contracts`, and `packages/application`; no shared browser APIs/UI.
- [Native transcription research](https://github.com/etheuer/before-they-grow/issues/5): native, on-device-only attempt plus manual fallback.
- [Local storage/cloud-backup exclusion research](https://github.com/etheuer/before-they-grow/issues/24): iOS exclusion is per final resource and must be reapplied/verified; Android cloud backup and device transfer are distinct; signed physical drills are evidence, not a recovery promise.
- [Media-app durability research](https://github.com/etheuer/before-they-grow/issues/29): public media products explicitly choose cloud, user-file/export, or local-loss models; OS device backup is not an accumulating-media durability substitute.
- [US launch privacy/store classification](https://github.com/etheuer/before-they-grow/issues/25): the owner adopted the questionnaire’s answers as the current release posture. Re-review before any off-device data flow, SDK/diagnostics vendor, child-directed scope, accounts/sharing, or non-US expansion.
- [Phone and evidence matrix](https://github.com/etheuer/before-they-grow/issues/26): physical release evidence is the owner’s iPhone 14 Pro Max and Samsung M14; virtual coverage must use iOS 17/current and Android API 29/current. The Mac has Xcode/iOS Simulator, but needs an iOS 17 runtime installed; Android Emulator tooling is not installed yet. Backup/transfer drills require a dedicated test account and a borrowed/provisioned reset-safe target phone. Simulators cannot prove microphone/audio routing, real biometrics, actual on-device speech, lifecycle/OEM behavior, low storage, cloud-backup restore, or transfer.
- [Launch operations ownership](https://github.com/etheuer/before-they-grow/issues/27): founder is sole Apple/Google/EAS, support, incident, promotion, rollback, and evidence owner; no deputy; support/release pause while unavailable. Use individual store memberships, founder-controlled public support email, 2-business-day US reply target, immutable store builds only (no production OTA), and a private non-secret evidence log retained at least 12 months. Account-recovery material remains outside the repo in the founder’s password manager plus offline copy.

## Immediate next work: issue #28

Use `/grilling` and `/domain-modeling`. Prepare facts yourself; decisions belong to the owner. The ticket must define a versioned local persistence contract for:

1. SQLite metadata vs. media-file boundary and stable identifiers.
2. Atomic save sequence: temp recording, validation, final move, database commit, visibility to the UI; clear behavior if any stage fails.
3. iOS final-file backup-exclusion application/verification after every save or move; Android no-backup root plus generated backup rules for cloud backup and transfer.
4. Crash/process-death recovery, temp/orphan cleanup, and relaunch reconciliation.
5. Forward schema migrations and a safe failure policy that never silently deletes memories.
6. Low-storage/capture failure: never delete prior memories; show that the new memory was not saved.
7. Hard local deletion of metadata and app-managed media; no trash/recovery feature.
8. Security boundary: do not silently introduce file/database encryption or key-management. If such a choice is needed, plan and obtain explicit owner approval before modifying code.

The prior Claude persistence-prep crewmate could not run because its monthly spend limit was exhausted. Use Pi/Grok for fact gathering if delegation is useful; keep Pi as coordinator if the user asks for crew again. The user previously asked that Grok be used for coding, with Luna-max as fallback; do not implement until Wayfinder is clear.

## Research assets

These are pushed research branches, not merged into `main`:

- `/Users/fulanodetal/Developer/before-they-grow-research-local-only/docs/research/local-only-storage-and-cloud-backup.md` on `research/local-only-storage-and-cloud-backup` (commit `ca58ece`)
- `/Users/fulanodetal/Developer/before-they-grow-research-media-backup/docs/research/media-app-backup-patterns.md` on `research/media-backup-patterns` (commit `34d6c92`)

They are linked from their closed issues. Do not treat them as already integrated product requirements without the map/spec process.

## Repository state and safety

- No native product code has been written.
- GitHub issues/map were updated live; those are the authoritative durable planning changes.
- The main checkout has pre-existing untracked setup/context files: `.agents/`, `.claude/`, `AGENTS.md`, `CONTEXT.md`, `docs/agents/`, and `skills-lock.json`. Do not delete or commit them as incidental cleanup.
- Never print/read environment secrets. Do not repeat credential-like values from the prior external-documentation incident.
- A full public release still requires native implementation, physical signed-build verification, Apple/Google account enrollment, support-mailbox provisioning, privacy/store copy, store testing, and submission.
