# LotView 10-Dealership Launch Plan

## Objective
Make LotView launch-ready for the first 10 dealerships by treating **scraping fidelity as gate one** and only then hardening:
1. AI Facebook posting
2. AI Craigslist posting
3. AI message handling, including CARFAX questions

This plan is execution-ready: every category defines what **100/100** means, the workstreams to get there, proof gates, blockers, and sequencing.

---

## Launch rule: no downstream automation ships ahead of scraping

**Why:** Every posting and messaging failure compounds if the source vehicle record is wrong. A bad scrape creates wrong prices, missing images, incorrect trim, fake availability, bad CARFAX answers, and account trust damage on Facebook/Craigslist.

**Hard gate:**
- No dealership enters posting automation unless its scrape score is at least **95/100 for 7 consecutive days**
- No messaging automation answers buyer questions unless the supporting fields for that dealership are proven complete enough to answer them safely
- The first 10 dealerships are launched in waves only after scrape fidelity passes per-dealer proof gates

---

## Current implementation signals found in repo

These are not assumptions; they are concrete signals from the current codebase search and should shape the order of work:

- Facebook Marketplace automation exists in some form:
  - `attached_assets/background_1769633341040.js`
  - `attached_assets/content-facebook_1768927423782.ts`
  - `.openclaw/tmp-server_routes.ts` contains Facebook Marketplace automation and listing copy generation references
- Craigslist automation is not implemented to the same level yet:
  - `attached_assets/background_1769633341040.js` currently throws `Craigslist driver coming soon`
- CARFAX data is already present in parts of the system:
  - `.openclaw/tmp-server_routes.ts` contains `carfaxUrl`, `carfaxBadges`, and batch CARFAX update references
- Scraping/image enrichment already appears to be business-critical and partially hardened:
  - `.openclaw/tmp-server_scheduler.ts` mentions full VDP extraction
  - `.openclaw/tmp-server_routes.ts` includes image fallback and fuel fallback logic

Implication: the launch plan should **stabilize ingestion first**, then convert the existing Facebook base into a measurable posting system, then build Craigslist, then harden AI messaging on top of trusted data.

---

# Category scorecards

## 1) Scraping fidelity — 100/100 definition

### What 100/100 means
For each of the first 10 dealerships, LotView can ingest and keep inventory current with production-grade reliability.

A dealership is **100/100** only if all of the below are true for 14 consecutive days:

#### Coverage
- 100% of active retail vehicles on the dealer website are present in LotView within SLA
- 0 stale sold/removed units remain active longer than SLA
- New units appear within **15 minutes** of source-site availability for polling-based feeds, or the lowest safe feasible interval if source restrictions force slower refresh

#### Core field accuracy
Across a daily audited sample and weekly full reconciliation:
- VIN accuracy: **100%**
- Price accuracy: **99.8%+**
- Year/make/model accuracy: **100%**
- Trim accuracy: **99%+**
- Mileage accuracy: **99.5%+**
- Stock number accuracy: **99.5%+**
- Body type / drivetrain / fuel / transmission accuracy: **98%+**
- Vehicle condition (new/used/CPO) accuracy: **99%+**

#### Media fidelity
- At least **95%** of active units have the correct primary photo
- At least **98%** of image sets have no foreign/non-vehicle images mixed in
- At least **95%** of units have at least the dealership-site image count or a documented source limitation
- Image order is preserved where platform relevance depends on the cover photo

#### Description and feature extraction
- Trim/features/options extraction is accurate enough that downstream ads do not invent options
- Description text contains no template corruption, HTML junk, or concatenation failures
- Safety rule: uncertain features are omitted instead of hallucinated

#### CARFAX readiness
- If a CARFAX URL/report badge exists on source, it is captured and normalized correctly
- If absent, system records `unknown` rather than implying clean history
- CARFAX-supporting fields used in AI replies are present, versioned, and attributable to source

