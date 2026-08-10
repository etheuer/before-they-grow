# Before They Grow UX/UI Redesign Specification

| Field | Value |
|---|---|
| Status | Implementation-ready design brief |
| Version | 1.0 |
| Date | 2026-08-10 |
| Target repository | `etheuer/before-they-grow` |
| Target product | Mobile-first installable React web app |
| Primary implementation files | `src/App.tsx`, `src/components/AudioRecorder.tsx`, `src/styles.css` |

## 1. Executive decision

Redesign Before They Grow as a **quiet, one-handed family ritual**, not as a general parenting dashboard and not as a decorative scrapbook.

The redesign must make one loop exceptionally clear:

> Read one worthwhile question → record one answer → review it → trust that it was saved → enjoy it later.

The benchmark products succeed for different reasons:

- **Baby Tracker** removes memory work with large, repeatable logging actions.
- **Huckleberry** tells a parent what matters now and places frequent actions within easy reach.
- **FamilyAlbum** lets family content, chronology, and private connection carry the emotion.

Before They Grow should combine those strengths without importing their complexity, advertising, subscriptions, health-data density, social feed, or feature sprawl.

## 2. Scope and interpretation

The user's market description, “recent parents,” is interpreted here as **time-poor parents using child-focused apps in interrupted, often one-handed contexts**. The product itself remains for parents or guardians of children ages 3–12, as defined in `docs/PRD.md`; this redesign does not narrow the product to newborns.

This is a **presentation and interaction redesign**. Preserve all implemented product behavior:

- One deterministic, age-aware daily question and follow-up.
- Voice capture.
- Browser-provided automatic transcription when available.
- Parent review and editing before save.
- Manual-text recovery.
- Local IndexedDB persistence.
- Dated memory timeline with audio playback.
- Portable JSON export.
- Two-step permanent deletion.
- Truthful privacy, terms, and browser-speech disclosures.

Do not add accounts, cloud sync, family sharing, notifications, analytics, billing, medical advice, an AI assistant, social features, search, or new data fields.

## 3. Research method

### 3.1 Selection rule

The benchmark is a purposive US Apple App Store sample captured on 2026-08-10. An app qualified if it:

1. Directly served parents of babies or young children.
2. Had an average US rating of at least **4.80/5**.
3. Had at least **70,000 US ratings**.
4. Exposed a product interaction relevant to Before They Grow: fast capture, “what now” guidance, or memory revisiting.

Apple's lookup data reported the following exact snapshot.[4]

| App | App Store job | Average rating | Ratings | Why included |
|---|---|---:|---:|---|
| FamilyAlbum: Share Baby Photos | Private family memory archive | 4.87767 | 366,516 | Revisit and emotional value |
| Baby Tracker - Newborn Log | One-handed activity capture | 4.80166 | 227,236 | Capture speed and glanceability |
| Huckleberry: Baby Tracker | Tracking plus next-action guidance | 4.92160 | 71,083 | Prioritization and guided action |

The public App Store pages round these values to 4.9/367K, 4.8/227K, and 4.9/71K respectively.[1][2][3]

This is not a claim that these are the three largest parenting apps overall. Pregnancy-content and commerce-led apps were excluded because their primary interaction model is less relevant to a private voice-journal redesign.

### 3.2 Evidence inspected

For each benchmark, the research inspected:

- Current App Store screenshots and listing copy.
- The 250 most recent public US customer reviews available through five 50-review RSS pages.
- Recurring praise and failure themes, coded directionally rather than treated as a representative survey.

Recent-review samples are freshness-biased and self-selected. They are useful for identifying recurring friction, not for recomputing each app's lifetime rating.

## 4. Benchmark analysis

### 4.1 FamilyAlbum: Share Baby Photos

**Store snapshot:** 4.87767 from 366,516 US ratings at capture time.[1][4]

**Review corpus:** Observations draw from the first through fifth recent-review pages.[5][6]

#### What is directly visible

- The family photos are the interface's dominant visual layer; chrome recedes.
- Month and year anchors make a long archive understandable without requiring folders.
- A persistent bottom navigation keeps the collection and add action close to the thumb.
- The listing's language—“Not Social Media. Just Family.”—turns privacy into a product promise rather than a settings footnote.
- Comments add emotional context directly beside the memory.
- Real faces, large imagery, and chronological grouping make revisiting feel like the reward, not administration.

#### What reviews reinforce

- Recurring positive reviews describe seeing a child grow, keeping distant grandparents involved, and enjoying ordinary updates.
- Recurring critical reviews object to intrusive ads between memories, paid access around emotional content, weak order tracking, and inaccessible support.
- Some critical reviews want better titles, captions, grouping, or search, suggesting that automatic chronology is strong but not sufficient for every archive.

#### Transfer to Before They Grow

**Borrow:** content-first chronology, immediate emotional payoff, simple date anchors, and explicit privacy language.

