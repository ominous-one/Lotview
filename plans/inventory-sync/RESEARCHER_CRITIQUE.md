# RESEARCHER CRITIQUE — Inventory Sync Plan (Olympic Hyundai Vancouver)

**Project:** `C:\Users\omino\projects\lotview`  
**Inputs reviewed:**
- `plans/inventory-sync/MASTER_PLAN_INVENTORY_SYNC.md`
- `plans/inventory-sync/INVENTORY_SYNC_SPEC.md`
- `plans/inventory-sync/SCRAPING_LOGIC_ALIGNMENT.md`

## 0) Summary (what’s strong vs. what’s missing)
### What’s strong
- Correctly centers **`runRobustScrape()`** as the canonical ingest path and avoids duplicating scraper stacks.
- Calls out the important existing safety rules (Cloudflare detection, `missedScrapeCount`, minimum scrape thresholds, rate limiting).
- Explicitly requires **image hygiene** (blocked patterns, URL normalization, “same folder” validation), which is critical to avoid cross-VDP photo contamination.

### Highest-impact gaps (must address)
1) **Dedupe key mismatch with business reality:** spec leans on `dealerVdpUrl` → VIN. For Olympic (and many dealers), **VIN can be missing initially** and VDP URLs can change. You need a deterministic **VIN + stock** strategy and an explicit policy for when VIN is absent.
2) **Photo enrichment definition is under-specified:** “<10 photos” is good, but needs a **state machine** that accounts for:
   - vehicles appearing with **0 photos**, then later gaining photos
   - vehicles that will **never** have 10 photos (cap retries)
   - preventing “thrash” (downloading the same images daily)
3) **Rate-limit / provider-cost control not explicit enough:** there’s a risk of exploding paid requests (ZenRows/ScrapingBee) during enrichment. Need hard caps + caching keyed by VDP + content fingerprint.
4) **Failure handling / notifications need clearer semantics:** “3 consecutive days” is reasonable, but needs explicit reset rules, escalation tiers, and domain-level circuit breakers.
5) **Autopost priority queue integration is missing:** inventory sync/enrichment must publish deterministic signals so autopost uses **used-first then new**, and avoids posting partially-enriched vehicles.


---

## 1) OlympicHyundaiVancouver as source (site-specific risks + best alternatives)
### 1.1 Risks observed/typical for dealer sites
Even without re-scraping the site during this critique, Olympic-style dealership stacks commonly exhibit:
- Listing pages that show **stock number** reliably, but VIN may be:
  - absent on SRP (listing)
  - present only on VDP
  - sometimes loaded via JS after initial HTML
- VDP URL patterns that can include **query params** / tracking / sorting tokens.
- Photo galleries that:
  - load from a JS JSON endpoint
  - lazy-load, so initial HTML shows placeholders
  - change order, causing naive diffing to redownload

### 1.2 Best alternative extraction approach (to minimize requests)
**Preferred strategy:**
1) SRP inventory discovery extracts **stock + VDP URL** (and any VIN if present).
2) Enrichment fetches VDP **only for candidates** (needs photos/price/fields), capped.
3) Where possible, identify and call the **gallery JSON endpoint** directly (if the robust scraper already does this, ensure enrichment reuses that helper). This is typically cheaper/faster than full browser rendering.

**Why:** Paid-provider + browser rendering should be reserved for the hardest pages; many galleries are data endpoints once discovered.


---

## 2) Dedupe key: VIN + stock (what to change)
### 2.1 Current plan
- Primary identity: normalized `dealerVdpUrl + dealershipId`
- Secondary: `VIN + dealershipId`

### 2.2 Problems for Olympic and multi-day runs
- **VDP URL is not stable enough** to be the primary identity.
- **VIN can be missing at first ingest**, creating “PENDING-VIN” duplicates across reruns.
- When VIN becomes available later, you need a deterministic merge that doesn’t create a *second* vehicle.

### 2.3 Recommendation: explicit identity ladder + merge policy
Define identity candidates in priority order:
1) **VIN + stock + dealershipId** (strongest)
2) **VIN + dealershipId**
3) **stock + dealershipId**
4) **normalized canonical VDP URL + dealershipId** (fallback)

Implementation notes:
- Add a **normalizedStock** column (or compute normalization consistently): trim, uppercase, remove whitespace/hyphen differences.
- Canonicalize VDP URL aggressively: strip tracking params (`utm_*`, `fbclid`, etc.), sort/strip known noise.
- When a record ingests as `stock-only`, and later a VIN appears, treat it as a **merge/update** (same vehicle) rather than insert.
- Enforce a **unique constraint** at the DB level if feasible:
  - `(dealershipId, vin)` unique when `vin IS NOT NULL`
  - `(dealershipId, normalizedStock)` unique when `normalizedStock IS NOT NULL`
  - If partial indexes aren’t supported in your DB setup, enforce in application logic and create an audit event when duplicates are detected.

