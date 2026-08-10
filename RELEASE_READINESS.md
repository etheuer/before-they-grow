# Release Readiness

**Release candidate:** 0.1.0  
**Updated:** 2026-08-10  
**Decision:** The reviewed prototype is publicly deployed and its production routes, PWA assets, and local-first critical journey are verified. External beta, legal, recovery, real-device, and App Store gates remain open; this is not a commercially approved launch.

Legend: `[x]` verified with evidence in this repository; `[ ]` unchecked or blocked outside the repository.

## A. Verified code and CI-ready gates

- [x] TypeScript production build succeeds with `npm run build`.
- [x] ESLint passes with `npm run lint`.
- [x] Unit and integration suite passes with `npm test`.
- [x] Desktop Chromium end-to-end journey passes.
- [x] Pixel 7 Chromium end-to-end journey passes.
- [x] Mobile test checks horizontal overflow.
- [x] PWA build emits a discoverable manifest, 192px and 512px icons, service worker, and precache.
- [x] Text-only answer saves and appears in the timeline.
- [x] Audio-only answer saves without requiring typed text.
- [x] MediaRecorder tests verify tracks are released after recording and after a pending permission request outlives the UI.
- [x] IndexedDB rejection paths restore controls and show visible recovery for profile loading/saving, timeline loading, memory saving, export, and deletion.
- [x] IndexedDB repository tests cover profile, audio memory, ordering, and deletion.
- [x] Portable export test verifies Base64 audio and versioned JSON.
- [x] Browser E2E verifies a real export download.
- [x] Deletion requires a second explicit action.
- [x] Privacy and terms routes exist and match current local-only behavior.
- [x] Desktop landing and onboarding screens received visual browser inspection.
- [x] Automated axe scans pass WCAG 2 AA error-level checks on `/`, `/app`, `/privacy`, and `/terms`; layered preview colors were manually ratio-verified.
- [x] Local production-preview performance and bundle observations are recorded in `docs/VERIFICATION.md`.
- [x] No runtime secrets or credentials are required.
- [x] `npm audit` reported zero known vulnerabilities at installation time.

## B. Deployment gates

- [x] Vercel project `et-projects/before-they-grow` selected and linked.
- [x] HTTPS production deployment is live at `https://before-they-grow.vercel.app`.
- [x] SPA fallback returns rendered application pages for `/app`, `/app/memories`, `/app/settings`, `/privacy`, and `/terms` on the deployed host.
- [x] Production manifest, icons, service worker, JavaScript, and CSS return expected MIME types; the service worker activates at root scope.
- [x] Production browser smoke completed onboarding, save, timeline, portable export, and two-step deletion without page errors.
- [ ] PWA installation verified from a physical device using the production URL.
- [ ] Service-worker update and rollback behavior verified.
- [ ] Error monitoring selected and privacy reviewed.
- [ ] Uptime check and alert destination configured.
- [ ] Deployment rollback rehearsed.

## C. Real-device and compatibility gates

- [ ] iPhone Safari microphone permission, recording, save, playback, export, and deletion verified.
- [ ] Android Chrome microphone permission, recording, save, playback, export, and deletion verified.
- [ ] Browser restart persistence verified on both devices.
- [ ] Private-browsing behavior documented.
- [ ] Storage-quota failure behavior tested with large recordings.
- [ ] Screen reader smoke test completed on iOS VoiceOver and Android TalkBack.
- [ ] Reduced-motion and large-text real-device checks completed.

## D. Data protection and recovery gates

- [x] Current architecture sends no family content to an application server.
- [x] User can export all stored content.
- [x] User can permanently delete all app-managed local content.
- [ ] Threat model reviewed by a security owner.
- [ ] Maximum recording length and storage quota policy defined.
- [ ] Corrupt IndexedDB and interrupted-write recovery tested.
- [ ] Export restore/import strategy decided; import is currently absent.
- [ ] If cloud sync is added, encryption, key management, deletion, residency, subprocessors, and breach response are designed before implementation.

## E. Legal and policy gates

- [x] Privacy and terms drafts truthfully describe the prototype.
- [ ] Qualified legal review completed.
- [ ] Public legal entity and contact details added.
- [ ] Support email or support URL is live.
- [ ] Recording-consent requirements reviewed for launch jurisdictions.
- [ ] Child privacy and parental-consent obligations reviewed, including COPPA and applicable state or international rules.
- [ ] Accessibility statement and support process prepared.
- [ ] Trademark and App Store name search completed for “Before They Grow.”
- [ ] App icon, copy, fonts, and all content licenses documented.

## F. Product-validation gates

- [ ] Ten target-parent interviews completed.
- [ ] At least 6 of 10 complete first save unassisted.
- [ ] At least 4 of 10 save three answers within seven days.
- [ ] Participants correctly understand local-only storage.
- [ ] Voice value exceeds or complements text/photo alternatives.
- [ ] Top support and trust objections are documented.
- [ ] Pricing fake-door test completed before billing integration.
- [ ] Competitor revenue claims remain labeled unless independently verified.

## G. Monetization gates

- [x] Core export and prior-memory access are designated permanently non-hostage features.
- [ ] Plus feature set validated through user demand.
- [ ] Monthly, annual, and lifetime price tests completed.
- [ ] RevenueCat, Superwall, or another billing provider selected only after target platform is chosen.
- [ ] Subscription terms, restore purchases, cancellation, refunds, family sharing, and grace periods specified.
- [ ] Paywall accessibility and honest pricing copy reviewed.
- [ ] No fake urgency, fake reviews, or unimplemented benefits.

## H. App Store gates

- [ ] Native iOS package exists and is signed.
- [ ] Apple Developer Program enrollment verified.
- [ ] App Store Connect record created.
- [ ] Real privacy and terms URLs point to the production host.
- [ ] App privacy nutrition answers match implementation.
- [ ] In-app account deletion not applicable unless accounts are added.
- [ ] Subscription products configured only if billing is implemented.
- [ ] iPhone and supported iPad flows tested.
- [ ] Three to five real screenshots prepared from the shipping build.
- [ ] Review notes and test credentials prepared if access becomes restricted.
- [ ] No “coming soon,” unfinished screens, fake flows, or unowned assets.
- [ ] App Review approval received.

## I. Marketing and operations gates

- [x] Positioning, listing copy, screenshot copy, creator brief, scripts, and experiment matrix exist in `marketing/LAUNCH_KIT.md`.
- [x] Validation sources and caveats exist in `docs/VALIDATION.md`.
- [ ] Brand and claim review completed.
- [ ] Social accounts and publishing owner assigned.
- [ ] Creator contracts and adult-only sourcing process approved.
- [ ] Paid budget caps approved.
- [ ] Attribution method selected without collecting unnecessary child or family data.
- [ ] Customer support owner and response target assigned.
- [ ] Incident owner and escalation path assigned.
- [ ] Refund and complaint process defined before charging.

## J. Evidence commands

```bash
npm ci
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

## K. Release decision rule

- **Repository ready:** Sections A and the GitHub CI run pass.
- **External beta ready:** Sections B, C, D, E, and the initial product-validation safeguards pass.
- **Commercial web ready:** External beta evidence plus monetization, support, incident, and legal gates pass.
- **App Store ready:** Commercial gates plus all App Store gates pass.

Do not use “shipped,” “launched,” or “App Store ready” until the corresponding row has verifiable evidence.