**Do not borrow:** social comments, commerce, ads, subscriptions, family invitations, or photo-grid density.

**Design implication:** once an answer is saved, the child's words and playable voice—not decorative chrome—must become the hero.

### 4.2 Baby Tracker - Newborn Log

**Store snapshot:** 4.80166 from 227,236 US ratings at capture time.[2][4]

**Review corpus:** Observations draw from the first through fifth recent-review pages.[7][8]

#### What is directly visible

- The home view surfaces the last feed, diaper, sleep, and other activities as large color-coded cards.
- Elapsed time is more prominent than metadata; the parent can answer “what happened last?” at a glance.
- Repeated actions use stable categories and icons.
- Timeline and chart views convert repeated entries into patterns.
- The interface is dense, uses small secondary type, and relies heavily on category color.

#### What reviews reinforce

- Positive reviews repeatedly call the app straightforward and valuable for sleep-deprived or “postpartum brain” contexts.
- Parents value one-tap logging, widgets, family-device sync, and not having to remember the last event.
- Critical reviews object to controls moving from the bottom to the top, tiny buttons, one-handed reach problems, ad placement, sync failures, and unreliable widgets.
- A recurring request is dark mode because a bright screen is disruptive during nighttime care.

#### Transfer to Before They Grow

**Borrow:** stable action placement, a dominant low-effort capture control, glanceable status, and the ability to add detail after the primary action.

**Do not borrow:** clinical dashboards, multicolor category grids, charts, tiny utility controls, or color-only meaning.

**Design implication:** the record and finish controls must remain in the lower reach zone, never move between states, and work in a night-friendly theme.

### 4.3 Huckleberry: Baby Tracker

**Store snapshot:** 4.92160 from 71,083 US ratings at capture time.[3][4]

**Review corpus:** Observations draw from the first through fifth recent-review pages.[9][10]

#### What is directly visible

- The home dashboard uses large activity cards and a persistent bottom navigation.
- The most valuable promise is framed as the next useful moment, not as raw data.
- Large left/right nursing controls reduce precision demands during a frequent task.
- Reports turn capture into understandable guidance.
- Friendly illustration and saturated task colors soften a data-heavy product.
- The bottom navigation and product surface are crowded because tracking, reports, sleep plans, insights, child profiles, and AI compete for attention.

#### What reviews reinforce

- Positive reviews praise easy logging, shared caregiver context, retroactive entries, nap prediction, and relief from remembering everything.
- Critical reviews focus on subscription price, unreliable saves, data loss, slow opening, login failure, inaccurate recommendations, and low-trust AI answers.
- The strongest value disappears when the parent cannot trust that an event was saved.

#### Transfer to Before They Grow

**Borrow:** one prioritized next action, forgiving late capture, explicit status, and a clear relationship between today's action and later value.

**Do not borrow:** predictive guidance, AI, paid plans, broad trackers, six-tab navigation, or expert/medical framing.

**Design implication:** Before They Grow should always show one question and one next action; save reliability must be visually undeniable.

## 5. Reusable UX/UI principles

### P1. Design for interrupted cognition

A tired parent should understand the current state and next action in under two seconds. Show one primary action per state. Keep supplementary explanation collapsible or visually secondary.

### P2. Put frequent actions in the thumb zone

On mobile, Tonight, Memories, and Settings stay in a fixed bottom navigation. The record, finish, save, and retry controls span the content width near the lower portion of the viewport. Their position must not jump when labels or helper text change.

### P3. Make saved state visible and durable

Never rely on a toast alone. After saving, show a persistent confirmation containing the child's nickname, save destination, and two next actions: play/review the saved memory and return to Tonight.

### P4. Use content as the emotional design

The prompt, child's words, voice playback, and date carry the emotional weight. Avoid adding decorative parenting imagery, stock children, sentimental gradients, or scrapbook ornament that competes with the family's own content.

### P5. Separate capture from reflection

Tonight is task-first; Memories is content-first. Do not mix stats, archive browsing, settings, or promotional modules into the capture screen.

### P6. Preserve muscle memory

Navigation order and primary controls remain fixed. No A/B variation may move record, finish, save, or bottom-navigation items. A parent who returns in the dark should not relearn the screen.

### P7. Support night use without becoming a sleep app

Use a system-aware dark theme, subdued surfaces, no white flash between routes, and restrained motion. Dark mode is an accessibility and context requirement, not a cosmetic novelty.

### P8. Communicate privacy at the decision point

Say where data goes beside onboarding, recording, export, and deletion. Keep the explanation accurate: saved memories stay in this browser; browser speech services may process voice; clearing site data can remove memories.

### P9. Be forgiving without hiding consequences

Preserve an existing answer while a replacement recording is pending. Keep unsaved audio/text after a save error. Require explicit confirmation only for irreversible deletion, not ordinary navigation.

### P10. Never monetize the memory itself

