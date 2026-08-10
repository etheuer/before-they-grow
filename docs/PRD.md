# Before They Grow Product Requirements

**Status:** Implemented MVP candidate  
**Version:** 0.1.0  
**Last updated:** 2026-08-10  
**Product type:** Mobile-first installable web app  
**Primary user:** Parent or guardian of a child aged 3 to 12

## 1. Product decision

Build a private, two-minute family ritual that gives a parent one age-aware question and preserves the child's answer as text, voice, or both. The product competes on low friction, emotional specificity, local-first privacy, and unconditional export rather than on family-feed breadth.

The MVP is approved for user testing. It is not approved for paid acquisition, App Store submission, or commercial billing until the external gates in `RELEASE_READINESS.md` pass.

## 2. Problem

Parents want to remember how their children thought and sounded, but full journaling, photo sorting, and long-form storytelling create too much work at the end of a busy day. Generic questions such as “How was school?” often produce closed answers. Existing memory products validate demand, but most optimize for photo albums, broad journaling, or question libraries rather than a voice-first nightly ritual.

## 3. Jobs to be done

### Functional job

When I have two quiet minutes with my child, help me ask a worthwhile question and preserve the exact answer without setting up a complex family archive.

### Emotional job

Help me feel that ordinary nights are not disappearing unnoticed.

### Trust job

Let me know where intimate family data lives, let me remove it, and never hold export behind a subscription.

## 4. Target and exclusions

### Primary segment

- Parent or guardian, usually age 28 to 50.
- Child age 3 to 12.
- Uses a modern mobile browser.
- Values private memories but does not maintain a consistent journal.
- Can complete the ritual at bedtime, dinner, or during a drive-home pause.

### Non-goals for version 0.1

- Cloud accounts, family sharing, or cross-device sync.
- AI transcription, sentiment analysis, or generated psychological advice.
- Social feed, public child profiles, or discoverability.
- Push notifications.
- Payment processing or a functional subscription paywall.
- Native iOS or Android packages.
- Medical, therapeutic, educational assessment, or parenting advice.

## 5. Positioning

**Category:** Private family voice journal  
**Promise:** One question tonight. Their voice tomorrow.  
**Proof:** An answer can be recorded or typed in two minutes, remains on the device, appears in a dated timeline, and exports with audio included.  
**Differentiation:** Daily age-aware prompts plus the child's real voice, without requiring a family feed, cloud account, or subscription to retrieve memories.

## 6. User journey

1. Parent opens the marketing page and understands the outcome from the hero.
2. Parent opens the app.
3. Parent supplies a child nickname and age band.
4. App shows one deterministic age-aware question and one follow-up.
5. Parent records audio, types the answer, or does both.
6. Parent saves the answer.
7. Parent revisits entries in the timeline.
8. Parent exports all data or deletes all local data from Settings.

## 7. Information architecture

| Route | Purpose |
|---|---|
| `/` | Public marketing page and product explanation |
| `/app` | Onboarding or tonight's question |
| `/app/memories` | Dated private memory timeline |
| `/app/settings` | Data export, local-storage explanation, deletion |
| `/privacy` | Truthful local-first privacy notice |
| `/terms` | Prototype terms and limitations |

## 8. Data model

### FamilyProfile

| Field | Type | Rule |
|---|---|---|
| `childName` | string | Trimmed nickname, 1 to 40 characters |
| `ageBand` | enum | `3-5`, `6-8`, or `9-12` |
| `consentedAt` | ISO timestamp | Set when onboarding completes |

### MemoryEntry

| Field | Type | Rule |
|---|---|---|
| `id` | UUID string | Unique in the local database |
| `promptId` | string | Stable prompt identifier |
| `question` | string | Stored with the answer so later prompt edits do not rewrite history |
| `answerText` | string | May be empty only when audio exists |
| `audio` | Blob or null | Browser-produced audio recording |
| `recordedAt` | ISO timestamp | Save time |

### Storage

- IndexedDB database: `before-they-grow`.
- Object stores: `profiles`, `memories`.
- No server or third-party analytics in version 0.1.
- Export format version: `1`.

## 9. Functional acceptance criteria

### R-01 Marketing comprehension

```gherkin
Feature: Marketing promise
  Scenario: A first-time visitor sees the product
    Given the visitor opens "/"
    Then the page shows the heading "One question tonight. Their voice tomorrow."
    And the page explains Ask, Listen, and Keep
    And a "Try tonight’s question" link opens "/app"
    And privacy, age-aware prompts, and export are visible before the final call to action
```

