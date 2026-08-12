# Verification Template — #42 Initial native release candidate

**Purpose:** Non-secret evidence checklist for the founder to physically verify
one immutable signed release candidate before App Store / Google Play submission.

**Artifact identifiers (fill in during the #42 session):**
- iOS build ID: _________
- Android build ID: _________
- Git commit tested: _________

## Required device checks

Run every check on the supported phone matrix:
- iPhone 14 Pro Max (iOS 17+)
- Samsung M14 (Android API 29+)

### 1. Core ritual
- [ ] Install the signed build (TestFlight / Play internal testing).
- [ ] App lock with biometric (Face ID / fingerprint). Fall back to device passcode.
- [ ] Cancel / fail authentication → stays locked.
- [ ] Onboard one child (nickname + age band + consent). Confirm profile persists after relaunch.
- [ ] Tonight's prompt shown. Same local day → same prompt. Different day → different prompt.

### 2. Voice capture
- [ ] Record a short answer (≤ 30 s). Review with playback.
- [ ] Edit the transcript. Save voice and words.
- [ ] Save voice only (audio, no text). Save manual text when mic denied.
- [ ] Record a second answer. It appears newest-first in the timeline.
- [ ] Playback in the timeline with explicit pause.

### 3. Interruptions
- [ ] Recorder stops on screen lock, background, and incoming call (no leaked mic).
- [ ] A valid capture survives the lock → returns for review after re-authentication.
- [ ] A corrupted/invalid recording is reported as not saved.

### 4. Deletion
- [ ] Hard-delete one memory (confirmation, irreversibility explained, verified absent).
- [ ] Hard-delete everything (two confirmations, app returns to onboarding).

### 5. Backup exclusion (destructive — use dedicated test accounts)
- [ ] iOS iCloud backup restore: no family content recovered on a clean install after backup restore.
- [ ] Android cloud backup: no family content recovered after device backup restore.
- [ ] Android device transfer: no family content transferred to a reset-safe target phone.

### 6. Accessibility
- [ ] VoiceOver (iOS) / TalkBack (Android) speaks the core ritual, lock, playback, and delete confirmations.
- [ ] Largest text setting: primary actions remain visible and operable.
- [ ] Reduced motion: nonessential movement removed.

### 7. No unintended data paths
- [ ] No account, share, cloud, billing, or analytics affordance visible.
- [ ] Settings page explains local-only storage, no backup, no recovery, and permanent-loss risks.

## Evidence log

| Check | Date | Device | Result | Notes |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

Keep this log in the founder's password manager or a private offline file.
Do not commit filled-in evidence to the repository.