No ads, upsells, streak pressure, guilt copy, or paywall language may appear in this redesign. Export and playback remain unconditional.

## 6. Current-state audit

The live prototype already presents a coherent editorial identity and the core local-first journey.[13]

### Preserve

- Clear promise: “One question tonight. Their voice tomorrow.”
- Distinct serif for emotional prompts and sans-serif for interface text.
- Warm paper background and restrained palette.
- One-screen onboarding.
- Three-item product information architecture.
- Fixed mobile bottom navigation already implemented at narrow widths.
- Large recording control and editable transcript.
- Honest privacy disclosures, export, deletion, error recovery, semantic labels, focus states, and reduced-motion handling.

### Retire or correct

| Current pattern | Problem | Target correction |
|---|---|---|
| Marketing mock says “Hold to answer” | Actual recorder starts and stops with taps | Show “Record an answer” and a visible review/save sequence |
| Very large mobile marketing and prompt type | Can push the meaningful action below the fold | Cap mobile hero at 48px and prompt at 36px |
| Top brand consumes product-screen height | Reduces task space | Use a compact 56px app bar and let bottom nav carry route navigation |
| Mobile nav is text-only | Slower recognition at a glance | Add Phosphor icons plus persistent labels |
| Support text often renders near 12px | Hard to scan while distracted | Use 14px minimum for functional supporting text |
| Record helper is a paragraph below the control | Important state can be missed | Put short status beside the control; disclose detail through a compact expandable note |
| Browser-native audio control dominates memory cards | Inconsistent and visually utilitarian | Wrap semantic audio in a designed, labeled play row |
| Saved confirmation is a dead end | Does not immediately reward capture | Add “Play this memory” and “View memories” actions |
| Age band defaults to 6–8 | Parent can accidentally accept the wrong band | Require an explicit age-band choice |
| No dark appearance | Bright nighttime experience | Add System/Light/Dark appearance with no route flash |
| “Do not wait for a quieter season” | Can read as guilt pressure | Replace with permission-oriented, non-urgent copy |
| Desktop onboarding appears as a form in a large empty field | Feels like account setup | Frame it as the first step in tonight's ritual, with a preview of the outcome |

## 7. Design direction: Quiet Keepsake

### 7.1 Product personality

- **Calm:** no alarms, streaks, badges, or urgency.
- **Intimate:** sounds like one parent speaking to another.
- **Capable:** actions are clear and statuses are trustworthy.
- **Timeless:** not coded only for babies, mothers, or one family structure.
- **Private:** trust is visible without security theater.

### 7.2 Visual principles

- Use editorial serif only for the marketing headline, the daily question, and saved quotes.
- Use sans-serif for every control, label, status, date, and disclosure.
- Keep surfaces mostly flat. Use borders and spacing before shadows.
- Use one accent color per theme. Do not color-code unrelated controls.
- Use no gradients.
- Use no decorative stock family photography.
- Use no large text over photographs.
- Use Phosphor icons already present in the repository; do not add another icon library.
- Never use an icon without a visible label for primary navigation or irreversible actions.

## 8. Information architecture and navigation

The route structure remains unchanged.

| Route | Primary job | Primary action |
|---|---|---|
| `/` | Understand value and trust | Try tonight's question |
| `/app` before profile | Create local profile | Start the ritual |
| `/app` with profile | Capture today's answer | Record an answer |
| `/app/memories` | Revisit saved answers | Play a memory |
| `/app/settings` | Control local data and appearance | Export memories |
| `/privacy` | Understand data handling | Return to app |
| `/terms` | Understand limitations | Return to app |

### Mobile navigation

- Fixed bottom navigation in the order **Tonight / Memories / Settings**.
- Each item contains an icon and label.
- Minimum target: 56px high; equal widths; safe-area padding included.
- Active state uses icon weight, text color, and a subtle top indicator—not color alone.
- Bottom navigation is hidden during first-time onboarding and legal pages.

### Desktop navigation

- Compact top app bar with brand on the left and the same three destinations on the right.
- Product content remains centered at a maximum width of 720px.
- Do not render a fake phone frame around the web app.

## 9. Screen specifications

### 9.1 Marketing page

#### Above the fold

Left/content column:

- Eyebrow: `A private two-minute family ritual`
- H1: `One question tonight. Their voice tomorrow.`
- Supporting text: `Keep one ordinary answer in their real voice—without starting a journal.`
- Primary CTA: `Try tonight's question`
- Secondary text link: `See the three steps`
- Trust line below CTA: shield icon + `No account. Saved in this browser. Export anytime.`

Right/product proof:

- Show a truthful, static composite of the actual Tonight and saved-memory states.
- The record button label is `Record an answer`, never `Hold to answer`.
- Include a compact transcript-review field and saved check state so the entire promise is visible.
- Use fictional demo names and answers.

#### Remaining sections

