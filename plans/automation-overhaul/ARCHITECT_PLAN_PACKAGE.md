# LotView Automation Overhaul — Architect Plan Package (v0)

## 0) Scope + assumptions
### In scope
1. **Chrome extension: add Craigslist posting** alongside existing Facebook posting.
2. **Sales manager competitive report**: generate and deliver an updated report every 2 days for current inventory.
3. **Vehicle appraisal comps engine**: improve VIN decoding and comparable-vehicle retrieval/scoring, integrate into UX.
4. Planning deliverables: work breakdown, deliverable matrix, spawn plan, approval points, and critique package for Researcher.

### Out of scope (for this plan package)
- Building/merging production code.
- Creating third-party accounts, paying for APIs, or running scrapers against external sites.
- Final UI pixel polish.

### Assumptions
- LotView has a backend capable of scheduled tasks (node process/worker, cron, or platform scheduler).
- LotView is multi-tenant and RBAC is (or will be) enforced; this work must preserve dealer data isolation.
- Craigslist + competitor sites may change frequently; automation must tolerate partial failure.

### Inputs needed (only truly blocking)
- **Target Craigslist workflow** (blocking for exact automation):
  - Which region(s) / domains (e.g., `vancouver.craigslist.org`) are required at launch?
  - Which category is used for vehicles (cars+trucks by dealer?) and whether “dealer” posting account is used.
- **Competitive report target market definition** (blocking for report correctness):
  - Default radius (e.g., 25/50/100 miles) and whether cross-border markets are included.
  - Primary competitor sources to prioritize (AutoTrader, Cars.com, CarGurus, dealer sites, etc.).
- **VIN decoder constraints** (blocking for vendor choice):
  - Budget range per VIN decode / per month.
  - Required decode fidelity: do we need *exact* trim/options/packages, or “good-enough” (year/make/model/engine/drive/body)?

> Everything else can proceed with safe defaults and a clear approval gate.

---

## 1) Current state summary (extension)
See: `plans/automation-overhaul/CURRENT_STATE_EXTENSION_NOTES.md`.

Key takeaways:
- MV3 extension has a **driver abstraction** with stubs for `craigslist`.
- Only `facebook` driver is implemented.
- Background service worker already supports **cookie retrieval**, **image blob fetch**, and **Debugger-based file upload**.

---

## 2) Target architecture (proposed)

### 2.1 Posting platforms: unify around a “Posting Job” contract
Define a platform-agnostic job:
- `vehicleId`
- `platform` (`facebook` | `craigslist`)
- `formData` (normalized fields: title, price, mileage, VIN, location, description, contact)
- `images` (resolved URLs + optional pre-fetched blobs)
- `templateId` / AI settings
- `consent + audit` fields (user-initiated, timestamp, dealership/user)

The extension already builds a similar job for Facebook; we formalize it and reuse.

### 2.2 Craigslist automation mode: “Assisted Autopost” (recommended)
Because Craigslist ToS/anti-bot measures and multi-step posting flows create reliability and compliance risk, the default mode should be:
- **User-initiated** (explicit click in extension UI)
- Extension:
  1) Navigates to the appropriate Craigslist “post” step (or detects it)
  2) Fills fields + attaches images
  3) Stops at review step
- **User must click Publish**.

Optional later mode (behind feature flag): semi-automated multi-step navigation with robust detection and fallback.

### 2.3 Craigslist driver implementation outline
Implementation components:
1) **Manifest updates**
   - Add host permissions for `https://*.craigslist.org/*`.
   - Add content script for relevant posting URLs.

2) **Background driver** (`craigslistDriver.fillForm(job)`)
   - Find or create a tab on `*.craigslist.org`.
   - Confirm user is logged in (detect login page).
   - Ensure content script injected.
   - Send `LV_FILL_CRAIGSLIST` message.

3) **Content script** (`content-craigslist.ts` → `content-craigslist.js`)
   - Step detection:
     - account/login
     - location selection
     - category selection
     - listing details
     - image upload
     - preview/publish
   - For each step, fill only what’s present and return “next action required”.
   - Use resilient selectors: prefer `name=` inputs, `aria-label`, and stable IDs.

4) **Image upload strategy**
   - First attempt: direct `input[type=file]` with `DataTransfer` (if allowed).
   - Fallback: reuse existing `DEBUGGER_UPLOAD_IMAGES` to set file inputs.
   - Always cap and compress images if needed (Craigslist has limits); enforce a maximum count.

