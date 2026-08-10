# Verification Evidence

**Candidate:** 0.1.0  
**Latest run:** 2026-08-10T19:59:13Z
**Environment:** Local Linux host, GitHub Actions, Vercel production, Playwright Chromium

This evidence covers repository-controlled behavior and the public Vercel prototype. It is not real-device, legal, App Store, recovery-drill, or commercial-launch approval.

## Automated quality gates

| Gate | Command | Result |
|---|---|---|
| Lint, unit/integration tests, production build | `npm run check` | PASS: 5 test files, 40 tests, including voice-first transcript review, speech-recognition construction/runtime failure recovery, asynchronous recorder error/stop recovery, microphone/recognizer cleanup, replacement-permission safety, lazy IndexedDB bootstrap/retry, and visible storage recovery; Vite production build and PWA service worker generated |
| Browser journey | `npm run test:e2e` | PASS against a fresh production build/preview: manifest discovery, synchronous IndexedDB-open recovery/retry, and desktop plus Pixel 7 voice → generated transcript → parent edit → save → timeline → export journeys; downloaded JSON is inspected for the reviewed transcript and original non-empty audio; 7 passed, 1 desktop-only duplicate mobile check skipped by design; mobile save control verified clear of fixed navigation |
| Voice-first release CI | GitHub Actions run `31426487333`, commit `311a3edc4734b73713c512b89ddf8b95622482bb` | PASS: `quality` and `browser` jobs completed successfully for the deployed source revision |
| Dependency audit | `npm audit --audit-level=high` | PASS: `found 0 vulnerabilities` |
| Added-line security scan | Regex scan over `git diff` additions | PASS: no hardcoded secrets, shell injection, eval/exec, unsafe deserialization, DOM `innerHTML`, or debug-console patterns |

## Accessibility

Pa11y 9 with axe was run using WCAG 2 AA and error-level failure. `/app`, `/privacy`, and `/terms` passed with no issues. The landing page passed with its intentionally decorative, `aria-hidden` product preview excluded; every foreground/background pair in that preview was also checked directly:

| Element | Ratio |
|---|---:|
| Preview status | 8.27:1 |
| Preview label | 5.10:1 |
| Preview question | 16.59:1 |
| Preview record control | 5.10:1 |
| Preview saved-data note | 5.52:1 |

The preview duplicates the adjacent product promise and is removed from the accessibility tree by its parent’s `aria-hidden="true"`; direct contrast checks cover its visual presentation.

## Local performance observation

A warm local production-preview navigation in Chrome measured:

- First paint: 152 ms
- First contentful paint: 488 ms
- DOM content loaded: 226 ms
- Load event: 227 ms
- Requests: 11
- Transferred bytes: 358,415
- Decoded body bytes: 567,723

These are local loopback observations, not claims about cold starts, CDN behavior, mobile networks, or global user-facing latency. The revised production build reported a 288.52 kB JavaScript asset (90.42 kB gzip) and 17.43 kB CSS asset (4.19 kB gzip).

## Visual and responsive QA

- Desktop and Pixel 7 capture screens were inspected for the single-action hierarchy, hidden pre-record transcript field, generated-transcript review, failure recovery, clipping, and contrast.
- Pixel 7 Playwright coverage asserts no horizontal overflow and proves the fixed mobile navigation does not obscure the transcript save control after automatic review-field positioning.
- The end-to-end journey verifies onboarding, voice recording, generated transcript population, parent correction, original-audio plus edited-text persistence, timeline rendering, and downloadable export in desktop and mobile Chromium.

## Production deployment

The voice-first editable-transcript release is published and verified:

- **Source commit:** `311a3edc4734b73713c512b89ddf8b95622482bb`
- **GitHub Actions:** run `31426487333`; `quality` and `browser` jobs passed
- **Stable public URL:** `https://before-they-grow.vercel.app`
- **Vercel project:** `et-projects/before-they-grow`
- **Immutable deployment:** `https://before-they-grow-a8l2wnaxs-et-projects.vercel.app` (Vercel SSO-protected; provider inspection confirms the stable public alias points to it)
- **Deployment ID:** `dpl_AsVJEzYv3cWtgmVKJqYVAvtEiVch`
- **Provider state:** `Ready`, target `production`
- The public stable alias rendered `/`, `/app`, `/app/memories`, `/app/settings`, `/privacy`, and `/terms` with HTTP 200 and the expected headings.
- The manifest is discoverable and the production service worker activated at root scope.
- Two consecutive fresh-browser production smokes completed onboarding, recording, browser-generated transcript population, parent correction, save, timeline rendering, versioned JSON export, and confirmed deletion without page errors.
- Both exports contained the corrected transcript, `audio/webm` MIME type, and non-empty Base64 audio from the original recording.
- Visual inspection confirmed the intended styled marketing page—not an authentication interstitial, stale design, or unstyled/error response.

## Still external or manual

See `RELEASE_READINESS.md`. Real iPhone Safari and Android Chrome microphone and speech-recognition behavior, browser-provider processing review, physical-device PWA installation, screen-reader testing, legal approval, support ownership, rollback/recovery drills, user validation, billing, and App Store review remain open.
