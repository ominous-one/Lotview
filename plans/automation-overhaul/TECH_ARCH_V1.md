# LotView Automation Overhaul — TECH ARCH (v1)

> **Project:** `C:\Users\omino\projects\lotview`
> 
> **Master plan:** `plans/automation-overhaul/MASTER_PLAN_V1.md`

---

## Deliverables index

| Deliverable | Path | Status |
|---|---|---|
| Tech architecture v1 (this document) | `plans/automation-overhaul/TECH_ARCH_V1.md` | ✅ Delivered |

---

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope:** systems overview, data flows, storage, contracts, rate limits/caching, and approval gates.
- **Out of scope:** production code.
- **Assumptions:** Next.js app + Node backend + Postgres; MV3 extension exists; ZenRows available.
- **Inputs needed:** vendor selection affects connector details but not the baseline architecture.

### 1) Deliverables checklist
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\TECH_ARCH_V1.md`

### 2) Acceptance criteria
- Includes:
  - components diagram (text),
  - data model (tables/entities),
  - primary flows for (a) competitive report, (b) appraisal comps, (c) craigslist assist,
  - caching and rate limiting policies,
  - tenancy/RBAC notes,
  - approval gates.

### 3) Validation steps
- Re-open file; verify all required sections exist.

### 4) Gap report + auto-fill
- See end.

### 5) External side effects policy
- None.

---

## 1) Systems / components

### 1.1 Components
- **Web app (Next.js)**
  - Sales Manager dashboard (competitive report)
  - Appraisal/comps UI
- **Backend API (Node)**
  - Inventory access (existing)
  - Competitive report generator (scheduled)
  - VIN decode router
  - Comps retrieval + scoring
  - Posting audit log endpoint
- **Worker / scheduler**
  - Runs every 48h per dealer to generate competitive report snapshots
- **PostgreSQL**
  - Source of truth for dealership/users/inventory
  - Stores report snapshots, VIN decode cache, normalized comps (optional)
- **Chrome extension (MV3)**
  - Assisted autopost: Craigslist driver + content script stepper
- **External vendors**
  - Comps/listings API (primary)
  - VIN decode enrichment API (paid escalation)
  - ZenRows (fallback scraping fetcher)

---

## 2) Core data flows

### 2.1 Competitive report flow (every 48 hours)
1) Worker selects active dealerships.
2) For each dealership:
   - Load inventory units.
   - For each unit:
     - Compute VehicleSpecNormalized (VIN decode router + internal data).
     - Query comps using **API-first** vendor connector.
     - If vendor fails/coverage missing: use ZenRows-based fallback scraping (public sources), subject to policy caps.
     - Normalize comps to CompListing.
     - Compute unit metrics: comp median/p25/p75, position, confidence.
3) Persist immutable **snapshot**:
   - report parameters (radiusKm, sources), generatedAt, dealerId.
   - per-unit metrics and comp references.
4) Web app reads latest snapshot and renders dashboard.

### 2.2 Appraisal/comps interactive flow
1) User enters VIN or selects a unit.
2) Backend runs VIN decode router:
   - baseline decode always (free)
   - paid enrichment only if needed
3) User selects radius + trim mode (Exact/Near-trim).
4) Backend queries comps and returns:
   - comps list
   - scoring + adjustments
   - explainability payload

### 2.3 Craigslist assisted autopost flow (extension)
1) User initiates assist-mode from extension UI.
2) Extension requests a PostingJob payload from backend (or builds from cached unit data).
3) Background script opens/targets Craigslist tab.
4) Content script:
   - detects current step
   - fills available fields
   - uploads images
   - navigates between steps **only as needed**
   - stops before publish (review step)
5) Extension logs attempt/outcome to backend.

---

## 3) Storage / data model (logical)

### 3.1 Entities / tables
- `vin_decode_cache`
  - `vin` (PK)
  - `baseline_payload` (JSON)
  - `enriched_payload` (JSON, nullable)
  - `baseline_source` (e.g., `nhtsa_vpic`)
  - `enriched_source` (e.g., `marketcheck_neovin`, `dataone`, `chromedata`)
  - `trim_confidence` (enum: low/med/high)
  - `options_confidence` (enum)
  - `updated_at`, `expires_at`

- `competitive_report_snapshot`
  - `report_id` (PK)
  - `dealer_id`
  - `generated_at`
  - `radius_km` (int)
  - `sources` (JSON array)
  - `summary` (JSON)
  - `payload` (JSONB or normalized child tables)

- `competitive_report_unit`
  - `report_id` (FK)
  - `vehicle_id`
  - `your_price`, `your_mileage`, `your_days_on_lot`
  - `comp_count`, `comp_median_price`, `comp_p25_price`, `comp_p75_price`
  - `delta_to_median`, `position` (under/at/over), `confidence`

- `comp_listing` (optional: store normalized comps)
  - `comp_id` (PK)
  - `source` (enum)
  - `source_listing_id` (string)
  - `url`
  - required fields: price, dom/proxy, mileage, trim, condition, accident_history, ext_color, int_color
  - `location_lat`, `location_lng`, `distance_km`
  - `vehicle_spec_normalized` (JSON)
  - `provenance` (JSON: parse time, fetch method api/scrape)

- `posting_audit_log`
  - `id` (PK)
  - `dealer_id`, `user_id`, `vehicle_id`
  - `platform` (`craigslist`)
  - `mode` (`assist`)
  - `started_at`, `finished_at`
  - `step_reached`, `success`, `error_code`, `error_message`

---

## 4) Contracts (payload shapes)

### 4.1 PostingJob (normalized)
Key fields:
- vehicle identifiers (dealerId, vehicleId, VIN)
- listing fields (title, price, mileage, description, location)
- images (urls + order)
- audit (userId, initiatedAt)

### 4.2 VehicleSpecNormalized
Key fields:
- year/make/model/trim with confidence
- drivetrain/body/engine/transmission
- options list with confidence and source
- decode_sources[]

### 4.3 CompListing (normalized)
Must support required report fields:
- price
- days_on_lot (or proxy + source)
- mileage
- trim (+ confidence)
- condition
- accident_history (+ source; `unknown` allowed)
- exterior_color
- interior_color

---

## 5) Rate limiting, caching, and cost control

### 5.1 General rules
- All external fetches go through a single fetch layer that supports:
  - per-domain token bucket rate limits
  - exponential backoff with jitter
  - circuit breaker on repeated 403/429/block pages

### 5.2 Caching TTLs (defaults)
- VIN baseline decode: cache 180d.
- VIN enriched decode: cache 90–180d.
- Comps query results: cache 24–48h (matches report cadence).
- Scraped pages: raw cache 6–24h; parsed listings 1–7d.

### 5.3 ZenRows fallback escalation ladder
- Try: plain HTTP (no ZenRows)
- Fallback: ZenRows basic (no JS)
- Escalate: premium proxies
- Escalate: JS+premium only when needed
- Always enforce monthly caps per tenant and globally.

---

## 6) Tenancy, RBAC, and privacy
- All snapshots and caches must be partitioned by `dealer_id`.
- Sales Manager dashboard endpoints require Sales Manager or GM role.
- Never store third-party credentials (Craigslist) in LotView.
- Avoid logging PII in extension logs; audit log stores identifiers and error codes only.

---

## 7) Approval gates (external side effects)
- Craigslist dealer account creation: user creates OR explicitly approves us.
- Paid APIs: explicit approval before keys are used.
- Scraping scale-up: explicit approval + ToS review.

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items
- None for this architecture document.

### Why missing
- N/A

### Auto-fill action
- N/A
