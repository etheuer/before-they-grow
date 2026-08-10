# Local Verification Evidence

**Candidate:** 0.1.0 staged tree  
**Run:** 2026-08-10T16:51:19Z  
**Environment:** Local Linux host, production Vite preview, Playwright Chromium

This evidence approves repository-controlled behavior only. It is not production-hosting, real-device, legal, App Store, or commercial-launch evidence.

## Automated quality gates

| Gate | Command | Result |
|---|---|---|
| Lint, unit/integration tests, production build | `npm run check` | PASS: 5 test files, 24 tests, including microphone cleanup and visible recovery for profile, memory, timeline, export, and deletion storage failures; Vite production build and PWA service worker generated |
| Browser journey | `npm run test:e2e` | PASS: manifest discovery plus desktop and Pixel 7 journeys; 5 passed, 1 desktop-only duplicate mobile check skipped by design |
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

## Still external or manual

See `RELEASE_READINESS.md`. Real iPhone Safari and Android Chrome microphone checks, production deployment, screen-reader testing, legal approval, support ownership, recovery, user validation, billing, and App Store review remain open.
