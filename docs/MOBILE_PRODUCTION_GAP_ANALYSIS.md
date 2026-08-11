# React Native + Expo Mobile Production Gap Analysis

**Product:** Before They Grow
**Audit date:** 2026-08-11
**Repository baseline:** `main@dc019028cc5dd087e329b5db859e625b747dafc7`
**Target:** Production React Native application distributed through the Apple App Store and Google Play using Expo/EAS
**Decision:** **BLOCKED — no native release candidate exists**

## 1. Executive summary

Before They Grow is currently a working Vite/React progressive web application. It is not a React Native application awaiting packaging: its screens, routing, recording, transcription, storage, export, deletion, and end-to-end tests depend on browser APIs.

Production mobile delivery therefore requires a deliberate platform port:

- Preserve the platform-neutral domain model, prompt catalog, product requirements, and design intent.
- Build a new Expo/React Native application shell and native adapters.
- Redesign the media and persistence lifecycle around native audio files and a versioned local database.
- Establish an explicit durability, privacy, security, testing, EAS release, and store-compliance model.

A WebView wrapper is not the recommended production path. It would retain browser API limitations, provide weak native lifecycle integration, and leave the principal reliability and privacy gaps unresolved.

## 2. Audit evidence

The audited source tree was clean and matched `origin/main` at the baseline commit.

Current PWA evidence:

- `npm run check`: 47 unit/integration tests passed and the production PWA build succeeded.
- `npm audit --audit-level=high`: 0 vulnerabilities reported.
- The repository Playwright invocation hit its 60-second web-server startup timeout on the audit host.
- The same frozen candidate, with only the temporary audit-copy startup timeout increased to 180 seconds, completed with 16 tests discovered, 11 passed, 5 intentionally skipped, and 0 failed.
- Current GitHub CI for the baseline commit succeeded.

This establishes a healthy web baseline. It does **not** provide evidence for iOS/Android builds, native microphone behavior, native storage, app lifecycle, accessibility, signing, submission, or recovery.

## 3. Reuse boundary

### 3.1 Directly reusable

- `src/domain/prompts.ts`: age bands, prompt types, prompt catalog, and deterministic prompt selection.
- `src/domain/prompts.test.ts`: platform-independent prompt behavior.
- Product copy and behavioral intent in `docs/PRD.md`.
- The requirement that export and prior-memory access remain available without subscription lock-in.

### 3.2 Reusable after refactoring

- `FamilyProfile` and `MemoryEntry` semantics, after replacing browser `Blob` fields with native file references and explicit media metadata.
- Repository dependency-injection boundaries.
- Recorder states, error cases, and existing acceptance-test intent.
- The concept of a versioned portable export format.
- Visual design tokens and layouts as specifications, not as directly reusable CSS.

### 3.3 Must be rewritten for native

- React DOM screens, HTML elements, CSS, and BrowserRouter navigation.
- Service-worker and PWA bootstrap behavior.
- Browser `MediaRecorder`, `getUserMedia`, Web Speech API, `<audio>`, `Blob`, and object-URL handling.
- IndexedDB persistence.
- Browser anchor/download export.
- DOM component tests and Playwright browser tests as the primary release evidence.

## 4. Recommended target boundary

```text
apps/
  web/                 Existing marketing, support, legal, and optional PWA surface
  mobile/              Expo Router + React Native application
packages/
  domain/              Prompts, entities, validation, and platform-neutral rules
  application/         Capture/save/export/delete use cases
  contracts/           Versioned archive and persistence contracts
```

The mobile application should depend on interfaces rather than Expo APIs directly:

- `MemoryRepository`
- `AudioRecorder`
- `AudioPlayer`
- `Transcriber`
- `ArchiveService`
- `PermissionService`
- `TelemetryService`

Expo/native implementations then sit behind those interfaces: `expo-audio`, `expo-sqlite`, `expo-file-system`, native sharing/import, the selected speech-recognition implementation, and privacy-safe telemetry.

## 5. Prioritized production gaps

Priority meanings:

- **P0:** blocks a production iOS/Android release.
- **P1:** required before a public production rollout unless explicitly risk-accepted.
- **P2:** commercial or expanded-product capability; not required for an honest free single-child MVP.

### P0 — Native product and core reliability