1. **Ask / Record / Keep** — three steps, compact and aligned.
2. **What comes back later** — one designed memory card with date, question, quote, and play button.
3. **Private by design** — local storage, browser speech caveat, export, and deletion in plain language.
4. **Final CTA** — `Two minutes is enough to keep one ordinary answer.` and `Try tonight's question`.

Do not add testimonials, invented usage counts, stock child imagery, pricing, or newsletter capture.

### 9.2 Onboarding

- One screen; no carousel and no progress indicator.
- Heading: `Who are we listening to?`
- Support: `A nickname and age range help us choose better questions.`
- Nickname field uses a 56px minimum height and autofocus only when it will not cause disruptive viewport movement.
- Age bands appear as three full-width segmented choices on wide screens and three stacked choices below 380px.
- No age band is selected by default.
- Selection includes text, border, fill, and checked icon.
- Privacy note is visible before submission and no smaller than 14px.
- CTA remains `Start our ritual` and is disabled until nickname and age band are valid.
- Preserve the existing consent timestamp behavior.

### 9.3 Tonight: ready state

Vertical order:

1. Compact app bar.
2. Context row: `For {nickname}` and prompt category.
3. Label: `Tonight's question`.
4. Daily question, serif, maximum 36px on mobile.
5. Follow-up inside a low-emphasis `Need a nudge?` disclosure.
6. Capture module.
7. Fixed bottom navigation.

Capture module:

- Large full-width button, at least 64px high: microphone icon + `Record an answer`.
- Under it, one concise line: `Tap once to start. You'll review before anything is saved.`
- Compact privacy link: `How voice and transcripts work`.
- On a 390×844 viewport, the primary recording control must be visible without scrolling for a typical two-line question.

### 9.4 Tonight: permission/requesting state

- Keep the capture module in place; do not replace the whole screen.
- Button becomes disabled with spinner and `Waiting for microphone…`.
- Show `Your browser will ask for microphone access.`
- Provide no cancel button unless the browser API supports actual cancellation.
- Existing answer data remains untouched.

### 9.5 Tonight: recording state

- Same module position and dimensions as ready state.
- Surface changes to high-contrast recording state.
- Show pulsing recording dot, elapsed `mm:ss`, and `Recording` status.
- Primary full-width control becomes `Finish recording`, at least 64px high.
- A text action `Discard this recording` may appear only if it safely stops tracks and restores the prior answer.
- Respect `prefers-reduced-motion`; the status dot becomes static when motion is reduced.

### 9.6 Tonight: processing state

- Keep the question and capture area visible.
- Show `Preparing your answer…` with progress indicator.
- Do not imply that transcription is guaranteed.
- If audio completed but transcription is delayed, preserve the audio and use existing bounded recovery behavior.

### 9.7 Tonight: review state

Order inside the capture module:

1. Audio-ready row: check icon + `Voice recorded` + `Record again` text action.
2. Designed playback row with play/pause, elapsed/duration, and label `Recorded answer`.
3. `Review the transcript` textarea.
4. Short transcript-status message.
5. Primary full-width save button.

Save labels remain conditional and truthful:

- `Save voice and transcript`
- `Save voice answer`
- `Save transcript`

The recording, transcript, and prior answer remain available after any save error.

### 9.8 Tonight: saved state

Display a persistent success panel, not a temporary toast.

- Heading: `Saved to {nickname}'s memories.`
- Supporting text: `This answer is stored in this browser.`
- Primary action: `Play this memory`.
- Secondary action: `View memories`.
- Tertiary text: `A new question will be ready tomorrow.`

Playback must work without navigating away. A second save of the same completed state must not be possible.

### 9.9 Memories: empty state

- Heading: `{nickname}'s memories`.
- One calm empty illustration built from existing icons or simple CSS, not stock art.
- Copy: `The first answer starts with tonight's question.`
- CTA: `See tonight's question`.

### 9.10 Memories: populated state

- Heading and count summary: `{nickname}'s memories` and `{count} saved answers`.
- Group entries under sticky, non-interactive month/year headings.
- Each memory is one card containing:
  - Date.
  - Question.
  - Transcript quote when present.
  - Designed audio play/pause row when audio exists.
  - Accessible status text for playback.
- Do not introduce search, editing, per-memory deletion, sharing, likes, comments, streaks, or statistics.
- The transcript is content, not faint metadata; use at least 18px and comfortable line height.
- Memory cards must remain distinguishable without color.

### 9.11 Settings

Order sections by frequency and risk:

1. **Appearance** — System / Light / Dark segmented choice.
2. **Where memories live** — factual local-storage and browser-speech explanation with links.
3. **Export** — `Download a backup` with `.json` format explained before action.
4. **Danger zone** — delete everything.

Deletion keeps the existing two-step behavior. The confirmation names exactly what will be removed and gives `Cancel` higher visual prominence than destructive confirmation.

### 9.12 Privacy and terms