**Operational rule:** if both VIN and stock disagree with an existing record, write an anomaly log (possible data error / vehicle swap).


---

## 3) Photo enrichment until >= 10 photos (state machine + anti-thrash)
### 3.1 Current plan
- Candidate query: `images.length < 10`
- Attempt VDP fetch and extract photos; retry; notify on repeated failures.

### 3.2 Missing: “vehicles appear without photos initially” handling
You need explicit treatment for:
- **0-photo vehicles** that will gain photos within hours/days
- vehicles that **never** have 10 photos
- gallery endpoints that appear only after JS runs

### 3.3 Recommendation: enrichment state machine
Add deterministic states and transitions; example:
- `NEEDS_PHOTOS` (photoCount < 10)
- `PENDING_SOURCE` (photoCount == 0 and age < X hours) — *retry sooner but cheaply*
- `SATISFIED` (photoCount >= 10)
- `NO_MORE_AVAILABLE` (after N attempts, delta==0 repeatedly)
- `BLOCKED` (Cloudflare / provider block)

Rules:
- **Stop condition:** once `photoCount >= 10`, stop photo enrichment.
- **Delta condition:** if an attempt yields **0 new unique photos** for `K` consecutive attempts, set `NO_MORE_AVAILABLE` and stop daily attempts (but re-check weekly).
- **0-photo fast recheck:** for newly-ingested vehicles with 0 photos, do a *lightweight recheck* (e.g., 2–4 hours later) but cap total requests.

### 3.4 Recommendation: store a photo fingerprint to avoid redownload
To prevent daily re-downloading of the same assets and to detect real changes:
- Keep `lastPhotoSetHash` (hash of sorted normalized CDN URLs or of the cached/local URLs)
- Keep `lastPhotoSuccessfulAt`
- On enrichment, compare hash; if unchanged, treat as `skipped` and don’t upload again.

### 3.5 Ensure “>=10” is based on *unique* images
Explicitly dedupe by:
- normalized URL
- and/or image content hash if you already compute it in caching pipeline (best, but expensive)


---

## 4) Rate limits, caching, and ZenRows usage (cost + safety controls)
### 4.1 Current plan
- Mentions 5s delay and 2–3 concurrency.
- Uses provider chain (ZenRows → ScrapingBee → Puppeteer → Browserless → …).

### 4.2 Missing controls (recommended)
**A) Domain-level circuit breaker**
- If `isCloudflareBlockPage` occurs `M` times in a run for the same domain, stop enrichment for that dealership/domain and mark run `partial`.

**B) Hard budgets per run (cost control)**
Set explicit caps per dealership per day:
- max VDP fetches for enrichment: e.g., `MAX_ENRICH_VDPS=50`
- max paid-provider requests: e.g., `MAX_ZENROWS_REQUESTS=20` (rest uses cheaper fallbacks or defer)
- once exceeded, log a summary and defer remaining vehicles.

**C) Cache VDP fetch results**
For enrichment, cache by (dealershipId, canonicalVdpUrl) with TTL (e.g., 6–24h) and store:
- extracted image URLs
- extracted price
- a `contentHash` of the HTML/JSON
So if multiple stages need the same VDP data in a single run, you don’t refetch.

**D) Respect “not mixing local+external” rule**
Plan mentions it, but add an explicit invariant:
- `vehicles.images` must be **all-local cached URLs** once any upload succeeds.
- Keep original CDN URLs in a separate column/table if needed (`vehicle_image_sources`).


---

## 5) Failure handling + notifications (make it operationally useful)
### 5.1 Current plan
- Increment fail count; after 3 consecutive failures, notify sales managers.

### 5.2 Recommendations
**A) Define “failure” precisely**
Separate failure reasons:
- `FETCH_FAILED` (network/provider)
- `BLOCKED` (Cloudflare)
- `PARSE_FAILED` (selector changes)
- `NO_NEW_PHOTOS` (gallery valid but insufficient)

Only some should page humans.

**B) Reset policy**
- On any **successful photo increase**, reset consecutive fail count to 0.
- On “no new photos” where count is stable but <10, do not reset; instead move toward `NO_MORE_AVAILABLE`.