| ID | Gap and repository evidence | Required closure | Verification evidence |
|---|---|---|---|
| **MOB-001** | **No Expo/React Native foundation.** `package.json` contains Vite, React DOM, browser routing, IndexedDB, and PWA dependencies. There is no `expo`, `react-native`, `app.json`/`app.config.*`, `eas.json`, `ios/`, `android/`, bundle identifier, or Android package ID. | Create a current stable Expo application with Expo Router, TypeScript, development builds, stable app identifiers, environment separation, and checked-in non-secret configuration. | Signed development builds install and launch on at least one physical iPhone and one physical Android device. |
| **MOB-002** | **Application UI and navigation are browser-specific.** `src/main.tsx`, `src/App.tsx`, and `src/styles.css` depend on React DOM, BrowserRouter, HTML, CSS, `window`, `document`, and browser storage. | Rebuild onboarding, prompt, recording/review, timeline, settings, privacy, and error states with React Native primitives, safe areas, native navigation, keyboard avoidance, and platform-appropriate controls. | All committed mobile routes render without DOM/WebView dependencies and complete the core journey on both platforms. |
| **MOB-003** | **Recording and playback are browser-only.** `AudioRecorder.tsx` uses `navigator.mediaDevices`, `MediaRecorder`, `Blob`, browser speech recognition, and browser MIME assumptions. | Implement recording/playback with `expo-audio`; define supported codecs, MIME/container metadata, maximum duration, file-size policy, waveform/timer behavior, permission states, and audio-session configuration. | Physical-device tests cover record, stop, cancel, replace, playback, denial/revocation, Bluetooth, incoming interruption, backgrounding, lock, and process termination. |
| **MOB-004** | **Speech-to-text architecture is unresolved.** Expo's official `expo-speech` package is text-to-speech, not speech recognition. Browser speech behavior cannot be carried into native. | Choose native/on-device speech recognition or a private backend transcription service. Specify language support, offline behavior, timeout/retry, unavailable fallback, consent, retention, deletion, and vendor data flow. A third-party native module requires a custom development build rather than reliance on Expo Go. | Transcription success, empty result, unsupported locale, denial, offline, timeout, vendor failure, and manual-edit fallback are tested without losing the audio. |
| **MOB-005** | **Persistence is coupled to IndexedDB and audio `Blob`s.** There is no native schema, migration system, file lifecycle, quota policy, or orphan recovery. | Store metadata in versioned SQLite and audio in the application filesystem. Record media URI, codec/container, byte size, duration, checksum, creation date, and schema version. Use temp-file → validate/hash → atomic move → DB commit, with compensating cleanup. | Upgrade, interrupted write, corrupt record, missing file, orphan file, low storage, and database migration tests pass on both platforms. |
| **MOB-006** | **Export is memory-heavy and restore is absent.** `portableExport.ts` reads every audio object, Base64-encodes it into one JSON document, and triggers a browser download. `RELEASE_READINESS.md` explicitly records that import/restore is absent. | Produce a versioned streaming archive with manifest, checksums, metadata, and individual audio files. Add native share/save, validated import, duplicate/conflict rules, progress, cancellation, rollback, and forward-compatible migrations. | A clean installation successfully restores a multi-recording archive, verifies checksums, preserves transcripts/audio/dates, rejects tampering, and leaves no partial data after failure. |
| **MOB-007** | **No approved durability model exists.** Device loss or uninstall can destroy the product's core value. Native OS/cloud backup inclusion or exclusion is undefined. | Approve either: (a) local-only storage with explicit OS-backup behavior plus tested export/import, or (b) encrypted account-based backup/sync with authentication, conflict resolution, recovery, retention, deletion, residency, and subprocessors. | A documented recovery drill proves the selected model; product and legal copy accurately describe what survives uninstall, device loss, and device migration. |
| **MOB-008** | **Native lifecycle behavior is unspecified.** Current browser cleanup does not define what happens during calls, audio-focus loss, app backgrounding, screen lock, OS termination, or an interrupted review/save. | Implement an explicit capture state machine with persisted pending-recording state, interruption policy, safe track/resource release, idempotent retries, and recovery on relaunch. | No tested lifecycle transition produces a phantom recording, duplicate memory, leaked microphone session, or unrecoverable valid audio. |

### P0 — Privacy, security, release, and compliance