#### Freshness and resilience
- 99% of scrape jobs finish successfully per dealership per day
- Automatic retries recover transient failures
- Layout drift, blocked pages, and image-host failures are surfaced within monitoring SLA
- Every scrape run emits structured diff results: added, removed, changed, suspicious

### Scoring breakdown
- Coverage/completeness: 25
- Core field accuracy: 25
- Media fidelity: 20
- Freshness/SLA: 15
- CARFAX + key enrichment integrity: 10
- Monitoring/reconciliation + operator visibility: 5

### Workstreams
#### S1. Dealer-source inventory contract
For each of first 10 dealerships, create a source contract:
- source URLs / feed types / pagination behavior
- inventory states to ingest vs exclude
- expected field mapping by source
- image host behavior
- CARFAX source behavior
- anti-bot/rate-limit constraints

#### S2. Canonical vehicle schema hardening
Normalize every source into one canonical record:
- required: VIN, stock number, year, make, model, trim, mileage, price, condition, image array, source URL, dealership ID, first seen, last seen
- optional but tracked: drivetrain, fuel, transmission, engine, body style, exterior/interior color, CARFAX URL, CARFAX badges
- explicit nullability rules so AI layers know what is unknown vs missing vs inferred

#### S3. Scraper adapter hardening by dealership
Per dealer adapter:
- resilient selectors
- pagination completeness checks
- VDP fallback when SRP is incomplete
- image-host normalization
- sold vehicle removal detection
- retry and backoff policies

#### S4. Reconciliation engine
Build automated comparison between source truth and LotView:
- missing VINs
- extra stale VINs
- field deltas above threshold
- image count deltas
- suspicious price jumps
- CARFAX presence delta

#### S5. Gold-set QA harness
For each dealership, maintain a gold set of representative vehicles:
- cheap / premium / truck / EV / hybrid / CPO / no-CARFAX / many-images / weird trim cases
- re-run against every scraper change
- snapshot expected parsed output

#### S6. Operational observability
Per dealership dashboards/logs:
- scrape success rate
- active vehicle count trend
- field completeness trend
- image completeness trend
- reconciliation failures
- time since last successful refresh

### Proof gates
A dealership passes scraping launch gate only when all are true:
- 7 consecutive days with **95+/100** scrape score
- zero critical VIN/price mismatches in the most recent 72 hours
- full reconciliation report reviewed for that dealership
- gold-set test pass rate **100%**
- image contamination rate below **2%**
- stale listing cleanup within SLA

### Blockers
- Dealer site anti-bot protections or dynamic rendering preventing reliable extraction
- Missing authoritative source for sold/removed state
- CARFAX links hidden behind session/JS flows that are not scrapeable yet
- Weak canonical schema causing field ambiguity downstream

### Smallest unblock actions
- Switch dealership to feed/API ingestion where available
- Add headless browser extraction only for dealerships that truly require it
- Reduce scope per dealer to proven fields and mark others unknown
- Add manual exception queue for CARFAX/report enrichment until automated capture is stable

---

## 2) AI Facebook posting — 100/100 definition

### What 100/100 means
For launch dealerships that have passed scraping gate, LotView can produce and publish Facebook Marketplace listings with repeatable quality, account safety, and operator trust.

A dealership is **100/100** on Facebook posting only if all below are true for 14 consecutive days:

#### Posting correctness
- 100% of posted listings use the correct VIN-linked vehicle record
- 100% of title, price, mileage, year, make, model, and image package reflect current source-of-truth data at post time
- No listing posts a sold vehicle
- No listing posts duplicate active inventory unless explicitly allowed by policy

#### Content quality
- AI-generated titles/descriptions stay within dealership tone and compliance rules
- No hallucinated options, warranties, accident history, financing promises, or certification claims
- Required disclaimers and contact instructions appear when configured
- Copy is unique enough to avoid spam patterns while staying fact-bound

