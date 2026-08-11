# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Before They Grow is operated by an adult parent or guardian in the United States during a short family ritual, typically on a phone and often in an interrupted evening context. A child may answer aloud, but the product is adult-directed.

## Product Purpose

Before They Grow helps a parent preserve one child’s ordinary answers and real voice as Local-only memories. Success is a calm record-review-save-revisit loop whose privacy, save state, and permanent-loss limits remain truthful under denial, interruption, constrained storage, and relaunch.

## Positioning

The product combines one deterministic age-aware question with parent-reviewed words and the child’s voice, kept only in application-managed storage on one phone rather than an account or cloud archive.

## Operating Context

The native mobile application targets iOS 17+ and Android 10/API 29+ phones. A parent unlocks the family-memory area through the phone’s biometric or device-passcode mechanism, completes a short voice-first ritual, and later revisits Local-only memories. Custom development builds and signed release-equivalent builds—not Expo Go—provide the native integrations.

## Capabilities and Constraints

- The Initial native release supports one child profile, English UI, native audio capture, optional verified on-device Native transcription, Manual transcript entry, a newest-first timeline, playback, and Hard local deletion.
- App lock is mandatory on launch and every return from inactive or background. It stores no Before They Grow PIN, biometric data, or product-owned key.
- Family content has no Before They Grow cloud, Apple/Google cloud backup, account, sharing, download, Export copy, import, restore, or recovery promise.
- The native mobile application uses React Native/Expo-native presentation and adapters. Shared domain, contracts, and application packages stay platform-neutral and contain no DOM UI, browser APIs, CSS, WebView, IndexedDB, Blob, or MediaRecorder code.
- The existing Web PWA remains a migration reference until the Web companion replaces its browser journal.
- Product terminology follows `CONTEXT.md`.

## Brand Commitments

The name is Before They Grow. The established voice is calm, direct, private, and specific; it does not make backup, recovery, commercial-release, or forensic-erasure claims. The incumbent Web PWA provides the recognizable heart mark and warm red, cream, ink, and muted-earth identity to carry into native surfaces without porting Web UI.

## Evidence on Hand

- `CONTEXT.md` defines the accepted product language.
- GitHub issues #4, #23, #28, #30, and #31 define the native boundary, local-only release posture, persistence contract, product specification, and current tracer slice.
- `apps/web` (migrated from the root Web PWA) and its tests are the incumbent product and visual reference.
- Physical-device, release-artifact, legal, backup-exclusion, and store-submission evidence is not yet complete and must not be fabricated.

## Product Principles

1. Obscure family content before doing anything else.
2. Preserve one small ritual rather than growing a generic family platform.
3. Report saved, not saved, indeterminate, unavailable, and permanently deleted outcomes truthfully.
4. Keep platform-specific code at the application edges and neutral rules in one source of truth.
5. Treat no-recovery local-only storage as a constraint to explain, never a privacy slogan to oversell.

## Accessibility & Inclusion

Core flows and destructive actions must work with VoiceOver and TalkBack, large system text, reduced motion, safe areas, native keyboard behavior, and one-handed phone use. Touch targets meet at least 44 pt on iOS and 48 dp on Android, and lock state is never conveyed by color alone.