5) **Compliance + safety gates**
   - Show a “manual review required” screen before publish.
   - Record posting intent and outcome (success/failed) to backend via existing `LOG_POSTING`.
   - Provide a kill-switch + quick selector update pipeline.

### 2.4 Competitive report (every 2 days)
Goal: Sales manager sees a **pricing position** for each unit: under/at/over market within radius, with suggested adjustment.

Proposed architecture:
- **Backend scheduled job** (every 48 hours per dealership):
  1) Pull current inventory (LotView DB)
  2) For each unit, retrieve market comps (see data sources below)
  3) Compute metrics: median, p25/p75, count, days-on-market proxy if available
  4) Store a report snapshot (immutable) + per-unit competitive metrics
- **UI**: Sales manager dashboard shows latest report and per-unit drilldown.
- **Delivery**: in-app + downloadable CSV/PDF; optional email later (requires approval).

Data sources (tiered):
- Tier A (preferred, lower fragility): paid market data APIs (MarketCheck, DataOne, etc.)
- Tier B: partner feeds / affiliate APIs
- Tier C (fallback): targeted scraping of top marketplaces and competitor dealer sites (high ToS risk; behind approval gate)

### 2.5 Vehicle appraisal comps engine + VIN decode
Design goals:
- VIN decode accuracy better than “vAuto-level” by combining sources and normalization.
- Comps retrieval is transparent: why a comp matched, what adjustments applied.

Pipeline:
1) **VIN decode** (multi-source):
   - Primary: commercial decoder with trim/options (requires vendor decision)
   - Secondary: NHTSA vPIC (free) for base fields
   - Normalize into `VehicleSpecNormalized` (make/model/trim/body/engine/transmission/drive/fuel/doors)

2) **Market listing ingestion** (comps candidates):
   - Prefer API feeds.
   - Else controlled scraping with rate limiting and legal review.

3) **Normalization & dedupe**
   - Normalize prices, mileage, location, seller type.
   - Dedupe by VIN (if present) and fuzzy match (year/make/model/trim + dealer + photos).

4) **Scoring & adjustments**
   - Similarity score: year delta, mileage delta, trim match confidence, drivetrain, body style.
   - Distance penalty, seller-type weighting, listing freshness weighting.
   - Output recommended price band + confidence.

5) **UX integration**
   - Appraisal screen: VIN input → decode preview → comps list with “why matched” badges.
   - Controls for radius, condition, mileage band, exclude outliers.

---

## 3) QA gates (non-negotiable)
- Extension:
  - Selector resiliency tests: fixtures for each posting step.
  - “Manual review required” enforced for Craigslist publish.
  - Logging: every attempt results in a backend posting log.
- Reports:
  - Report generation idempotent; reruns do not duplicate.
  - Snapshotting: report stored with timestamp + parameters.
- Comps engine:
  - VIN decode fallback path (NHTSA) always works.
  - Scoring produces deterministic outputs given same inputs.

---

## 4) External side effects + approvals
See `plans/automation-overhaul/APPROVAL_POINTS.md`.

---

## 5) Researcher critique handoff
### What to critique
1) Craigslist automation approach: assisted vs. full automation, and best practices for MV3 reliability.
2) Competitive report data sources: which APIs are most viable (coverage/cost) and minimal-scrape fallback.
3) VIN decoding: best decoder vendors and recommended multi-source strategy.

### Questions for Researcher
- What is the most reliable Craigslist posting automation pattern that still respects ToS and user control?
- What market pricing APIs are best for US/Canada dealer inventory comps at LotView scale (100 dealers)?
- Which VIN decode vendors provide the best trim/options fidelity and pricing?
- What QA gates are missing (captcha handling, anti-bot detection, audit logging requirements)?

### Artifacts to review
- `plans/automation-overhaul/CURRENT_STATE_EXTENSION_NOTES.md`
- `plans/automation-overhaul/DELIVERABLE_MATRIX.md`

---

## 6) Deliverables checklist (this plan package)
- [x] `plans/automation-overhaul/ARCHITECT_PLAN_PACKAGE.md`
- [x] `plans/automation-overhaul/CURRENT_STATE_EXTENSION_NOTES.md`
- [x] `plans/automation-overhaul/WORK_BREAKDOWN.md`
- [x] `plans/automation-overhaul/DELIVERABLE_MATRIX.md`
- [x] `plans/automation-overhaul/SPAWN_PLAN.md`
- [x] `plans/automation-overhaul/APPROVAL_POINTS.md`
- [x] `plans/automation-overhaul/GAP_REPORT.md`