| ID | Gap and repository evidence | Required closure | Verification evidence |
|---|---|---|---|
| **MOB-009** | **Native privacy/security design is absent for intimate child/family audio.** Current policy copy describes browser storage and browser speech processing only. | Complete a threat model covering local files, SQLite, keys, OS backups, app-switcher snapshots, temporary/share files, logs, crash reports, transcription vendors, and device compromise. Define file/database protection, cache cleanup, retention, recording indication, consent, and optional app lock. | Security-owner review is approved; logs and telemetry contain no child names, transcripts, recordings, archive contents, or sensitive file paths; delete-all removes app-managed copies and temporary files. |
| **MOB-010** | **Store privacy declarations and audience classification are undecided.** The product is operated by parents but captures children's voices. | Decide adult-directed vs mixed-audience vs kids-category positioning with qualified counsel. Align onboarding, metadata, age rating, SDK selection, Apple App Privacy, privacy manifests, Google Data Safety, Families policy answers, privacy policy, and terms with the shipping implementation. | Store declarations are reviewed against a data-flow inventory and every included SDK; microphone consent and a clear recording indicator are verified. |
| **MOB-011** | **No native build, signing, update, or submission path exists.** | Add `app.config.*` and `eas.json`; define development/preview/production profiles, credentials ownership, version/build-number policy, environment secrets, runtime version, update channels, staged rollout, rollback, and artifact retention. | CI produces reproducible signed `.ipa` and `.aab` artifacts; preview builds pass device gates; production artifacts are promoted by immutable build ID rather than rebuilt. |
| **MOB-012** | **No native test/release evidence exists.** Existing Vitest and Playwright coverage validates browser behavior only. | Add platform-neutral domain tests, React Native component/integration tests, and native E2E journeys. Maintain a physical-device matrix covering supported iOS/Android versions and representative hardware. | CI plus physical-device evidence covers onboarding, permissions, capture, transcription fallback, edit, atomic save, playback, timeline, export/import, deletion, upgrade, backgrounding, and recovery. |

### P1 — Production hardening

| ID | Gap | Required closure | Verification evidence |
|---|---|---|---|
| **MOB-013** | **Native accessibility is unverified.** Browser ARIA/axe evidence does not establish VoiceOver, TalkBack, Dynamic Type, native focus, keyboard, or safe-area behavior. | Define native semantics, labels/hints, focus order, 200% text behavior, reduced motion, contrast, tap targets, orientation, and supported tablet layouts. | VoiceOver and TalkBack core-journey smokes pass; critical actions remain visible and operable at maximum supported text size. |
| **MOB-014** | **Long-term performance is unproven.** The product is intended to accumulate recordings over years. | Use a virtualized/paginated timeline, lazy audio loading, bounded memory, background-safe archive creation, and explicit storage reporting. | Performance gates pass with a representative multi-year archive, large exports, low-end Android hardware, and constrained storage. |
| **MOB-015** | **Privacy-safe observability and operations are missing.** No native crash monitoring, release-health dashboard, alert ownership, incident playbook, or rollback drill exists. | Add redacted crash/performance monitoring, release dashboards, alert routing, support intake, severity definitions, incident response, recovery/deletion playbooks, and rollback ownership. | A synthetic failure is observed without sensitive payloads; an owner receives the alert; the team completes a documented rollback and recovery exercise. |
| **MOB-016** | **Store assets and external launch gates are incomplete.** Current listing materials describe a future wrapper and use web evidence. | Complete developer accounts/agreements, legal entity/contact, support and privacy URLs, real screenshots from shipping builds, descriptions, age ratings, reviewer notes, app-name/trademark review, asset licenses, and beta feedback. | TestFlight and Play testing artifacts are approved; all listing claims match the binary. For applicable new Google Play personal accounts, complete the required closed-test period before production access. |

### P2 — Commercial and expanded-product gaps

| ID | Gap | Closure trigger |
|---|---|---|
| **MOB-017** | Multiple children, reminders, family sharing/sync, and localization are absent or deferred. | Implement only after product validation or when included in the launch promise. Each capability requires separate privacy, migration, conflict, and notification acceptance criteria. |
| **MOB-018** | Billing, subscriptions, restore purchases, refunds, grace periods, and entitlement recovery are not implemented. | Required only for a paid launch. Use store-compliant in-app purchase, keep export/prior-memory access non-hostage, and test entitlement recovery across reinstall and device change. |

## 6. Critical closure scenarios

These scenarios define the minimum behavioral proof expected before production approval.

```gherkin
Feature: Native vertical slice
  Scenario: A parent preserves a voice memory on both supported platforms
    Given a signed production-equivalent build is installed on a physical device
    And the parent has completed onboarding
    When the parent records an answer
    And transcription succeeds or the documented fallback is used
    And the parent reviews and saves the answer
    Then the original playable audio is stored as a durable native file
    And the reviewed transcript and media metadata are committed atomically
    And the memory remains available after process termination and relaunch
```

```gherkin
Feature: Recording interruption safety
  Scenario Outline: Recording is interrupted without silent data loss
    Given the application is recording a valid answer
    When <interruption> occurs
    Then the microphone session is released or resumed according to policy
    And the application clearly reports the resulting state
    And any valid captured audio is recoverable
    And no duplicate or phantom memory is created

    Examples:
      | interruption |
      | an incoming call |
      | audio-focus loss |
      | app backgrounding |
      | screen lock |
      | operating-system termination |
```