- Preserve current meaning and disclosures.
- Use a readable article width of 68 characters.
- Add an in-page contents list only if the article has at least four second-level headings.
- Place `Back to app` above and below the article.
- Do not hide limitations behind accordions.

## 10. Design system

### 10.1 Typography

Keep the bundled fonts; make no external font request.

| Role | Font | Mobile size / line height | Desktop size / line height |
|---|---|---:|---:|
| Marketing H1 | Newsreader 500 | 44–48 / 0.98 | 64–76 / 0.94 |
| Screen H1 | DM Sans 700 | 28 / 1.15 | 36 / 1.15 |
| Daily question | Newsreader 500 | 30–36 / 1.05 | 44–52 / 1.02 |
| Memory quote | Newsreader 500 | 20 / 1.35 | 22 / 1.35 |
| Body | DM Sans 400 | 16 / 1.55 | 16 / 1.55 |
| Functional support | DM Sans 400/500 | 14 / 1.45 | 14 / 1.45 |
| Button / navigation | DM Sans 700 | 15–16 / 1.1 | 15–16 / 1.1 |
| Decorative eyebrow only | DM Sans 700 | 12 / 1.2 | 12 / 1.2 |

Do not use 12px for instructions, dates that affect decisions, privacy disclosures, errors, or controls.

### 10.2 Color tokens

Use these starting tokens. The listed core text/background combinations were selected to exceed WCAG AA contrast thresholds; final rendered values must still be tested.[12]

```css
:root {
  color-scheme: light;
  --bg: #f7f3eb;
  --surface: #fffdf9;
  --surface-subtle: #eee7dc;
  --text: #211f1b;
  --text-muted: #655f57;
  --border: #d8d0c4;
  --primary: #b63a32;
  --primary-pressed: #8f2b26;
  --on-primary: #ffffff;
  --success: #2f6b50;
  --danger: #a12f2a;
  --focus: #6b5a8e;
}

[data-theme='dark'] {
  color-scheme: dark;
  --bg: #161512;
  --surface: #24211d;
  --surface-subtle: #302c27;
  --text: #f8f2e8;
  --text-muted: #c6bcaf;
  --border: #4a443d;
  --primary: #ff8a7a;
  --primary-pressed: #ffad9f;
  --on-primary: #161512;
  --success: #78c69b;
  --danger: #ff9b92;
  --focus: #c8b6ff;
}
```

Rules:

- Do not use opacity to make essential text appear muted.
- Do not use color as the only state signal.
- Do not place body text directly on `--primary` unless it uses `--on-primary` and passes contrast.
- Avoid pure black and pure white page backgrounds.
- The document's light pairs provide at least 5.70:1 for muted text and 5.77:1 for white on primary; dark text pairs exceed 7:1.

### 10.3 Spacing and geometry

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px.
- Page gutter: 16px below 480px; 24px at 480–767px; 32px at 768px and above.
- App content maximum width: 720px.
- Marketing content maximum width: 1160px.
- Control height: 48px minimum; 56px standard; 64px recording controls.
- Corner radius: 10px controls, 16px primary modules, 20px major marketing proof surface.
- Use at most one elevation shadow level: `0 12px 36px rgb(33 31 27 / 0.10)`.
- Avoid pill shapes except compact status tags and segmented controls.

### 10.4 Icons

- Use Phosphor icons.
- Standard control icons: 20–24px.
- Bottom-navigation icons: 22–24px.
- Decorative icons may not imply functionality.
- Every icon-only utility requires an accessible name and at least a 44×44px target.

### 10.5 Motion

- State transitions: 120–180ms ease-out.
- No parallax, scroll reveal, bouncing CTA, confetti, or looping waveform.
- Recording may use one restrained pulse.
- Under `prefers-reduced-motion: reduce`, remove all nonessential motion and keep state changes immediate.

## 11. Responsive behavior

### 320–379px

- Stack age bands.
- Use 16px page gutters.
- Keep primary controls full width.
- Marketing proof appears below copy.
- No horizontal scroll at 320px.

### 380–767px

- Use mobile bottom navigation.
- Keep Tonight's recording control above the fold at 390×844 for a typical two-line question.
- Account for `env(safe-area-inset-bottom)`.
- On-screen keyboard must not cover the focused transcript field or save action.

### 768–1023px

- Switch to compact desktop app header.
- Center content without placing it inside a fake device.
- Marketing hero may use two columns if both remain readable.

### 1024px and above

- Marketing uses two balanced columns.
- Product screens remain at 720px maximum content width.
- Do not stretch memory text across the viewport.

## 12. Accessibility requirements

WCAG 2.2 AA is the baseline. WCAG's minimum pointer target is 24×24 CSS pixels or sufficient spacing; this product intentionally sets a stricter 44×44 minimum and 56–64px for frequent actions because the usage context is one-handed and interrupted.[11]