### R-02 Onboarding

```gherkin
Feature: Family setup
  Scenario: A new parent creates a local profile
    Given no profile exists in IndexedDB
    When the parent opens "/app"
    Then the app asks for a child first name or nickname
    And the app offers exactly the age bands 3 to 5, 6 to 8, and 9 to 12
    And the app says answers stay on this device and remain exportable
    When the parent submits a non-empty nickname and an age band
    Then the profile is stored locally with a consent timestamp
    And the app shows tonight's question

  Scenario: Empty nickname is rejected
    Given the onboarding form is visible
    When the nickname contains only whitespace
    Then onboarding does not complete
```

### R-03 Daily prompt

```gherkin
Feature: Age-aware daily question
  Scenario Outline: The question matches the selected age band
    Given the profile age band is <ageBand>
    When the parent opens the app on a date
    Then the question belongs to <ageBand>
    And a follow-up prompt is available

    Examples:
      | ageBand |
      | 3-5     |
      | 6-8     |
      | 9-12    |

  Scenario: A question is stable during one local day
    Given the profile already exists
    When the app is opened twice on the same local date
    Then the same prompt identifier is returned

  Scenario: The question rotates
    Given prompts exist for the profile age band
    When the local date advances by one day
    Then a different prompt identifier is returned
```

### R-04 Voice capture

```gherkin
Feature: Voice answer
  Scenario: Microphone permission is granted
    Given MediaRecorder and microphone access are available
    When the parent chooses "Record their voice"
    Then the app requests audio-only microphone access
    And the parent can finish recording
    And the microphone tracks are stopped
    And the audio Blob is ready to save

  Scenario: Recording is unsupported or denied
    Given microphone recording cannot start
    When the parent tries to record
    Then the app explains that microphone access was unavailable
    And the typed-answer path remains usable
```

### R-05 Saving an answer

```gherkin
Feature: Preserve an answer
  Scenario: Save text only
    Given the daily question is visible
    When the parent enters non-empty answer text and saves
    Then one MemoryEntry is stored with that text and no audio
    And a saved confirmation names the child

  Scenario: Save audio only
    Given a completed audio recording exists
    And the typed answer is empty
    When the parent saves
    Then one MemoryEntry is stored with the audio Blob

  Scenario: Reject an empty memory
    Given no audio exists
    And the typed answer is empty
    Then "Keep this answer" is disabled
```

### R-06 Timeline

```gherkin
Feature: Memory timeline
  Scenario: Show saved answers newest first
    Given one or more memories exist
    When the parent opens "/app/memories"
    Then entries are ordered by recordedAt descending
    And each entry shows its date and original question
    And typed text is displayed as a quotation
    And saved audio has browser playback controls

  Scenario: No memories exist
    Given the profile exists but no memories exist
    When the parent opens the timeline
    Then the app invites the parent to answer tonight's question
```

### R-07 Portable export

```gherkin
Feature: Export without lock-in
  Scenario: Export all data
    Given a profile and memories exist
    When the parent selects "Export my memories"
    Then a file named "before-they-grow-export.json" downloads
    And the document has export format version 1
    And it includes the profile and every memory
    And audio is represented by its MIME type and Base64 bytes
```

### R-08 Deletion

```gherkin
Feature: Delete local data
  Scenario: First delete action is reversible
    Given the settings screen is visible
    When the parent selects "Delete everything"
    Then no data is deleted yet
    And a warning explains the action cannot be undone

  Scenario: Confirm permanent deletion
    Given the deletion warning is visible
    When the parent selects "Yes, delete everything"
    Then the profile and every memory are removed from IndexedDB
    And the onboarding screen is shown
```

### R-09 Privacy and terms

```gherkin
Feature: Truthful policy pages
  Scenario: Read the privacy notice
    When a visitor opens "/privacy"
    Then the page states that data is stored only in this browser
    And it explains microphone access, export, deletion, and child use

  Scenario: Read the terms
    When a visitor opens "/terms"
    Then the page explains ownership, recording permission, local-only backup risk, and prototype limitations
```

### R-10 Installable mobile web app

```gherkin
Feature: Progressive web app
  Scenario: Production build
    When the production build completes
    Then the output includes a web manifest
    And it includes 192px and 512px icons
    And it includes a generated service worker

  Scenario: Mobile layout
    Given a Pixel 7-sized viewport
    When the marketing and onboarding pages render
    Then document width does not exceed viewport width
    And the primary call to action remains visible and usable
```

