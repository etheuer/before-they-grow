# Before They Grow

A mobile-first, local-first family voice journal: one age-aware question, one small answer, one private timeline.

## What works

- Age-aware daily prompts for ages 3–5, 6–8, and 9–12.
- Voice recording through the browser MediaRecorder API.
- Typed-answer fallback when a microphone is unavailable.
- IndexedDB persistence for profiles, text, and audio.
- Dated memory timeline with audio playback.
- Versioned JSON export with embedded Base64 audio.
- Two-step permanent deletion.
- Installable PWA build with offline precache.
- Public marketing, privacy, and terms pages.

This is a verified prototype, not a shipped commercial product. It has no cloud backup, accounts, billing, analytics, native App Store package, or production deployment.

## Run locally

Requirements: Node.js 20.19 or newer and npm.

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`.

Microphone recording requires a secure browser context. Browsers treat localhost as secure for development.

## Verify

```bash
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The automated suite covers prompt rotation, IndexedDB persistence, audio capture, portable export, onboarding, text and voice saves, timeline rendering, deletion, legal routes, the desktop journey, and the Pixel 7 journey.

## Architecture

```text
src/
  components/AudioRecorder.tsx    MediaRecorder lifecycle
  data/memoryRepository.ts        IndexedDB repository
  data/portableExport.ts          Versioned JSON export
  domain/prompts.ts               Deterministic age-aware prompts
  App.tsx                         Marketing and product routes
  styles.css                      Shared design system

docs/
  PRD.md                          Requirements and Gherkin criteria
  VALIDATION.md                   Evidence ledger and decision gates
  evidence/                       Refreshable source snapshots
marketing/
  LAUNCH_KIT.md                   Listing and five-channel campaigns
```

The current product deliberately has no application backend. Family content stays in the browser's IndexedDB until the user exports, deletes, or clears browser storage.

## Product evidence

- [`docs/VALIDATION.md`](docs/VALIDATION.md) labels observed evidence, assumptions, source heuristics, and blocked revenue claims.
- [`docs/VERIFICATION.md`](docs/VERIFICATION.md) records local test, accessibility, performance, and browser evidence.
- [`docs/PRD.md`](docs/PRD.md) contains implementation-ready requirements and a requirement-by-requirement gap analysis.
- [`RELEASE_READINESS.md`](RELEASE_READINESS.md) separates verified code from deployment, device, legal, security, recovery, monetization, and App Store gates.
- [`marketing/LAUNCH_KIT.md`](marketing/LAUNCH_KIT.md) contains App Store copy, privacy-safe content scripts, creator terms, and kill/scale rules.
- [`marketing/CONTENT_CALENDAR.csv`](marketing/CONTENT_CALENDAR.csv) schedules a 14-day, three-post-per-day organic test.

Refresh public App Store competitor metadata with:

```bash
python scripts/collect_app_store_evidence.py
```

Regenerate PWA icons with:

```bash
python scripts/generate_icons.py
```

## Privacy limits

- No account or application server exists.
- No analytics or advertising SDK is installed.
- Microphone access is requested only after a record action, and tracks are released when recording ends.
- Local-only data is not a backup. Export important memories regularly.
- The policy pages are truthful prototype drafts and still require legal review before commercial launch.

## Current release state

Local tests and builds pass. Production hosting, real-device Safari and Android verification, legal approval, support operations, user validation, billing, and App Store submission remain unchecked. Do not call this product shipped until the release checklist has external evidence.
