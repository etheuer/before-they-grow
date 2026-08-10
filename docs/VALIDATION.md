# Validation Evidence Ledger

**Decision:** Proceed to a tested prototype; do not infer product-market fit or spend on scale.  
**Observed:** 2026-08-10  
**Method:** Public App Store metadata, direct App Store page inspection, current X content search, and source-playbook gates.

## 1. Problem hypothesis

Busy parents want better conversations with their children and want to preserve the child's exact words and voice, but full journaling is too demanding. A two-minute, one-question ritual may remove enough friction to become repeat behavior.

## 2. Evidence classes

- **Observed:** Directly retrieved from a cited public source.
- **Source heuristic:** A rule from the Ernesto Lopez playbook; useful for decisions but not proof.
- **Assumption:** A product-team belief requiring research.
- **Blocked:** Evidence sought but not independently verified.

## 3. Competitor evidence

The machine-readable snapshot is stored in `docs/evidence/app-store-competitors.json` and can be refreshed with `python scripts/collect_app_store_evidence.py`.

| Competitor | Observed evidence | What it validates | What it does not prove |
|---|---|---|---|
| [Qeepsake](https://apps.apple.com/us/app/qeepsake-family-photo-album/id1332312787) | 4.88656 average rating across 14,633 US ratings; age-informed question prompts; family memory album positioning | Parents use prompts to preserve family memories | Voice-first ritual demand, current revenue, or our retention |
| [Tinybeans](https://apps.apple.com/us/app/tinybeans-private-family-album/id521633042) | 4.86069 average rating across 104,224 US ratings; private family journal positioned around low mental load | Large established demand for private, low-friction family memory capture | Willingness to switch or pay for a narrow voice product |
| [Family Conversations](https://apps.apple.com/us/app/family-conversations/id6759932067) | 4.9 average rating across 10 US ratings; one nightly question, age ranges, follow-ups, quote journal, reminders, and sharing | The exact family-conversation behavior has a recent App Store entrant | Scale; 10 ratings are early evidence |

### Direct pricing observation

The Family Conversations App Store page showed these in-app purchases on 2026-08-10:

- Monthly: `$4.99`
- Yearly: `$29.99`
- Lifetime access: `$49.99`

**Classification:** Observed competitor pricing, not validated pricing for Before They Grow.

### Review language observed on Family Conversations

- A reviewer reported that the questions got a 16-year-old talking and extended dinner.
- Another reviewer valued both conversation and documenting meaningful or funny answers.
- Another reported improved family dynamics.

**Caution:** Only 10 ratings existed; these comments show problem language, not representative outcomes.

## 4. Active content evidence

Current X posts demonstrate that “better questions than how was school?” is an active, distributable parenting format:

- [“5 Questions to Ask Your Kids Tonight”](https://x.com/alphaman_111/status/2049056778370085348), approximately 260 likes when retrieved.
- [Dinner conversation starters](https://x.com/cboyack/status/2039065450869563777), approximately 150 likes when retrieved.
- [Alternatives to “How was school?”](https://x.com/AiWithRubab/status/2081720081562902667), approximately 93 likes when retrieved.
- [Bedtime as a moment for children to open up](https://x.com/luinalaska/status/2070500184438763536), approximately 3,300 likes when retrieved.
- [Keeping a bedtime tuck-in ritual with teens](https://x.com/FoundationDads/status/2022069507666407801), approximately 449 likes when retrieved.

**Observed pattern:** Lists of concrete questions, “ask this instead,” and bedtime connection stories receive engagement.  
**Product implication:** Every in-app prompt can produce a privacy-safe social asset without exposing a child's answer.  
**Caution:** Engagement is not acquisition, activation, retention, or revenue.

## 5. Pain evidence

| Claim | Classification | Evidence or test |
|---|---|---|
| Generic daily questions produce closed answers | Observed in active creator messaging and competitor reviews | Test interview language and first-session completion |
| Parents feel memory-capture mental load | Observed in Tinybeans positioning | Ask interview participants what they currently abandon |
| Voice has higher emotional value than typed quotes | Assumption | Show text-only and voice-playback prototypes, record preference |
| Two minutes is low enough friction for repeat use | Assumption | Measure first save time and seven-day repetition |
| Local-first storage increases trust | Assumption | Test comprehension and willingness to use without an account |
| Local-only storage may create fear of loss | Assumption and known technical risk | Ask explicitly; measure export use; test demand for encrypted sync |

## 6. Revenue gate

The Ernesto Lopez source heuristic recommends finding a few competitors above `$10k/month`. That threshold was **not independently verified** for this niche. App Store ratings and in-app pricing show usage and monetization attempts, not revenue.

**Decision:** Revenue evidence is insufficient for paid development scale. It is sufficient only for a bounded prototype and ten target-parent interviews.

## 7. Differentiation matrix

| Capability | Before They Grow | Qeepsake | Tinybeans | Family Conversations |
|---|---:|---:|---:|---:|
| One age-aware question tonight | Yes | Prompt-based | Not primary | Yes |
| Child voice recording | Core | Not observed as core | Video/photo broader | Not observed in listing |
| Typed answer | Yes | Yes | Yes | Quote journal |
| Local-first, no account | Yes | No | No | Listing says no data collected; implementation not audited |
| Full export including audio | Yes | Export terms not evaluated | Export terms not evaluated | Export not observed in listing |
| Broad family photo feed | No | Yes | Yes | No |
| Two-minute ritual positioning | Yes | No | No | One-question ritual, but dinner-focused |

Before They Grow must remain visually and behaviorally original. Competitor research informs problem structure, not protected copy, assets, screenshots, code, or trade dress.

## 8. MVP evidence gate

### Pass

- Multiple direct competitors validate private family-memory capture.
- A current close competitor validates one-question family conversations and paid pricing.
- Public parenting content validates question-based acquisition formats.
- The product has a narrow original angle: child's voice plus local-first export.
- A functional MVP can be evaluated without backend or billing risk.

### Fail or blocked

- Competitor revenue above `$10k/month`: blocked.
- Ten parent interviews: not run.
- Seven-day repeat behavior: not measured.
- Real iPhone Safari recording test: not run.
- Willingness to pay: not measured.
- Paid acquisition CPA: not measured.

## 9. Research script for ten parent tests

1. “Tell me about the last thing your child said that you wish you had saved.”
2. “How do you save quotes, stories, photos, or voice now?”
3. “What makes that habit break down?”
4. Show the landing page without explanation. Ask: “What do you think this does?”
5. Ask the parent to set up and save one answer without help.
6. Ask: “Where do you believe this recording is stored?”
7. Show the timeline. Ask whether voice changes the value compared with text.
8. Show export and local-only limitations. Ask what creates or reduces trust.
9. Ask which future capability would be worth paying for, without naming a price.
10. Price-test `$4.99/month`, `$29.99/year`, and `$49.99 lifetime` in randomized order; record behavior, not politeness.

## 10. Decision rule

Proceed to a public beta only when at least 6 of 10 parents complete the first save without help, at least 4 save three answers in seven days, and no participant misunderstands local-only storage. Reposition or stop if fewer than 3 save a second answer or if voice is consistently less valuable than photo-first capture.