```gherkin
Feature: Archive recovery
  Scenario: A parent restores an exported archive on a clean installation
    Given the parent exported a valid versioned archive with multiple recordings
    And the application has been installed with an empty database
    When the parent imports the archive
    Then every manifest and media checksum is validated before commit
    And all valid profiles, transcripts, dates, and playable recordings are restored
    And a failed validation leaves the pre-import state unchanged
```

```gherkin
Feature: Privacy-safe diagnostics
  Scenario: A production error is reported
    Given crash monitoring is enabled
    When a failure occurs while processing a family memory
    Then the report contains the release, platform, error class, and redacted diagnostic context
    And it contains no child name, transcript, recording, archive payload, or sensitive file path
```

```gherkin
Feature: Production artifact promotion
  Scenario: A verified candidate is released
    Given a signed immutable artifact passed automated and physical-device gates
    And privacy, legal, store, support, and recovery gates are approved
    When the release owner promotes the candidate
    Then the exact tested build is submitted to the selected store track
    And the release has an owned rollback or superseding-release procedure
```

## 7. Recommended migration sequence

### Phase 0 — Decisions that prevent rework

1. Approve audience classification.
2. Approve native/on-device vs backend transcription.
3. Approve local-only vs encrypted backup/sync durability.
4. Approve supported OS, phone/tablet, locale, and accessibility matrix.
5. Decide free MVP vs paid launch.

**Exit gate:** written architecture/privacy decisions exist for all five items.

### Phase 1 — Native foundation

1. Create `apps/mobile` and shared domain/application packages.
2. Configure Expo Router, app identifiers, permissions, icons, themes, development builds, and EAS development/preview profiles.
3. Port onboarding and prompt selection.

**Exit gate:** signed development builds launch on physical iOS and Android devices and reuse the shared prompt tests.

### Phase 2 — One production-shaped vertical slice

1. Implement native recording/playback and transcription/fallback.
2. Implement SQLite/filesystem persistence and the atomic save protocol.
3. Port review/edit, timeline, settings, and deletion.
4. Test lifecycle interruptions and process-death recovery.

**Exit gate:** onboarding → prompt → record → transcribe/fallback → edit → save → relaunch → playback passes on both platforms.

### Phase 3 — Durability and trust

1. Implement migrations, quotas, corruption/orphan handling, and storage reporting.
2. Implement export/import/restore and recovery drills.
3. Complete the threat model, file protection, backup behavior, retention, and deletion semantics.
4. Update privacy/terms and store declarations from the actual data-flow inventory.

**Exit gate:** restore, deletion, security, and privacy reviews pass with physical-device evidence.

### Phase 4 — Native quality and operations

1. Add native unit/integration/E2E coverage and a device matrix.
2. Complete accessibility and large-archive performance gates.
3. Add privacy-safe monitoring, support, incident ownership, and rollback drills.
4. Configure EAS production builds, runtime/update policy, and CI artifact promotion.

**Exit gate:** immutable production-equivalent artifacts pass all repository-controlled gates.

### Phase 5 — Store beta and production

1. Complete TestFlight and Google Play internal/closed testing.
2. Resolve beta feedback and repeat regression/recovery gates.
3. Complete metadata, screenshots, legal/support URLs, reviewer notes, and store declarations.
4. Submit the exact verified artifacts and perform a staged rollout.

**Exit gate:** store approval plus release-health, support, incident, recovery, and rollback ownership.

## 8. Production decision rule

Do not describe the mobile product as **production-ready**, **shipped**, or **App Store/Google Play ready** until all P0 rows have evidence from signed artifacts and all non-risk-accepted P1 rows are closed.

Minimum production evidence must include:

- Signed iOS and Android artifact identifiers.
- Physical-device core-journey results.
- Interruption, process-death, upgrade, low-storage, export/import/restore, and deletion results.
- Approved privacy/security data-flow review and accurate store declarations.
- EAS build/update/rollback evidence.
- Store beta and review evidence.
- Named support, incident, recovery, and release owners.

## 9. Official references

- [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/)
- [Expo Speech](https://docs.expo.dev/versions/latest/sdk/speech/)
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [EAS Update](https://docs.expo.dev/eas-update/introduction/)
- [Submitting to app stores with Expo](https://docs.expo.dev/deploy/submit-to-app-stores/)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- [Google Play Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Google Play Families Policies](https://support.google.com/googleplay/android-developer/answer/9893335)
- [Google Play testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465)
