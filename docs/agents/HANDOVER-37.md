# Handover — #37 Resolve failed and indeterminate saves without duplicates

**Ticket:** https://github.com/etheuer/before-they-grow/issues/37
**Parent spec:** issue #30, stories 25–28
**Status:** claimed; Luna implements this slice. Pi coordinates; Grok reviews cross-family.
**Repo:** `/Users/fulanodetal/Developer/before-they-grow` (branch `main`, all prior slices merged)

## Goal

Complete the parent-visible save reliability contract. A save must be reported as exactly one of **Saved**, **Not saved**, or **Indeterminate save**; every outcome preserves all prior Local-only memories and never creates a duplicate, phantom, or silently lost memory. A retry reconciles by **stable identity**, never as a new memory.

## Definition of done (acceptance criteria, concretized for this repo)

1. **Not saved (pre-commit).** Any failure known before the SQLite commit returns Not saved, exposes what remains for immediate retry/cancel, and never makes the new memory visible.
2. **Pre-commit cleanup.** Recognized staging/final resources are removed best-effort while prior memories are preserved.
3. **Failed DB commit.** No visible memory; its recognized orphan media is removed immediately or at bootstrap.
4. **Indeterminate save.** Process death after a possible commit, or a failed post-commit iOS backup-exclusion verification, produces an Indeterminate save and blocks normal storage access until bootstrap reconciles the **stable operation identifiers**.
5. **Idempotent retry.** Repeating the same IDs and content returns/continues the one operation. Different content under an existing ID is a visible **conflict** and is never overwritten.
6. **Reconciliation.** Bootstrap reports the one committed memory when present, or a truthful Not saved when absent; never retries as a new memory.
7. **Low storage.** Preflight and every capture/staging/database out-of-space failure stop the new save without deleting or compacting prior memories.
8. **Cache retention.** A validated cache recording is retained only for immediate same-session retry/cancel, then cleaned on cancellation, crash, or relaunch.
9. **Failure-injection tests** cover every numbered save boundary, the platform backup-control gate, idempotent retry, conflict, low storage, and process-death points.
10. Tests assert no duplicate, phantom, or silently lost prior memory for every outcome.

## What already exists (the seams to build on — do not rebuild)

- **Application layer** (`packages/application/src/`, tested with **vitest**):
  - `capture.ts` — `saveVoiceMemory` (media commit → DB create → compensation), `finalizeVoiceCapture`, `MAX_CAPTURE_DURATION_MS`, `MAX_CAPTURE_BYTES`, ports `AudioRecorderPort`/`AudioPlayerPort`/`MediaInspectorPort`/`MediaStorePort`.
  - `memory.ts` — `saveManualMemory`, `MemoryRepositoryPort` (`create` returns `'created'|'duplicate'`; `findNewestFirst`), `RecordingPermissionPort`.
  - `unsaved.ts` — `createTransientCaptureStore`, `publishInterruptedCapture` (in-process Unsaved recording).
  - `transcribe.ts`, `profile.ts`, `appLock.ts`.
  - All exported from `src/index.ts`.
- **SQLite adapters** (`apps/mobile/src/adapters/`, tested with **jest** via jest-expo):
  - `sqliteProfileRepository.ts` — owns bootstrap/versioning; `SqliteClientPort` + `SqliteTransactionPort` (has `exec` for multi-statement DDL, `run` for single statements, `getAll`, `transaction` with exclusive transactions, `existingDatabasePaths`).
  - `sqliteMemoryRepository.ts` — `create` (insert + post-commit re-query) and `findNewestFirst`.
  - `sqliteSchema.ts` — `DATABASE_DDL_V2`, `MIGRATION_MEMORIES_V1_TO_V2`, `memoriesTable()`.
  - `expoMediaStore.ts` — `commit(sourceUri, relativePath)` (atomic same-fs move + backup exclusion), `removeFinal`, `resolve`.
  - `expoCacheCleanup.ts` — `cleanStaleCaptureCache()` (once per process, gated in services).