#### Platform execution reliability
- 95%+ successful publish completion once a post job is started with a valid session and approved account
- Structured detection of failed publish vs draft vs success
- Screenshot or URL proof captured per completed post
- Retry path exists for recoverable UI drift / network issues

#### Rate limits and trust
- Per-account pacing respected
- Daily post caps enforced
- Repost/edit/delete behavior governed to avoid Marketplace trust damage
- Human approval queue exists for risky edge cases

#### Operations
- Every Facebook post job is auditable: source vehicle version, prompt version, assets used, posted URL, failure reason, operator

### Scoring breakdown
- Data correctness from source record: 35
- Publish success rate: 25
- Content quality/compliance: 20
- Anti-duplicate/rate-limit safety: 10
- Proof/auditability: 10

### Workstreams
#### F1. Posting eligibility rules
Only allow vehicles to enter Facebook queue if:
- scrape gate passed
- mandatory fields complete
- minimum image count met
- no sold/stale flags
- dealership-specific Facebook policy passes

#### F2. Vehicle-to-form mapping contract
Map canonical vehicle fields to Facebook Marketplace form fields:
- title
- price
- condition
- category
- mileage
- description
- images
- location

Define fallback rules and explicit stop conditions where Facebook-required fields are missing.

#### F3. AI copy generation guardrails
Prompt and post-process rules:
- grounded only on canonical fields
- never infer accidents, CARFAX cleanliness, financing, warranty, or certification unless backed by fields
- banned phrase list
- dealership tone presets
- max length / formatting normalization

#### F4. Publish driver hardening
Using the current Facebook automation base already present in repo, harden:
- field fill reliability
- image upload success detection
- final publish confirmation capture
- failure taxonomy for UI changes, auth/session, blocked actions, category mismatch

#### F5. Post-state ledger
Track per vehicle:
- never posted / queued / in progress / posted / failed / stale / removed
- listing URL
- post timestamp
- source version hash
- account used
- screenshots and error logs

#### F6. Human-in-the-loop controls
For first 10 dealerships:
- first N posts per dealership require approval
- automatic posting only after dealership-specific false-positive rate is low enough
- manual pause/kill switch

### Proof gates
A dealership passes Facebook posting gate only when:
- scraping gate already passed
- 50 consecutive eligible post attempts across launch dealerships complete with **95%+** success
- 0 critical factual hallucinations in audited sample of 100 listings
- 0 sold vehicles posted in trailing 14 days
- proof artifact exists per post: URL or screenshot + source version + prompt version
- duplicate-post rate below **1%**

### Blockers
- Facebook UI drift or anti-automation defenses
- Session/account trust issues
- Missing mapping for some vehicle classes
- Incomplete image packages from scrape layer

### Smallest unblock actions
- fall back to assisted draft mode instead of one-click publish
- expand approval queue for problematic vehicle types
- pin supported vehicle categories first
- freeze auto-posting for dealerships with unstable sessions

---

## 3) AI Craigslist posting — 100/100 definition

### What 100/100 means
LotView can publish Craigslist listings for approved dealerships with accurate data, compliant copy, and operational reliability comparable to the Facebook lane.

A dealership is **100/100** on Craigslist only if all below are true for 14 consecutive days:

#### Posting correctness
- 100% of posts reflect the current canonical inventory record
- No sold/stale units are posted
- Required Craigslist fields, geography, category, and contact routing are correct

#### Content quality and compliance
- Title/body grounded strictly in source data
- No prohibited claims or fabricated feature assertions
- dealership-configured disclaimer/footer is present
- image selection/order is optimized but source-grounded

#### Platform execution reliability
- 90%+ successful publish completion once a valid session/posting flow begins
- each post captures publish proof: URL, confirmation page screenshot, or durable posting ID
- failed step reason is classified

