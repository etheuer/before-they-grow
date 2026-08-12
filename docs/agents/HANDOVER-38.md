# Handover — #38 Reconcile damaged or migrated storage

**Ticket:** https://github.com/etheuer/before-they-grow/issues/38 (#30 stories 27, 30)
**Status:** claimed. Orchestrator: Pi. Executor: Grok. Verifier: GPT-5.6 Luna Max.
**MVP constraint:** ship what works; avoid over-engineering. This is the storage-reconciliation slice — make bootstrap truthful and fail-closed.

## DoD (Definition of Done, MVP-scoped)

1. After App lock and before any content, the catalog bootstrap verifies: canonical roots exist, backup controls hold, contract/schema/user versions match, SQLite integrity passes, catalog+filesystem are cross-consistent, and any interrupted save operations are reconciled.
2. Recognized stale cache/staging files and recognized unreferenced final media are removed only AFTER the database + layout validate (never before integrity).
3. Referenced audio media with a missing file or wrong byte count stays in the catalog and renders as an **Unavailable memory** (visible metadata, hard-delete choice), never silently hidden.
4. Unknown files/layouts, unknown newer versions, DB corruption, unresolved backup-exclusion failure, or unsafe inventory **block storage** — never recreate, never show empty onboarding, never show a partial timeline.
5. Forward migrations are transactional for the database and journaled for the filesystem; migration failure preserves existing content with a truthful blocked state + retry path.
6. A newer version on disk from a future binary is detected and blocked (downgrade refusal) without writing.
7. Operation journals + cached identity data contain only opaque identifiers/states.
8. Adapter-level failure-injection tests at the reconciliation/migration seams (stale, orphan, missing, wrong-size, unknown, corrupt, forward-upgrade, downgrade).

## Already built (do not rebuild)

- **version/reconcile gates** in `sqliteProfileRepository.ts` — `verifyVersions()` already does integrity, user_version, table existence, catalog filename.
- **`saveReliability.ts`** + `reconcileSaveOperations()` — already resolves interrupted journal operations at bootstrap. Services.bootstrap already calls cleanStaleCaptureCache (once per process) before the catalog opens.
- **`StorageGateError` + blocked screen** in `ProtectedArea.tsx`.
- **`sqliteSchema.ts`** with `DATABASE_DDL_V2` + `MIGRATION_MEMORIES_V1_TO_V2`.
- All existing ports (SqliteClientPort, MediaStorePort, BackupExclusionPort, MemoryRepositoryPort).

## Files you own

- `apps/mobile/src/adapters/sqliteProfileRepository.ts` — extend verifyVersions to full bootstrap (`verifyRoots`, `verifyBackupControls`, `verifyLayoutInventory`, `reconcileCatalog`).
- `apps/mobile/src/adapters/expoMediaStore.ts` — add `listReferenced`, `reconcileUnreferenced`, and stale cleanup methods.
- `apps/mobile/src/adapters/sqliteMemoryRepository.ts` — add `findAllWithMedia()` for cross-referencing against filesystem.
- `apps/mobile/src/services.ts` — wire the extended bootstrap.
- `apps/mobile/src/ProtectedArea.tsx` — storage-blocked reasons may expand; Unavailable memory UI (timeline shows "unavailable" row).
- `apps/mobile/src/TimelineScreen.tsx` — Unavailable memory row with metadata + hard-delete action.
- `apps/mobile/src/App.test.tsx` — blocked/unavailable tests.
- `packages/application/src/` — a `storageBoot.ts` or extend `profile.ts` with the `StorageBootReport` (blocked/safe/dangerous).

## Conventions (quick reference — the hard-won rules)

- **TDD**: vitest for `packages/application`, jest for `apps/mobile/adapters`. Tests assert parent-visible outcomes, never native call ordering.
- **Ports, not Expo**: screens → use cases → ports; only `services.ts` + `index.ts` touch Expo. `npm run check:boundaries` enforces.
- **Multi-statement DDL via `txn.exec()`** — never `txn.run()`. Fakes reject DDL through run().
- **Transaction return values** must survive the boundary (capture the block result; `withExclusiveTransactionAsync` returns void).
- **Fakes must be honest** — rollback on injected failure, honor the SQL dialect, don't return what the real code would not.
- **No straight apostrophes inside single-quoted strings** — use double quotes.
- `StorageGateError(reason)` → blocks, never empty/healthy. All 4 reasons: version-unsafe, integrity-failed, root-unsafe, backup-control-failed. Add new ones only if they're distinct fail-closed gates.
- No web, no cloud, no network STT, no encryption, no billing.

## Verification

```bash
cd /Users/fulanodetal/Developer/before-they-grow
npm run check           # boundaries → lint → all tests → typecheck → web build
git status
```

## Delegation (this run)

- **Grok** codes (#38 implementation).
- **GPT-5.6 Luna Max** verifies (cross-family review after Grok commits).
- Pi orchestrates + fixes final blocking issues.

## Reporting back

Commit referencing #38, push, reply with what changed + check evidence + any device-deferred items. Under 300 words.