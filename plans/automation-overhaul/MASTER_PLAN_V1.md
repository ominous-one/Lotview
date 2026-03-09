# LotView Automation Overhaul — MASTER PLAN (v1)

> **Project:** `C:\Users\omino\projects\lotview`
> 
> **Applies to:** Chrome Extension (Craigslist assisted autopost), Sales Manager competitive report (Canada-only), Appraisal/comps engine + VIN/options (cheap hybrid).

---

## Deliverables index (this plan)

| Deliverable | Path |
|---|---|
| Master plan (this document) | `plans/automation-overhaul/MASTER_PLAN_V1.md` |
| Deliverable matrix v1 | `plans/automation-overhaul/DELIVERABLE_MATRIX_V1.md` |
| Spawn plan v1 | `plans/automation-overhaul/SPAWN_PLAN_V1.md` |
| Technical architecture v1 | `plans/automation-overhaul/TECH_ARCH_V1.md` |
| Migration + rollout plan | `plans/automation-overhaul/MIGRATION_ROLLOUT_PLAN.md` |
| Open questions + blockers (minimal) | `plans/automation-overhaul/OPEN_QUESTIONS_BLOCKERS.md` |

---

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope**
  - **Craigslist assisted autopost** in the existing MV3 Chrome extension: pre-fill and upload images, stop at review step, user clicks final publish.
  - **Competitive pricing report** for Sales Managers: in-app dashboard report generated every 2 days, Canada-only, radius selectable.
  - **Appraisal/comps engine** upgrades: Canada-only, radius selectable, exact trim matching default with near-trim option; mileage tolerance setting removed/ignored.
  - **VIN/options strategy:** cheap hybrid: free baseline decode + paid enrichment only where required.
  - API-first sourcing with **ZenRows fallback** for scraping where needed (ZenRows already exists in project).
- **Out of scope**
  - Signing contracts, purchasing APIs, scraping at scale against external sites, or posting live listings.
  - Creating third-party accounts without explicit user approval.
  - Final UI polish; this plan focuses on shippable system behavior and acceptance tests.
- **Assumptions**
  - LotView has (or can add) a backend scheduler/worker to run every 48 hours.
  - PostgreSQL is available and can store snapshots and normalized listing data.
  - Inventory units have dealership location (lat/lng or address that can be geocoded once).
- **Inputs needed (only truly blocking)**
  - **Craigslist account provisioning decision:** user will create dealer account(s) OR explicitly approve us to do it (external side effect).
  - **Competitive report vendor decision:** choose API-first vendor(s) for Canada coverage (MarketCheck vs CBB vs other).

### 1) Deliverables checklist
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\MASTER_PLAN_V1.md`
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\DELIVERABLE_MATRIX_V1.md`
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\SPAWN_PLAN_V1.md`
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\TECH_ARCH_V1.md`
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\MIGRATION_ROLLOUT_PLAN.md`
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\OPEN_QUESTIONS_BLOCKERS.md`

### 2) Acceptance criteria
- All deliverables exist at the exact paths above.
- Plan explicitly encodes the user-confirmed constraints:
  - Craigslist: **assisted autopost** only (prefill + human confirm submit).
  - Competitive pricing: **API-first + ZenRows fallback**.
  - VIN/options: **cheap hybrid**; exact trim required; near-trim option available.
  - Sales manager: web app; **in-app dashboard report**.
  - Competitive report fields include: **price, days on lot, mileage, trim, condition, accident history, exterior/interior color**.
  - Appraisal/comps: radius selectable; mileage tolerance disregarded; exact trim default with near-trim option; **Canada-only**.
  - Regions: **Tri-Cities BC, Surrey BC, Whistler area**.
  - Scraping allowed for public sources with rate limits + ToS risk notes.
- Contains explicit approval gates for external side effects (Craigslist accounts, paid vendors, scraping scale-up).
- Contains objective validation steps per workstream (extension, report generator, comps engine).

### 3) Validation steps
- Open each file listed in the checklist and confirm:
  - constraints are present verbatim,
  - acceptance criteria + validation steps are concrete,
  - approval gates are explicit.

### 4) Gap report + auto-fill
- See “Gap Report” at end of this document.

### 5) External side effects policy
- No logins, purchases, posting, or scraping at scale will be executed from this plan without explicit user approval.

---

## 1) Executive summary (what we’re shipping)

### 1.1 Craigslist posting: assisted autopost (Chrome extension)
- A salesperson selects a unit in LotView → clicks **“Post to Craigslist (Assist)”**.
- Extension opens Craigslist posting flow, fills fields + uploads photos, **stops at the preview/review step**.
- **User must click Publish**.
- Every attempt is logged to LotView (dealer/user/time/unit/outcome) for audit.