- Normal text contrast: at least 4.5:1.
- Large text contrast: at least 3:1.[12]
- Keyboard focus is always visible and never obscured by fixed navigation.
- DOM order matches visual order.
- Bottom-nav links expose the active route with `aria-current="page"`.
- Recording, processing, save, and error statuses use appropriate `role="status"` or `role="alert"` without repeated announcements.
- Transcript help remains programmatically associated with its field.
- Radio/segmented controls remain native inputs with visible labels.
- Audio playback has accessible play/pause naming and does not autoplay.
- Zoom to 200% must not hide actions or require two-dimensional scrolling.
- Touch targets do not overlap and maintain at least 8px visual separation where practical.

## 13. Content design rules

### Voice

- Calm, specific, and factual.
- Address the adult, not the child.
- Use “parent or guardian” in legal/trust text; avoid assuming “mom.”
- Explain the immediate consequence of an action.
- Prefer `Saved in this browser` over vague claims such as `Safe and secure`.

### Avoid

- Guilt: `Don't miss another moment.`
- Perfection: `Be the parent you want to be.`
- False urgency: `Start before it's too late.`
- Preciousness clichés: `magical journey`, `little miracle`, `cherish forever`.
- Unsupported security: `fully private`, `encrypted`, `only you can access`.
- Ambiguous storage: `backed up`, `synced`, `saved forever`.

### Preferred examples

- `Two minutes is enough to keep one ordinary answer.`
- `Tap once to start. You'll review before anything is saved.`
- `Saved to this browser.`
- `Export a backup before clearing browser data.`
- `Your recording is still here. Try saving again.`

## 14. Implementation boundaries

### May change

- Component structure and class names.
- Visual design tokens and layout.
- Copy that does not alter legal meaning.
- Recorder presentation, elapsed timer, and audio-control presentation.
- Appearance setting stored locally.
- Tests and fixtures needed to verify the redesign.

### Must not change

- Route URLs.
- IndexedDB schema or export schema.
- Prompt-selection behavior.
- MediaRecorder and speech-recognition privacy behavior.
- Save, retry, replacement, teardown, export, or deletion semantics.
- Existing legal facts.
- No-network/no-account MVP architecture.

### Explicit non-goals

- Search or filtering.
- Per-memory edit/delete.
- Multiple child profiles.
- Cloud backup or sync.
- Sharing or collaboration.
- Push reminders.
- Streaks, stats, awards, or gamification.
- Generated prompts or AI advice.
- Payments, subscriptions, ads, or commerce.

## 15. Normative redesign requirements and Gherkin acceptance

### UX-01 — Behavioral preservation

The redesign must preserve every functional path and recovery invariant in `docs/PRD.md`.

```gherkin
Scenario: Existing behavior survives the redesign
  Given the redesign is implemented
  When the repository's unit, integration, and end-to-end suites run
  Then every pre-redesign test passes without weakened assertions
  And the IndexedDB and export schemas are unchanged
  And no network account, analytics, billing, or cloud dependency is added
```

### UX-02 — Truthful marketing proof

```gherkin
Scenario: Marketing demonstrates the real loop
  Given a first-time visitor opens "/"
  Then the primary promise and CTA are visible without scrolling at 390 by 844
  And the product proof labels the action "Record an answer"
  And the proof shows review and saved states
  And no proof implies hold-to-record, cloud backup, or unsupported privacy
```

### UX-03 — Explicit onboarding choices

```gherkin
Scenario: Parent completes setup deliberately
  Given no local profile exists
  When the parent opens "/app"
  Then no age band is preselected
  And nickname, age choices, privacy note, and CTA are visible in one screen at 390 by 844
  And each age choice has a minimum 44 by 44 target
  When the parent enters a nickname and selects an age band
  Then "Start our ritual" becomes enabled
```

### UX-04 — Stable mobile navigation

```gherkin
Scenario Outline: Mobile navigation preserves muscle memory
  Given a saved profile exists
  And the viewport is 390 by 844
  When the parent opens "<route>"
  Then the bottom navigation order is "Tonight, Memories, Settings"
  And each destination shows an icon and label
  And "<active>" is indicated without relying on color alone
  And no target is shorter than 56 pixels

  Examples:
    | route           | active   |
    | /app            | Tonight  |
    | /app/memories   | Memories |
    | /app/settings   | Settings |
```

### UX-05 — Ready-state priority

```gherkin
Scenario: Tonight exposes one primary action
  Given a profile exists
  And no answer is being captured
  When the parent opens "/app" at 390 by 844
  Then one daily question and one primary "Record an answer" control are visible
  And the control is at least 64 pixels high
  And a typical two-line question does not push the control below the fold
  And secondary disclosure does not compete with the primary action
```

### UX-06 — Recorder state clarity

```gherkin
Scenario Outline: Recorder state has one clear next action
  Given the recorder is in "<state>"
  Then the capture module remains in the same layout position
  And the visible primary action is "<action>"
  And the state is communicated by text and not color alone

  Examples:
    | state       | action                    |
    | idle        | Record an answer          |
    | requesting  | Waiting for microphone…   |
    | recording   | Finish recording          |
    | processing  | Preparing your answer…    |
    | review      | Save voice and transcript |
```

