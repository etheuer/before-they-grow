# Before They Grow

A mobile-first, local-first family voice journal: one age-aware question, one small answer, one private timeline.

## What works

- Age-aware daily prompts for ages 3–5, 6–8, and 9–12.
- Voice-first capture through the browser MediaRecorder API.
- Automatic browser speech recognition when supported.
- Parent-editable transcript review before saving.
- Manual transcript recovery when recording or speech recognition is unavailable.
- IndexedDB persistence for profiles, parent-reviewed transcripts, and audio.
- Dated memory timeline with audio playback.
- Versioned JSON export with embedded Base64 audio.
- Two-step permanent deletion.
- Installable PWA build with offline precache.
- Public marketing, privacy, and terms pages.
- An isolated Expo native shell with mandatory biometric/device-passcode App lock.

This is a publicly deployed, verified prototype—not a commercially approved product. It has no cloud backup, accounts, billing, analytics, or native App Store package. Saved family data remains in the browser that created it. When supported, automatic transcription may use a speech service supplied by the browser; processing may occur on-device or through the browser provider.

## Live prototype

**Vercel:** https://before-they-grow.vercel.app

## Run locally

Requirements: Node.js 20.19 or newer and npm.

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`.

Microphone recording requires a secure browser context. Browsers treat localhost as secure for development.

## Native development

The native mobile application requires a custom development build because App lock uses native authentication. Expo Go is not a supported or valid verification path.

```bash
# iOS 17+ simulator or connected iPhone
npm run ios --workspace @before-they-grow/mobile

# Android API 29+ emulator or connected phone
npm run android --workspace @before-they-grow/mobile

# Start Metro for an installed development client
npm run start --workspace @before-they-grow/mobile
```

Configure platform signing before installing on a physical device. Family content must never be added to build configuration or diagnostics.

## Verify

```bash
npm run check
npx playwright install chromium
npm run test:e2e
```

The automated suite covers prompt rotation, IndexedDB persistence, voice capture, browser transcription, editable transcript review, portable export, onboarding, recovery paths, timeline rendering, deletion, legal routes, the desktop journey, and the Pixel 7 journey.

## Architecture

```text
apps/
  mobile/                         Expo/React Native presentation and native adapters
  web/                            Existing Vite Web PWA and browser-only adapters
packages/
  domain/                         Platform-neutral prompts and domain rules
  contracts/                      Serializable versioned native contracts
  application/                    Use cases and explicit platform ports
scripts/
  check-native-boundaries.mjs     Enforces one-way, browser-free native boundaries

docs/
  PRD.md                          Requirements and Gherkin criteria
  VALIDATION.md                   Evidence ledger and decision gates
  evidence/                       Refreshable source snapshots
marketing/
  LAUNCH_KIT.md                   Listing and five-channel campaigns
```

The repository is an npm-workspaces monorepo. Applications depend inward on platform-neutral packages; shared packages never depend on Expo, React Native, React DOM, browser storage, CSS, or WebView code. The Web PWA remains the verified browser baseline while native equivalence is built independently.

The current Web PWA deliberately has no application backend. Its saved family content stays in browser IndexedDB until the user exports, deletes, or clears browser storage. The native shell in this slice contains no family persistence yet and stores no unlock state, PIN, biometric data, or product-owned key.

## Product evidence

- [`docs/VALIDATION.md`](docs/VALIDATION.md) labels observed evidence, assumptions, source heuristics, and blocked revenue claims.
- [`docs/VERIFICATION.md`](docs/VERIFICATION.md) records local, CI, accessibility, performance, browser, and production-deployment evidence.
- [`docs/PRD.md`](docs/PRD.md) contains implementation-ready requirements and a requirement-by-requirement gap analysis.
- [`docs/UX_REDESIGN_SPEC.md`](docs/UX_REDESIGN_SPEC.md) contains evidence-based parent-app UX research and the AI-agent-ready redesign contract.
- [`RELEASE_READINESS.md`](RELEASE_READINESS.md) separates verified code and deployment from still-open device, legal, security, recovery, monetization, and App Store gates.
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

- No account or Before They Grow application server exists.
- No analytics or advertising SDK is installed.
- Microphone access is requested only after a record action, and tracks are released when recording ends.
- When available, browser speech recognition may process voice on-device or through the browser provider. The operative recording screen and privacy page disclose this.
- Saved recordings and parent-reviewed transcripts remain in IndexedDB until export or deletion.
- Local browser storage is not a backup. Export important memories regularly.
- The policy pages are truthful prototype drafts and still require legal review before commercial launch.

## Current release state

Local checks and the current Vercel production deployment are verified. Real-device Safari and Android microphone/transcription behavior, legal approval, support operations, user validation, billing, and App Store submission remain unchecked. Do not call this product commercially shipped until the remaining release gates have external evidence.