### 1.2 Sales Manager competitive report: every 2 days, in-app
- A backend job runs every 48h per dealership.
- Produces a snapshot report visible in a Sales Manager dashboard.
- Report includes the required comp fields (see §4.3), with “unknown/not available” explicitly shown when a source cannot supply a field.

### 1.3 Appraisal/comps: Canada-only, radius selectable, exact trim default
- Sales Manager can appraise a trade-in or unit and pull comps.
- Controls:
  - Radius: selectable (default 100km; also 250/500/1000/national).
  - Trim match: **Exact (default)**, toggle **Near-trim**.
  - Mileage tolerance: **not exposed** (disregarded); mileage is handled by scoring/adjustments, not by hard filtering.
- VIN decode uses a **cheap hybrid router**: free baseline always; paid enrichment only when needed.

---

## 2) Hard constraints (must not drift)

1) Craigslist: **assisted autopost** (prefill + human confirm submit).
2) Competitive pricing: **API-first + ZenRows fallback**.
3) VIN/options: **cheap hybrid** with **trim exactness required**; allow near-trim option.
4) Sales manager: web app; **in-app dashboard report**.
5) Competitive report fields must include: **price, days on lot, mileage, trim, condition, accident history, exterior/interior color**.
6) Appraisal/comps: radius selectable; mileage tolerance disregarded; exact trim default; near-trim option; **Canada-only**.
7) Regions at launch: **Tri-Cities BC, Surrey BC, Whistler area**.
8) Scraping public sources is approved, but we must implement rate limits and ToS risk notes.
9) ZenRows is already in project; design assumes it is available for fallback fetches.

---

## 3) Compliance + risk posture (explicit)

### 3.1 Craigslist ToS risk (non-negotiable warning)
Craigslist Terms of Use restrict using/providing software other than general-purpose web browsers to interact with Craigslist for posting/uploading/account actions (unless separately licensed).
- Terms: https://www.craigslist.org/about/terms.of.use/en

**Plan posture:**
- Ship **Assisted Autopost** only.
- No unattended batch posting.
- Add a **fallback mode**: “Export/Copy post package + open Craigslist posting page” so dealers can still post manually if automation gets blocked.
- Add a **compliance decision record** (internal doc) and a feature flag/kill switch.

### 3.2 Scraping ToS risk (competitive sources)
- We will prefer **licensed APIs**.
- Scraping is allowed for public sources, but we will:
  - rate limit per domain,
  - cache aggressively,
  - include circuit breakers and block-page detection,
  - keep a vendor/API path as primary to reduce ToS exposure.

---

## 4) Workstreams and specs

## 4A) Craigslist assisted autopost (Chrome extension)

### 4A.1 UX behavior (salesperson)
- Button: **Post to Craigslist (Assist)**.
- User selects posting area (if not already resolved):
  - **Tri-Cities BC**
  - **Surrey BC**
  - **Whistler area**
- Extension fills:
  - title, price, mileage, VIN (if used), location/area, description, contact, images.
- Extension stops at review step with a big callout: **“Review and click Publish on Craigslist.”**

### 4A.2 Area mapping requirement (launch)
We must maintain an **Area Mapping Table** for the Craigslist posting flow:
- Domain (likely `vancouver.craigslist.org`)
- Subarea label/value as seen in the posting form
- Mapping from dealer location → default area
- Fallback behavior: prompt the user to pick

### 4A.3 Technical approach (MV3)
- Background service worker orchestrates tab + messages.
- Content script detects step and fills fields.
- Image upload uses existing Debugger-based upload fallback.

### 4A.4 Logging + auditing
- Record posting intent and outcome:
  - dealerId, userId, vehicleId, platform=craigslist, startedAt, finishedAt, stepReached, errors
- Never store Craigslist credentials.

### 4A.5 QA gates
- Must never click final publish.
- Must handle:
  - logged out/login step
  - phone verification/captcha → stop and instruct user
  - posting limit pages → stop and instruct user
- Regression suite using recorded DOM fixtures for key steps.

---

## 4B) Competitive report (Sales Manager dashboard)

### 4B.1 Cadence + scope
- Every 48 hours per dealer.
- **Canada-only** comps.
- Radii supported: default **100km**, selectable **250/500/1000/national**.

### 4B.2 Source strategy (required)
- **API-first** for comps and/or listings.
- **ZenRows fallback** for public scraping when API is missing or coverage is poor.
- Cache results to control cost.

### 4B.3 Required output fields (per comp listing)
Competitive report must include these fields for comps:
- **price**
- **days on lot** (or best-available proxy; see below)
- **mileage**
- **trim** (exact when possible; otherwise confidence)
- **condition** (explicit if available; else derived heuristics)
- **accident history** (see notes)
- **exterior color**
- **interior color**

Field availability notes:
- Many marketplaces do not expose accident history; this may require:
  - a licensed vehicle history product (e.g., CARFAX-like) OR
  - listing-level “accident reported” flags if vendor provides it.