#### Anti-spam safety
- posting cadence and geo/account policies enforced
- duplicate and repost controls exist
- ghosting/removal trends are measured and surfaced

#### Operations
- each Craigslist listing is traceable to source record version, template version, operator/account, and proof artifact

### Scoring breakdown
- Data correctness: 35
- Publish reliability: 20
- Anti-spam/ghosting controls: 20
- Content compliance: 15
- Auditability: 10

### Workstreams
#### C1. Build the Craigslist driver
Current evidence shows this lane is not yet built to parity. Implement:
- navigation flow
- field mapping
- image upload flow
- publish confirmation detection
- failure taxonomy

#### C2. Craigslist-specific content templates
Because Craigslist formatting and moderation differ from Facebook:
- shorter title patterns
- cleaner plain-text bodies
- explicit contact/location handling
- dealership disclaimers

#### C3. Posting policy engine
Per dealership/account:
- cadence limits
- geography rules
- allowed categories
- repost timing
- duplicate suppression

#### C4. Ghosting and removal monitor
Track:
- posted vs still-live
- removal timing
- ghosting signals
- relist eligibility

#### C5. Assisted launch mode
Craigslist should start in assisted mode for the first 10 dealerships:
- generate preview + autofill
- operator approves before publish
- graduate to more automation only after reliability is proven

### Proof gates
A dealership passes Craigslist gate only when:
- scraping gate already passed
- Craigslist driver completes **30 consecutive** assisted publishing runs with **90%+** technical success
- audited factual error rate is **0 critical / under 2% minor**
- duplicate/ghosted/removal incidents are within predefined acceptable range for 14 days
- every successful post has durable proof saved

### Blockers
- Craigslist driver is currently not implemented to launch grade
- anti-spam and posting volatility may differ by geography/account
- media upload and session behavior may be brittle

### Smallest unblock actions
- launch with assisted draft mode only
- restrict to a narrower subset of categories/markets first
- use manual publish confirmation until proof artifacts are reliable

---

## 4) AI message handling including CARFAX questions — 100/100 definition

### What 100/100 means
LotView can respond to incoming lead messages with accurate, dealership-safe, source-grounded answers, escalating when uncertainty or policy risk is present.

A dealership is **100/100** only if all below are true for 14 consecutive days:

#### Grounded response quality
- 100% of factual statements are grounded in canonical vehicle data, dealership policy, approved scripts, or conversation context
- system never invents CARFAX status, accident history, financing approval, availability, hold status, warranty, or certification
- if confidence is insufficient, response asks a clarifying question or escalates to human

#### Response usefulness
- answers common buyer intents correctly: availability, price, mileage, trim/features, financing next steps, trade-in, test drive, address, hours, and CARFAX/report availability
- response includes a clear next step appropriate to funnel stage
- tone matches dealership configuration

#### CARFAX handling
For CARFAX/history questions specifically:
- if `carfaxUrl` or approved history-report data exists, response can share or reference it accurately
- if only badges exist, response describes only the supported facts from those badges
- if no verified history data exists, response says it will confirm with the dealership instead of implying clean history
- no answer overstates accident/service/ownership facts beyond verified data

#### SLA and ops
- first response SLA under configured threshold
- conversation states tracked: awaiting buyer, awaiting human, appointment attempt, info sent, do-not-contact, closed
- all AI responses logged with grounding payload and escalation reason if any

#### Safety
- unsafe or high-risk intents automatically escalate: legal threats, harassment, financing promises, accident-history disputes, price negotiation beyond policy, requests for personal seller info, compliance-sensitive issues

### Scoring breakdown
- Factual grounding: 35
- CARFAX/history handling: 20
- Conversion usefulness: 20
- Escalation correctness: 15
- Logging/SLA/ops: 10

### Workstreams
#### M1. Intent taxonomy
Define intents and response trees:
- availability
- price
- schedule test drive
- financing
- trade-in
- feature question
- location/hours
- CARFAX/history
- still available follow-up
- aggressive / risky / compliance-sensitive