- **Composition root** `apps/mobile/src/services.ts` — `createProtectedAreaServices()`; exposes the use cases, recorder, player, transcriber, transient store, lifecycle subscription.
- **UI** `apps/mobile/src/CaptureFlow.tsx` (save steps: saving → saved / retry-error; candidate model; replacement protection), `ProtectedArea.tsx` (HomeShell), `TimelineScreen.tsx`.

## Conventions (learned from the previous five slices — breaking these has cost hours)

1. **TDD at the application seam.** Write vitest tests for `packages/application` first (red → green), jest tests for adapters with deterministic fakes. Tests assert parent-visible outcomes / stable contracts, never native call ordering or RN structure.
2. **Ports, not Expo.** Screens and use cases depend on ports; only `services.ts` and `index.ts` touch Expo. `npm run check:boundaries` enforces this — it fails on browser globals, Blob, CSS, react-dom, IndexedDB, WebView, and (now) any cloud/network speech SDK. The token `document` alone (e.g. `Paths.document`) trips it — use the legacy `expo-file-system/legacy` `documentDirectory` string instead.
3. **Multi-statement DDL must go through `txn.exec()`, never `txn.run()`** (runAsync compiles only the first statement — it silently bricked fresh installs once). The test fakes reject DDL through `run()`.
4. **Transaction return values must survive the boundary** (the real edge captures the block's result; fakes must return it too, or `already-exists`/`duplicate` silently vanish).
5. **Fakes must mirror reality** — a fake that ignores its SQL or returns what the real code would not has masked two launch-blocking bugs. Keep fakes honest.
6. **No straight apostrophes inside single-quoted strings** in TS/TSX (`'wasn't'` is a syntax error) — use double quotes for any string containing `'`.
7. Storage gate failures throw `StorageGateError` (with `reason`) and surface as the blocked state, never as an empty/healthy store.
8. Semicolons: none. Lint + typecheck must pass (`npm run check`).
9. After App lock, bootstrap reconciles before content shows; an unsafe version/integrity/root/backup-control result blocks family storage.

## Verification commands

```bash
cd /Users/fulanodetal/Developer/before-they-grow
npm run check            # boundaries → lint → all tests → typecheck → web build
npm run test:mobile      # jest (apps/mobile)
npm run test --workspace @before-they-grow/application   # vitest
git status               # keep the diff scoped
```

CI is GitHub Actions; push after commit (`git push origin main`). Do not push until `npm run check` is fully green.

## Forbidden scope

- Do not touch `apps/web` (the PWA is migration reference only).
- No cloud backup, export/import/restore, accounts, sharing, billing, reminders, or generated advice.
- No network/third-party STT (boundary check enforces it).
- No encryption/key management without explicit owner approval.
- Physical-device behavior (real storage exhaustion, iOS exclusion verification on device, OS process kill) is deferred to #41/#42 — build the code and failure-injection tests; do not claim device evidence.

## Suggested plan (TDD order)

1. **Contracts/types:** a stable **operation identity** for a save attempt (e.g. `{ memoryId, mediaSha256 }` or an explicit save-operation id) and a save journal/outcome model: `Saved | NotSaved(reason) | Indeterminate(reason)`.
2. **Application:** refactor the save use case(s) into a reliability contract: pre-commit → Not saved (+ retry retains the validated cache candidate); post-commit uncertainty → Indeterminate; idempotency by stable IDs; conflict on same ID with different content; low-storage preflight. Add a **reconciliation use case** run at bootstrap that resolves Indeterminate by the journal (committed → report the memory; absent → Not saved).
3. **Adapters:** make `sqliteMemoryRepository` and `expoMediaStore` failure-injectable at every numbered boundary (they already take ports — add seam-controlled failure points in tests); ensure orphan removal runs immediately and/or at bootstrap.
4. **Services/UI:** surface Not saved (with retry/cancel) vs Indeterminate (no auto-retry as new memory) truthfully in CaptureFlow; ensure a duplicate is never created and prior memories are never touched.
5. **Failure-injection tests** covering each numbered boundary, low storage, process death (simulated by the journal), and the backup-control gate; assert no duplicate/phantom/lost prior memory.

## Reporting back

Commit with a message referencing #37, push, and report per slice: what changed, `npm run check` evidence, what is verified in-repo vs deferred to device gates (#41/#42), and the reviewer findings you fixed.