### UX-07 — Replacement and failure protection

```gherkin
Scenario: Failed replacement does not destroy the prior answer
  Given a completed voice answer and transcript are available
  When the parent starts a replacement recording
  And microphone permission fails or the replacement does not finish
  Then the previous voice and transcript remain available
  And the error states what happened and what remains safe

Scenario: Failed save keeps the draft
  Given a reviewed voice answer or transcript is ready
  When local persistence fails
  Then the audio and transcript remain on screen
  And an alert says "Your recording is still here"
  And a full-width retry action is available
```

### UX-08 — Durable saved confirmation

```gherkin
Scenario: Save produces immediate emotional payoff
  Given a reviewed answer is ready
  When the save succeeds
  Then a persistent confirmation names the child's memory collection
  And it says the answer is stored in this browser
  And "Play this memory" plays the saved audio without navigation
  And "View memories" opens "/app/memories"
  And the answer cannot be saved twice from the completed state
```

### UX-09 — Content-first memory timeline

```gherkin
Scenario: Parent revisits saved answers
  Given multiple memories from multiple months exist
  When the parent opens "/app/memories"
  Then entries are grouped under month and year headings
  And each entry shows date, question, and available transcript or audio
  And each audio row has a labeled play or pause action
  And no ad, upsell, statistic, like, comment, or sharing action appears
```

### UX-10 — Appearance and night use

```gherkin
Scenario Outline: Appearance follows the selected preference
  Given appearance is "<preference>"
  When the parent opens or changes routes in the app
  Then the resolved theme is "<theme>"
  And no light-background flash occurs during route changes
  And text and controls meet WCAG AA contrast

  Examples:
    | preference | theme                    |
    | Light      | light                    |
    | Dark       | dark                     |
    | System     | operating-system setting |
```

### UX-11 — Trust at decision points

```gherkin
Scenario Outline: Data consequence is explained before action
  Given the parent is about to "<action>"
  Then the interface shows "<disclosure>" before completion

  Examples:
    | action             | disclosure                                                   |
    | finish onboarding  | Saved memories stay in this browser                           |
    | record voice       | Browser speech processing may depend on device and browser    |
    | export             | The download is a portable JSON backup with embedded audio    |
    | delete everything  | Profile, transcripts, and recordings will be removed locally  |
```

### UX-12 — Accessibility and target size

```gherkin
Scenario: Core journey works without fine pointer control
  Given the parent uses keyboard input or coarse touch
  When they complete onboarding, record, review, save, play, export, and cancel deletion
  Then focus order follows visual order
  And focus remains visible above fixed navigation
  And every custom interactive target is at least 44 by 44 pixels
  And normal text contrast is at least 4.5 to 1
  And no essential state is conveyed by color alone
```

### UX-13 — Responsive containment

```gherkin
Scenario Outline: Core routes fit supported viewports
  Given the viewport is "<viewport>"
  When each public and app route is rendered
  Then no horizontal overflow exists
  And no text or control is clipped
  And fixed navigation does not cover the final actionable content
  And the layout uses the specified mobile or desktop navigation

  Examples:
    | viewport |
    | 320x568  |
    | 390x844  |
    | 430x932  |
    | 768x1024 |
    | 1440x900 |
```

### UX-14 — Calm content and motion

```gherkin
Scenario: Redesign avoids pressure and distraction
  Given the parent uses the product
  Then no interface copy uses guilt, urgency, perfection, or unsupported security claims
  And no ad, streak, badge, confetti, autoplay, or looping decorative motion appears
  When reduced motion is enabled
  Then nonessential animation is removed
```

### UX-15 — Verification evidence

```gherkin
Scenario: Redesign is ready for review
  Given implementation is complete
  When release verification runs
  Then "npm run check" passes
  And "npm run test:e2e" passes
  And screenshots exist for ready, recording, review, saved, memories, settings, and dark-theme states
  And screenshots cover 390x844 and 1440x900
  And the live production URL is not claimed updated until a verified deployment occurs
```

## 16. Requirement coverage matrix

| Requirement | Primary surface | Verification |
|---|---|---|
| UX-01 | All | Existing automated suite and schema diff |
| UX-02 | Marketing | Playwright text and screenshot assertions |
| UX-03 | Onboarding | Component tests plus 390×844 screenshot |
| UX-04 | App shell | Route-by-route mobile E2E |
| UX-05 | Tonight ready | Viewport and visibility assertion |
| UX-06 | Recorder | State-level component tests and screenshots |
| UX-07 | Recorder/save errors | Existing and expanded failure tests |
| UX-08 | Saved state | Save/play/navigation E2E |
| UX-09 | Memories | Seeded repository component test |
| UX-10 | Settings/all routes | Theme preference tests and dark screenshots |
| UX-11 | Onboarding/record/settings | Copy assertions |
| UX-12 | All | Keyboard journey, contrast audit, target inspection |
| UX-13 | All | Playwright viewport matrix |
| UX-14 | All | Copy review and reduced-motion test |
| UX-15 | Delivery | Commands, artifacts, and deployment evidence |