#### M2. Grounding payload builder
For each response, construct a bounded context package:
- canonical vehicle fields
- dealership policy
- approved message snippets
- CARFAX/report fields
- lead metadata
- recent conversation history

#### M3. Policy and escalation layer
Before sending AI response:
- factual confidence check
- restricted claim check
- CARFAX/history safety check
- negotiation authority check
- human escalation triggers

#### M4. CARFAX answer contract
Create explicit response rules:
- `verified_report_link_present`
- `badge_only`
- `history_unknown`
- `vehicle_unmatched`
- `buyer_asks_accident_specific_question`

Each state maps to allowed claims, forbidden claims, and escalation rules.

#### M5. Message QA dataset
Assemble a 200+ conversation eval set spanning:
- clean availability requests
- stale listing risk
- wrong-vehicle references
- history/CARFAX questions
- pricing objections
- financing edge cases
- angry buyers
- appointment conversion asks

#### M6. Human override and inbox tooling
- approve/edit/send mode for launch
- visible explanation of why AI escalated
- quick-send templates for CARFAX and history-related handoff

### Proof gates
A dealership passes AI messaging gate only when:
- scraping gate already passed
- response factual accuracy on evaluation set is **98%+** with **0 forbidden claims**
- CARFAX/history subset has **100% safe-answer rate**
- high-risk escalation recall is **100%** on test set
- live audited conversations show first-response SLA within target for 14 days
- every sent AI message has stored grounding payload and model/prompt version

### Blockers
- Missing structured inbox/event integration
- Incomplete canonical fields causing unsafe answer gaps
- No explicit dealership policy for negotiation/promises/disclaimers
- CARFAX data may be partial or inconsistently sourced across dealerships

### Smallest unblock actions
- keep launch in AI-draft or approve-before-send mode
- restrict AI to narrow intents until grounding is complete
- default CARFAX/history answers to safe handoff when verified data is absent

---

# Sequencing and execution order

## Phase 0 — Launch controls and measurement foundation
Build before feature hardening:
- canonical scorecards
- per-dealership launch dashboard
- audit sampling process
- proof artifact storage
- fail/hold controls per dealership and per channel

**Exit condition:** the team can measure readiness instead of arguing about it.

## Phase 1 — Scraping fidelity (business-critical gate one)
Do this before scaling any posting or messaging lane.

### Sequence
1. Define source contract for each of 10 dealerships
2. Harden canonical schema and nullability rules
3. Build/repair dealership adapters
4. Add reconciliation engine
5. Build gold-set test harness
6. Add operational monitoring and alerts
7. Run 7-day proof window

**Exit condition:** each pilot dealership reaches scrape gate; only then is it admitted to Facebook posting.

## Phase 2 — Facebook posting on top of scrape-passed dealerships
### Sequence
1. Define posting eligibility rules
2. Harden AI copy guardrails
3. Harden publish driver
4. Add post-state ledger and proof capture
5. Run assisted mode first
6. Graduate dealerships to automatic posting one by one

**Exit condition:** repeated publish success with no critical factual errors and no sold-vehicle posts.

## Phase 3 — Craigslist posting after Facebook proves the canonical pipeline
### Sequence
1. Implement Craigslist driver
2. Start assisted preview/publish mode
3. Add ghosting/removal monitoring
4. Run controlled market/account rollout

**Exit condition:** Craigslist can produce proof-backed posts without causing spam/quality issues.

## Phase 4 — AI message handling after source truth + channel truth are stable
### Sequence
1. Build intent taxonomy and grounding payload
2. Implement policy/escalation layer
3. Implement CARFAX answer contract
4. Run offline eval set
5. Launch approve-before-send
6. Graduate low-risk intents to auto-send only when proven

**Exit condition:** zero forbidden claims, perfect safe handling of CARFAX/history questions, strong conversion usefulness.

