# Dependency Audit — Before They Grow Initial native release

**Date:** 2026-08-12
**Target:** production release, no non-operational data collection.

## Result: Clean

No analytics, advertising, third-party speech-to-text, cloud-service SDK,
product-telemetry, or remote-support packages are present in any workspace
(`apps/mobile`, `apps/web`, `packages/*`). Scanned patterns:

- Analytics: `firebase`, `sentry`, `segment`, `amplitude`, `mixpanel`,
  `google-analytics`, `react-native-google-analytics`
- Ads: `facebook-ads`, `react-native-advertising`, `ad-manager`
- Third-party STT: `@google-cloud/speech`, `azure-cognitiveservices-speech`,
  `react-native-voice`, `@react-native-voice`
- Cloud: `aws-*`, `azure-*`, `@google-cloud/*`

The only speech-related dependency is `expo-audio` (recording + permission),
and `expo-local-authentication` (biometric/passcode). Neither transmits
audio, transcripts, or family content off-device. `expo-file-system`,
`expo-sqlite`, and `expo-crypto` handle local storage, and
`@before-they-grow/*` workspace packages are the product's own code.

The `check-native-boundaries` script also enforces no cloud/network STT SDK.

## Maintained by

The dependency list should be re-audited before every release build.
If a new dependency is added, re-run this check:
```bash
grep -rniE "analytics|firebase|sentry|segment|amplitude|ads|cloud|stt" package.json apps/*/package.json packages/*/package.json
```