**C) Escalation tiers**
- Tier 1 (ops log only): first 1–2 failures.
- Tier 2 (manager notification): 3 consecutive `FETCH_FAILED`/`BLOCKED`.
- Tier 3 (engineering alert / ops escalation): N vehicles failing with the same parse error in one run (suggests site changed).

**D) Run-level summary notifications**
Add a dealership-run summary:
- candidates processed
- successes
- blocked
- deferred due to budget
- vehicles newly reaching >=10 photos
This is what ops actually needs to know.


---

## 6) Autopost priority queue integration (used-first then new)
### 6.1 What’s missing
The plan/spec documents inventory sync in isolation, but autopost needs deterministic inputs:
- whether a vehicle is eligible to post
- ordering (used first)
- “use existing first then new” semantics

### 6.2 Recommendation: explicit “autopost readiness” signals
Inventory sync/enrichment should set or compute:
- `autopostEligible` boolean (or computed)
- `autopostBlockReason` (e.g., `NEEDS_PHOTOS`, `MISSING_PRICE`, `DELETED`, `SOLD`)
- `autopostReadyAt` timestamp (set when becomes eligible)

Eligibility suggestion:
- Not deleted / not sold
- Price present
- PhotoCount >= 10 **OR** a configurable threshold (some marketplaces accept fewer)

### 6.3 Queue ordering strategy
To satisfy “used first then new” and “use existing first then new”:
1) Partition by condition:
   - Already-in-inventory but **never posted** (backlog)
   - Newly ingested today
2) Within each partition, order:
   - Used vehicles before new vehicles (or before “new model year”)
   - Older `createdAt` first (drain backlog), but with a freshness cap to avoid posting stale/incorrect listings

Data needed (if not already present):
- `vehicle.condition` (used/new) or `isNew`
- `autopostLastPostedAt`
- `autopostPostCount` / `autopostStatus`

### 6.4 Sync→queue handoff
After enrichment completes, emit an event or run a DB query:
- enqueue vehicles that just transitioned into `autopostEligible=true` into the priority queue.

This prevents autopost from repeatedly scanning entire inventory.


---

## 7) Additional completeness items worth adding
1) **Sold/off-lot semantics vs. manual vehicles:** master plan notes “manual source excluded from sold-detection,” but the spec should explicitly ensure autopost also excludes them unless opted in.
2) **Multi-tenant isolation:** ensure all uniqueness checks and queues are scoped by `dealershipId`.
3) **Backfill/migration plan:** if adding `normalizedStock` and new uniqueness rules, define how to backfill existing records.
4) **Observability:** add dashboards/queries: “vehicles <10 photos by dealership,” “enrichment success rate,” “paid request counts.”


---

## 8) DoD CONTRACT — Deliverables, Acceptance, Validation, Gap Report

### 8.1 Deliverables checklist (exact paths)
- [x] `C:\Users\omino\projects\lotview\plans\inventory-sync\RESEARCHER_CRITIQUE.md` — critique + recommended design changes for dedupe, photos, rate limits, failure handling, autopost queue.

### 8.2 Acceptance criteria (objective)
To accept the inventory sync plan as “complete enough to implement,” the updated plan/spec should explicitly include:
1) **Identity ladder including VIN + stock** and merge policy when VIN is missing initially.
2) **Photo enrichment state machine** with stop conditions, retry cadence, and anti-thrash fingerprinting.
3) **Hard budgets + caching** for ZenRows/paid requests and VDP fetch reuse.
4) **Failure taxonomy + escalation rules** and run-level summary.
5) **Autopost readiness + queue ordering** definition (used-first then new; backlog-first then new).

### 8.3 Validation steps performed (this critique)
- Reviewed the three plan/spec/alignment docs for stated identity strategy, enrichment rules, provider chain, failure policy, and any mention of autopost queue.
- Mapped documented behavior to known failure modes for dealer sites (VIN missing initially, VDP URL churn, lazy-loaded photos) and identified where current spec is ambiguous or incomplete.

### 8.4 Gap Report + auto-fill
**Gap(s) found in provided documents:**
- No explicit VIN+stock dedupe/merge strategy.
- No explicit enrichment state machine / retry schedule / “no more photos available” terminal state.
- No explicit paid-provider budget/cap per run.
- Autopost priority queue integration not specified.

**Auto-fill provided here (actionable content to paste into the architect’s revision):**
- Identity ladder and merge policy (Section 2.3)
- Enrichment state machine + photo fingerprinting (Section 3.3–3.5)
- Circuit breaker + budgets + VDP cache strategy (Section 4.2)
- Failure taxonomy + escalation tiers + run summary (Section 5.2)
- Autopost readiness fields + queue ordering + handoff (Section 6)