---

# Recommended rollout model for first 10 dealerships

## Wave plan
- **Wave 1:** 2 dealerships
  - use to stabilize scraping and scoring
- **Wave 2:** +3 dealerships
  - expand only if Wave 1 passes scrape and Facebook assisted posting gates
- **Wave 3:** +5 dealerships
  - only after operational dashboards and exception handling are routine

## Graduation rules per dealership
A dealership cannot advance to the next lane unless the prior lane passed:
- Scraping pass -> Facebook eligible
- Facebook pass -> Craigslist eligible
- Scraping + policy + inbox grounding pass -> Messaging eligible

This prevents one weak dealer integration from poisoning the full launch.

---

# Cross-cutting proof package required for every category

For each dealership and lane, persist:
- source contract
- gold-set cases
- scorecard output
- exception log
- screenshots/URLs where relevant
- prompt/template versions where AI is involved
- audit samples with pass/fail notes

Minimum fresh evidence for launch review:
- scrape reconciliation reports
- post proof artifacts
- message eval results including CARFAX subset
- dealership-by-dealership readiness sheet

---

# Delivery checklist by role

## Engineer
- canonical schema + adapters + reconciliation + channel drivers + policy checks
- artifactized scoring and proof output

## QA tester
- adversarial checks for wrong price, stale sold vehicle, bad images, trim mismatch, CARFAX overclaim, duplicate posting, unsafe message send

## Reviewer
- reject if any category claims readiness without measurable evidence or if downstream lanes are ahead of scrape truth

---

# Concrete blockers that should be assumed now

## Blocker A — Craigslist is not launch-ready
Evidence suggests Craigslist driver is still placeholder-level.

**Impact:** Craigslist should not be sold internally as production-ready for the first 10 dealerships.

**Bounded response:** ship assisted draft/publish mode first, then harden.

## Blocker B — Scraping quality may vary heavily by dealership source stack
Different dealer sites likely have different HTML, JS, image hosts, and sold-state behavior.

**Impact:** readiness must be per dealership, not one global yes/no.

**Bounded response:** use per-dealer scorecards and wave rollout.

## Blocker C — CARFAX/history answers are high-risk unless source attribution is explicit
Having `carfaxUrl` or badges in some places is not enough unless every AI reply knows what is verified.

**Impact:** AI messaging must treat CARFAX/history as a separately governed policy surface.

**Bounded response:** default to safe handoff unless verified report data is present.

---

# The practical 100/100 summary

## Scraping fidelity = 100/100
- All live vehicles present
- bad/stale vehicles removed quickly
- core fields almost perfectly accurate
- images correct and complete
- CARFAX/history data accurately captured or explicitly unknown
- monitored and reconciled continuously

## AI Facebook posting = 100/100
- only scrape-passed vehicles post
- copy is grounded and compliant
- publish succeeds reliably
- proof exists per post
- account/rate-limit safety is enforced

## AI Craigslist posting = 100/100
- Craigslist driver works reliably
- posts are accurate and compliant
- ghosting/duplicate risk is controlled
- proof exists per post
- launch starts assisted, not blind full-auto

## AI message handling = 100/100
- every factual claim is grounded
- CARFAX/history answers are safe and verified
- risky cases escalate automatically
- useful conversion-oriented next steps are included
- logs/proof exist for every AI send

---

# Execution priority order

1. **Scraping fidelity scorecards and per-dealer source contracts**
2. **Canonical schema + reconciliation + gold-set harness**
3. **Scrape hardening for first 2 dealerships**
4. **Facebook assisted posting on scrape-passed dealerships**
5. **Craigslist assisted driver buildout**
6. **Messaging grounding + CARFAX-safe policy layer**
7. **Wave expansion from 2 -> 5 -> 10 dealerships**

If anything conflicts with this order, the plan should still prefer source-truth hardening first.