## 17. Current requirement gap analysis

| Requirement | Current status | Gap to close |
|---|---|---|
| UX-01 | Pass | Preserve; do not refactor data contracts casually |
| UX-02 | Partial | Marketing mock inaccurately says hold-to-answer and omits review state |
| UX-03 | Partial | Onboarding is one screen, but defaults age to 6–8 and uses small support text |
| UX-04 | Partial | Mobile nav is fixed and ordered correctly but lacks icons and stronger active semantics |
| UX-05 | Partial | One question and record action exist; oversized prompt may push action below fold |
| UX-06 | Partial | Recorder states exist but hierarchy, elapsed status, and stable geometry need redesign |
| UX-07 | Pass | Existing implementation preserves prior/draft data; presentation should make that protection obvious |
| UX-08 | Gap | Saved panel has no playback or direct Memories action |
| UX-09 | Partial | Chronology exists; grouping and designed playback do not |
| UX-10 | Gap | No appearance setting or dark theme |
| UX-11 | Pass | Current disclosures are truthful; reposition and simplify without weakening them |
| UX-12 | Partial | Semantic groundwork and focus styles exist; target, contrast, and fixed-nav audits remain |
| UX-13 | Partial | Mobile rules and one Pixel 7 journey exist; full viewport matrix is absent |
| UX-14 | Partial | Reduced motion exists; marketing contains avoidable pressure copy |
| UX-15 | Gap | No redesign-specific screenshot evidence or acceptance coverage exists |

## 18. AI implementation-agent handoff

The implementing agent must follow this order:

1. Read `docs/PRD.md`, `RELEASE_READINESS.md`, and this document completely.
2. Run the existing tests before editing and preserve the baseline output.
3. Inventory every current visual and recorder state.
4. Implement design tokens and theme resolution first.
5. Refactor the app shell and navigation without changing routes.
6. Redesign onboarding, Tonight states, Memories, Settings, legal pages, and marketing in that order.
7. Add or update tests with each state change; do not defer behavior verification until the end.
8. Capture the required light/dark and mobile/desktop screenshots.
9. Run `npm run check` and `npm run test:e2e`.
10. Compare every `UX-*` requirement to implementation and report Pass/Gap with direct evidence.
11. Do not claim production delivery without a verified deployment URL and post-deploy journey.

### Required output from the implementation agent

- Summary pairing every visual change with its user value or risk reduction.
- Files changed.
- Requirement-by-requirement pass/gap table.
- Test command outputs.
- Screenshot artifact paths.
- Any behavior, data, legal, privacy, or deployment item not verified.

## Sources

[1] https://apps.apple.com/us/app/familyalbum-share-baby-photos/id935672069 — Apple App Store — FamilyAlbum: Share Baby Photos

[2] https://apps.apple.com/us/app/baby-tracker-newborn-log/id779656557 — Apple App Store — Baby Tracker - Newborn Log

[3] https://apps.apple.com/us/app/huckleberry-baby-tracker/id1169136078 — Apple App Store — Huckleberry: Baby Tracker

[4] https://itunes.apple.com/lookup?id=935672069%2C779656557%2C1169136078&country=us&entity=software — Apple Search API — selected benchmark app lookup

[5] https://itunes.apple.com/us/rss/customerreviews/page=1/id=935672069/sortby=mostrecent/json — Apple customer reviews — FamilyAlbum, recent page 1

[6] https://itunes.apple.com/us/rss/customerreviews/page=5/id=935672069/sortby=mostrecent/json — Apple customer reviews — FamilyAlbum, recent page 5

[7] https://itunes.apple.com/us/rss/customerreviews/page=1/id=779656557/sortby=mostrecent/json — Apple customer reviews — Baby Tracker, recent page 1

[8] https://itunes.apple.com/us/rss/customerreviews/page=5/id=779656557/sortby=mostrecent/json — Apple customer reviews — Baby Tracker, recent page 5

[9] https://itunes.apple.com/us/rss/customerreviews/page=1/id=1169136078/sortby=mostrecent/json — Apple customer reviews — Huckleberry, recent page 1

[10] https://itunes.apple.com/us/rss/customerreviews/page=5/id=1169136078/sortby=mostrecent/json — Apple customer reviews — Huckleberry, recent page 5

[11] https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html — W3C WAI — Understanding SC 2.5.8 Target Size (Minimum)

[12] https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html — W3C WAI — Understanding SC 1.4.3 Contrast (Minimum)

[13] https://before-they-grow.vercel.app — Before They Grow — live production prototype