## 10. Quality attributes

| Attribute | Requirement |
|---|---|
| Accessibility | Keyboard focus is visible; form controls have labels; status and error messages use semantic roles; reduced-motion preference is respected. |
| Performance | Static production bundle; no backend round trips for the core journey. |
| Privacy | No network transmission of family content in version 0.1. |
| Reliability | Text and audio persist through IndexedDB; export is independently readable JSON. |
| Portability | Chrome, Edge, Safari, and Firefox are intended targets; microphone support depends on each browser and secure context. |
| Responsive design | No horizontal overflow at desktop or Pixel 7 viewport in Playwright. |

## 11. Monetization hypothesis, not implementation

Benchmark observed on the Family Conversations App Store page on 2026-08-10: `$4.99/month`, `$29.99/year`, and `$49.99 lifetime`. Do not treat those values as validated willingness to pay for this product.

A future Plus offer may include multiple child profiles, specialist prompt packs, reminders, encrypted sync, and annual audio compilations. Recording, existing-memory playback, deletion, and complete export must never be held hostage by a paid plan.

Payment integration is blocked until at least 10 target-parent interviews and a fake-door pricing test produce evidence. Revenue above `$10k/month` for competitors was not independently verified.

## 12. Instrumentation plan

The current privacy-first prototype has no analytics. Before any instrumented beta, obtain consent and define a privacy-reviewed event policy. Candidate events:

- `marketing_cta_clicked`
- `onboarding_started`
- `onboarding_completed`
- `recording_started`
- `recording_completed`
- `memory_saved`
- `timeline_opened`
- `export_completed`
- `delete_completed`

Primary funnel: landing visit → app open → onboarding complete → first memory saved.  
North-star behavior: families saving at least three answers in seven days.  
Guardrails: export success, deletion success, microphone denial recovery, week-one retention, and support complaints about data loss.

## 13. Requirement gap analysis

| Requirement | MVP status | Evidence | Remaining gap | Priority |
|---|---|---|---|---|
| R-01 Marketing comprehension | Implemented | Landing-page test and browser visual QA | Message testing with real parents | P1 |
| R-02 Onboarding | Implemented | React and Playwright tests | Multiple children excluded | P2 |
| R-03 Daily prompt | Implemented | Five prompt-domain tests | Prompt quality not expert reviewed | P1 |
| R-04 Voice capture | Implemented | MediaRecorder test verifies Blob and track release | Real iOS Safari device test | P0 before external beta |
| R-05 Save answer | Implemented | Text and audio integration tests | Duplicate same-day answer policy undefined | P2 |
| R-06 Timeline | Implemented | Timeline integration and E2E tests | Search and editing excluded | P2 |
| R-07 Export | Implemented | Base64 export unit test and browser download E2E | Large export stress test | P1 |
| R-08 Deletion | Implemented | Two-step deletion integration test | Browser data-clearing education only | P2 |
| R-09 Policies | Implemented as truthful drafts | Route test | Legal review and public support contact | P0 before commercial launch |
| R-10 PWA | Implemented | Build output and mobile E2E | Native App Store package not built | P0 before App Store submission |
| Billing | Not implemented by design | Documented gate | Validate price, then integrate provider | P1 after interviews |
| Cloud recovery | Not implemented by design | Local-first architecture | Decide if encrypted sync is worth privacy cost | P2 |

## 14. Stop, proceed, and scale gates

### Proceed to 10 moderated parent tests when

- All local automated checks pass.
- A real iPhone Safari test confirms recording, persistence, playback, export, and deletion.
- Each participant is told this is local-only and not a backup service.

### Proceed to a public web beta when

- At least 6 of 10 parents complete the first memory without help.
- At least 4 of 10 return and save three memories inside seven days.
- No participant misunderstands where audio is stored.
- Terms, privacy, support, monitoring, deployment, and recovery gates pass.

### Proceed to monetization tests when

- Week-one repeat behavior is demonstrated.
- At least 5 participants ask for a concrete Plus capability.
- Export and prior-memory access remain free.

### Stop or reposition when

- Fewer than 3 of 10 parents save a second memory.
- Parents consistently prefer photo-first capture over voice.
- Local-only storage creates unacceptable trust or loss concerns.
- Acquisition content earns views but no qualified app starts.