- If the chosen API cannot provide accident history, we must output **`unknown`** (not blank), and treat “accident history source” as a separate enrichment track.

### 4B.4 Days on lot definition
- For **our inventory**: days-on-lot = today - inStockDate.
- For **comps**: prefer vendor DOM if provided; otherwise proxy:
  - daysSinceFirstSeen (if listing history available)
  - daysSincePublished (if page indicates posted date)
  - else `unknown`

### 4B.5 Manager dashboard UX
- Latest snapshot summary (count of units under/at/over market).
- Table: each unit shows your price, comp median/p25/p75, delta, confidence, suggested move.
- Drilldown: comp list with required fields, source, and “why it matched.”

### 4B.6 QA gates
- Idempotent snapshot: same inputs same reportId.
- Unit tests for km radii.
- Vendor outage behavior: keep last-known-good snapshot; mark stale.

---

## 4C) Appraisal/comps engine + VIN/options (cheap hybrid)

### 4C.1 VIN decode router (cheap hybrid)
**Always run baseline decode (free):**
- NHTSA vPIC: https://vpic.nhtsa.dot.gov/api/

**Paid enrichment only when required:**
- Trigger conditions (examples):
  - trim cannot be resolved confidently,
  - options/packages required to distinguish trims,
  - comp matching confidence falls below threshold.

**Candidate enrichment providers (to decide in implementation):**
- MarketCheck basic + NeoVIN upgrade (transparent pricing; validate Canada build fidelity)
- DataOne or ChromeData (enterprise; quote-only; best for exact options)

### 4C.2 Trim handling: exact default + near-trim option
- Default: exact trim match required.
- Near-trim toggle relaxes matching:
  - same model line, similar drivetrain/body/engine
  - trim confidence threshold lowered
- UI must clearly label near-trim comps as **near-trim**.

### 4C.3 Mileage tolerance disregarded
- No mileage tolerance slider/field.
- Mileage differences are handled as a continuous adjustment in scoring.

### 4C.4 Canada-only enforcement
- Exclude comps outside Canada by default.
- “National” means all Canada.

### 4C.5 QA gates
- Golden VIN set with expected trim outcomes.
- Deterministic scoring tests.
- Explainability payload required: why a comp matched.

---

## 5) Work breakdown (phased)

### Phase 0 — Decisions + approvals (fast)
- Pick comps data vendor (API-first).
- Decide Craigslist account provisioning approach (user-created vs explicit approval to create).

### Phase 1 — Foundations (shared)
- Data schemas + DB tables for:
  - competitive report snapshot
  - comps listings (normalized)
  - VIN decode cache
  - posting audit logs
- Rate limiting + caching framework.

### Phase 2 — Competitive report MVP (API-first)
- Implement report generator worker.
- Implement Sales Manager dashboard.
- Store snapshots + CSV export.

### Phase 3 — Appraisal/comps v1
- Implement VIN decode router.
- Implement comps retrieval + scoring.
- UI controls: radius + trim match mode.

### Phase 4 — Craigslist assisted autopost
- Implement Craigslist driver + content script.
- Area mapping table + tests.
- Add fallback export mode.

### Phase 5 — Harden + rollout
- Observability dashboards, cost guardrails, kill switches.
- Staged rollout per dealer.

---

## 6) Approval gates (explicit)

### 6.1 External side effect: Craigslist dealer account creation (REQUIRED GATE)
Creating Craigslist accounts is an external side effect.

**We will not create accounts unless the user explicitly approves it.**

Two acceptable paths:
1) **User creates the Craigslist dealer account(s)** (recommended)
2) User explicitly authorizes us to do it (not recommended; requires credentials handling plan)

#### Step-by-step: user creates a Craigslist dealer account (BC)
1) Open: https://www.craigslist.org/about/sites (choose Canada → BC → Vancouver)
2) Go to: `vancouver.craigslist.org` → click **my account**
3) Click **sign up for an account**
4) Use a dealership-controlled email inbox (shared sales ops)
5) Complete email verification
6) Add phone verification if prompted (use dealership phone)
7) Log in and confirm you can start a new post in the correct category (cars+trucks by dealer)
8) Document:
   - account email used
   - which subareas you post to (Tri-Cities/Surrey/Whistler)
   - any posting limits or verification steps encountered

**After the user confirms the account exists**, we proceed to extension assist-mode.

### 6.2 External side effect: paid APIs
- No paid vendor onboarding or key usage without explicit approval.

### 6.3 External side effect: scraping scale-up
- If we move beyond minimal testing (or add new sources), require explicit approval and legal review of ToS.

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items (relative to this plan’s DoD)
- None (all required v1 plan files are produced by this task; see deliverables checklist).

### Why missing
- N/A

### Auto-fill action
- N/A
