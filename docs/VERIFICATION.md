# Verification Evidence

**Candidate:** 0.1.0  
**Latest run:** 2026-08-10T17:13:09Z  
**Environment:** Local Linux host, GitHub Actions, Vercel production, Playwright Chromium

This evidence covers repository-controlled behavior and the public Vercel prototype. It is not real-device, legal, App Store, recovery-drill, or commercial-launch approval.

## Automated quality gates

| Gate | Command | Result |
|---|---|---|
| Lint, unit/integration tests, production build | `npm run check` | PASS: 5 test files, 24 tests, including microphone cleanup and visible recovery for profile, memory, timeline, export, and deletion storage failures; Vite production build and PWA service worker generated |
| Browser journey | `npm run test:e2e` | PASS: manifest discovery plus desktop and Pixel 7 journeys; 5 passed, 1 desktop-only duplicate mobile check skipped by design |
| Remote CI | GitHub Actions run `31412302887` | PASS: `quality` and `browser` jobs completed successfully for the reviewed production-code commit |
| Dependency audit | `npm audit --audit-level=high` | PASS: 0 known vulnerabilities |
| Staged secret/dangerous-pattern scan | `search_files` over source/config patterns | PASS: 0 visible-repository matches |

## Accessibility

Pa11y with axe was run against `/`, `/app`, `/privacy`, and `/terms` using WCAG 2 AA and error-level failure. All four routes passed with no error-level issues after fixes to button, process-number, and final-CTA contrast and removal of prohibited ARIA from the decorative product preview.

Axe marked decorative preview colors as “needs further review” because of the layered illustration. Computed foreground/background pairs were checked directly:

| Element | Ratio |
|---|---:|
| Preview status | 8.27:1 |
| Preview label | 5.10:1 |
| Preview question | 16.59:1 |
| Preview record control | 5.10:1 |
| Preview privacy note | 5.52:1 |

The preview is also `aria-hidden` because it duplicates the adjacent marketing promise and is not an interactive product control.

## Local performance observation

A warm local production-preview navigation in Chrome measured:

- First paint: 152 ms
- First contentful paint: 488 ms
- DOM content loaded: 226 ms
- Load event: 227 ms
- Requests: 11
- Transferred bytes: 358,415
- Decoded body bytes: 567,723

These are local loopback observations, not claims about cold starts, CDN behavior, mobile networks, or global user-facing latency. The latest production build reported a 282.56 kB JavaScript asset (88.75 kB gzip) and 17.12 kB CSS asset (4.11 kB gzip).

## Visual and responsive QA

- Desktop landing page and onboarding were inspected in a real browser for hierarchy, clipping, contrast, and form clarity.
- Pixel 7 Playwright coverage asserts that document width does not exceed viewport width on the landing page and onboarding.
- The end-to-end journey verifies onboarding, typed save, timeline rendering, and downloadable export in desktop and mobile Chromium.

## Production deployment

- **Stable URL:** `https://before-they-grow.vercel.app`
- **Vercel project:** `et-projects/before-they-grow`
- **Deployment ID:** `dpl_4daohoSqpjfPJxG2W7H33S7vnaUu`
- **Provider state:** `Ready`, target `production`
- Direct navigation rendered `/`, `/app`, `/app/memories`, `/app/settings`, `/privacy`, and `/terms` with HTTP 200.
- The manifest, icons, service worker, hashed JavaScript, and CSS returned expected content types from the stable alias.
- The production service worker activated at root scope.
- A fresh-browser journey completed onboarding, IndexedDB save, timeline rendering, versioned JSON export, and confirmed deletion, returning to onboarding with no page errors.
- Visual inspection confirmed the intended styled marketing page—not an authentication interstitial, stale design, or unstyled/error response.

## Still external or manual

See `RELEASE_READINESS.md`. Real iPhone Safari and Android Chrome microphone checks, physical-device PWA installation, screen-reader testing, legal approval, support ownership, rollback/recovery drills, user validation, billing, and App Store review remain open.
