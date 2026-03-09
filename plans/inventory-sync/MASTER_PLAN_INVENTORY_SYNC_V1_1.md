# LotView — Master Plan v1.1: Inventory Sync + Enrichment + Soft Deletion + Autopost Priority Queue

**Project:** `C:\Users\omino\projects\lotview`

## 0) Goal (what we’re shipping)
Ship an **idempotent, multi-tenant, daily inventory sync** that:
1) Ingests and updates inventory from each dealership’s **source of truth** (listing + VDP pages).
2) Refreshes **price + photos** for existing vehicles on a predictable cadence.
3) Runs a deterministic **photo enrichment loop** until a vehicle reaches **>= 10 photos** (or fails out with audit + notifications).
4) Implements **soft deletion** for vehicles (user-driven + lifecycle-driven) without breaking FK history.
5) Adds an **Autopost Priority Queue** subsystem (Craigslist + Facebook Marketplace) that:
   - assigns vehicles to a post queue once eligible
   - enforces “>=10 photos” gating (with override)
   - allows Sales Manager / GM to reorder priority (used-first by default)
   - tracks per-platform status and failure reasons

This plan is explicitly aligned with and reuses the existing scraping stack (ZenRows/ScrapingBee/Browserless/Puppeteer) and safety rules.

---

## 1) Confirmed decisions (v1.1 deltas)

### 1.1 Vehicle identity: explicit identity ladder (v1.1)
**Canonical identity for vehicles is resolved via an ordered “identity ladder”, scoped by `dealershipId`.**

Priority order (strongest → weakest):
1) **`(dealershipId, vin, normalizedStockNumber)`**
2) **`(dealershipId, vin)`** (only if unambiguous)
3) **`(dealershipId, normalizedStockNumber)`** (only if unambiguous)
4) **`(dealershipId, canonicalDealerVdpUrl)`** (temporary/fallback)

**Normalization rules:**
- `normalizedStockNumber = trim(stock).toUpperCase()` and remove whitespace + common separators (`-`, `_`).
- `canonicalDealerVdpUrl` aggressively strips tracking params (`utm_*`, `fbclid`, etc.) and known noise; URL is a *pointer*, not an identity.

**Merge policy (critical):**
- Vehicles that ingest as `stock-only` or `url-only` *must merge forward* when VIN becomes available later.
- If a later scrape produces VIN/stock that conflicts with an existing record (e.g., VIN matches but stock differs), write an anomaly/audit event (possible dealer data error).

> Why: many dealer sites (including Olympic-style stacks) can omit VIN at first ingest; VDP URLs can churn.

### 1.2 New subsystem: Autopost Priority Queue
A first-class queue that sits downstream of inventory sync + enrichment and feeds the posting automation pipeline for:
- **Craigslist**
- **Facebook Marketplace**

### 1.3 Scheduler design expanded
Cron/scheduler now explicitly includes:
- **Daily ingest** from Olympic Hyundai Vancouver (and all other active dealerships)
- **Photo enrichment retries** until >= 10 photos
- **Price refresh cadence**
- **Audit + notifications** on repeated enrichment failures

### 1.4 Deletion is soft-delete only (scrapers must not hard-delete)
Scrapers and sync jobs must **never hard-delete** vehicles. Instead:
- mark lifecycle status (e.g., SOLD / REMOVED_BY_SYNC)
- optionally set soft-delete fields if desired for user-facing hiding

---

## 2) Definitions

### 2.1 Source of truth (SoT)
For each dealership, the active `scrape_sources` URLs are the canonical input set.

SoT determines:
- whether a vehicle is present/on-lot
- price
- photos
- core specs if available

### 2.2 Enrichment
Enrichment is any post-ingest improvement after a vehicle exists in DB:
- photo fill to reach >= 10 photos
- price refresh
- VDP field refresh (trim, fuel type, Carfax badges, etc.)

### 2.3 Autopost readiness (signal semantics)
A vehicle becomes **autopost-ready** when:
- it is not soft-deleted
- it is in an “active inventory” lifecycle state
- it has a price (if required by platform policy)
- it has **>= 10 unique photos**, unless a manager override is set

When a vehicle transitions into readiness, set/derive:
- `autopostEligible=true`
- `autopostBlockReason` (e.g., `NEEDS_PHOTOS`, `MISSING_PRICE`, `DELETED`, `SOLD`, `ENRICHMENT_TERMINAL_NO_MORE_AVAILABLE`)
- `autopostReadyAt=now()` (first time it becomes eligible)

---

## 3) Canonical scraping logic we must reuse (no duplication)
**Canonical code paths:**
- `server/robust-scraper.ts` — provider fallback chain, Cloudflare detection, rate limiting, safe stale handling
- `server/scraper.ts` — upsert + merge, image caching helpers, enrichment gating helpers
- `server/browserless-unified.ts` / `server/browserless-service.ts` — provider integrations

Non-canonical / legacy:
- `server/run-zenrows-scrape.ts` — treat as debug/ad-hoc; must be made soft-delete safe

---

## 4) Architecture overview (v1.1 pipeline)

### 4.1 End-to-end pipeline
Per dealership, the pipeline is:

1) **Inventory Sync (SoT ingest)**
   - listing discovery + VDP extraction
   - upsert vehicles using the **identity ladder** (Section 1.1)

2) **Enrichment**
   - photo enrichment retries until >= 10 (state machine; Section 6.2)
   - price refresh

3) **Readiness evaluation**
   - compute/derive `autopostEligible/autopostBlockReason/autopostReadyAt`

4) **Autopost Priority Queue**
   - enqueue vehicles that just became eligible
   - maintain deterministic ordering with manager reordering
   - per-platform status tracking for FB + CL

5) **Autopost execution (separate worker/process)**
   - reads from queue
   - triggers extension-assisted posting flows (future) or service integration

### 4.2 Idempotency & dedupe details (v1.1)
**Primary goal:** Running ingest twice produces no duplicates and merges forward as identity strengthens.

Guardrails:
- Never create a second vehicle with the same strongest-known identity.
- URL churn must not create new vehicles.
- If VIN is missing initially, `stock` or `canonicalDealerVdpUrl` may be used *temporarily*, but must merge once VIN arrives.

---

## 5) Data model additions (v1.1)

### 5.1 Vehicles: identity and lifecycle
Add/ensure:
- `vin` (string, nullable)
- `stockNumber` (string, nullable)
- `normalizedStockNumber` (string, nullable)
- `dealerVdpUrl` (string, nullable)
- `canonicalDealerVdpUrl` (string, nullable)

Indexes/constraints (Postgres recommended):
- unique: `(dealershipId, vin, normalizedStockNumber)` where vin and normalizedStockNumber are not null
- unique: `(dealershipId, vin)` where vin is not null (optional but strongly recommended)
- unique: `(dealershipId, normalizedStockNumber)` where normalizedStockNumber is not null (optional; enforce app-side if conflicts exist)

Lifecycle fields (existing or add):
- `status` enum/field (e.g., ACTIVE/SOLD/REMOVED_BY_SYNC)
- `lastScrapedAt`
- `missedScrapeCount`

### 5.2 Vehicles: soft delete
Add:
- `deletedAt timestamp null`
- `deletedByUserId int null`
- `deletedReason text null`

Policy:
- Soft-deleted vehicles must be excluded from sync/enrichment/autopost queries by default.

### 5.3 Enrichment observability + anti-thrash fields
Add either:
- columns on `vehicles` (simple)
- and/or a dedicated attempts table (recommended for analytics)

Minimum recommended fields:
- `photoEnrichmentState enum(
    'NEEDS_PHOTOS',
    'PENDING_SOURCE',
    'SATISFIED',
    'NO_MORE_AVAILABLE',
    'BLOCKED'
  )`
- `photoEnrichmentAttemptCount int`
- `photoEnrichmentConsecutiveFailCount int`
- `photoEnrichmentLastAttemptAt timestamp`
- `photoEnrichmentLastError text`
- **`lastPhotoSetHash text`** (hash of sorted normalized URLs of the *effective* photo set)
- `lastPhotoSuccessfulAt timestamp`

> `lastPhotoSetHash` prevents daily thrash/redownloads when the gallery is unchanged.

### 5.4 Autopost Priority Queue (new)
See: `plans/inventory-sync/AUTPOST_PRIORITY_QUEUE_SPEC.md`

---

## 6) Scheduler / Cron design (v1.1)
> All scheduler tasks must be **feature-flagged**, multi-tenant aware, rate-limited, and budget-capped.

### 6.1 Inventory ingest
- **Cadence:** daily @ **2:00 AM Pacific**
- **Scope:** all active dealerships; explicitly includes Olympic Hyundai Vancouver (`olympichyundaivancouver` sources)
- **Entrypoint:** `runRobustScrape('scheduler', dealershipId)` (preferred)

### 6.2 Photo enrichment retries (until >=10): state machine + anti-thrash
- **Cadence:** every **2 hours** (recommended) *or* daily immediately after ingest + hourly retry window
- **Candidate selection:** not deleted AND active lifecycle status AND `photoCount < 10` AND state in (`NEEDS_PHOTOS`,`PENDING_SOURCE`)
- **Concurrency:** cap (2–3 VDP fetches in parallel) and preserve 5s per-VDP delay where required

**State machine (deterministic):**
- `SATISFIED`:
  - condition: `uniquePhotoCount >= 10`
  - action: stop photo enrichment; reset fail counters
- `PENDING_SOURCE`:
  - condition: `uniquePhotoCount == 0` AND vehicle age `< X hours` (recommend `X=12h`)
  - action: cheap/limited recheck sooner (2–4h), but **count against budgets**
- `NEEDS_PHOTOS`:
  - condition: `0 < uniquePhotoCount < 10`
  - action: normal retry cadence
- `NO_MORE_AVAILABLE`:
  - condition: for `K` consecutive enrichment attempts, `0 new unique photos` AND still `<10`
  - recommend: `K=3`
  - action: stop frequent attempts; re-check weekly (or on manual “Enrich now”)
- `BLOCKED`:
  - condition: Cloudflare block or repeated provider blocks
  - action: defer; notify at escalation threshold

**Anti-thrash rule:**
- Compute `photoSetHash = hash(sorted(normalizedImageUrls))`.
- If `photoSetHash` equals `lastPhotoSetHash`, treat attempt as **SKIPPED_UNCHANGED**:
  - do not re-upload/re-cache
  - do not reset consecutive fail count (this is not a fetch failure)

**Stop conditions:**
- success: photos >= 10 → `SATISFIED`
- terminal: `NO_MORE_AVAILABLE` after K stable attempts
- fail-out: after N failures (recommended: `6` consecutive attempts OR `3` consecutive days) → manager notification + audit

**Uniqueness definition:** “>=10 photos” is based on **unique** images (dedupe normalized URLs; optionally content hash if already available in image caching pipeline).

### 6.3 Price refresh
- **Cadence:** every **6 hours** (recommended) for active inventory
- **Fast path:** price-only update when possible

### 6.4 Autopost queue evaluation + processing
- **Cadence:** every **10 minutes** (recommended)
- **Behavior:**
  - compute eligible vehicles
  - enqueue newly-eligible vehicles (vehicles that transitioned into `autopostEligible=true`)
  - process top-of-queue per dealership (separate worker)

### 6.5 Audit + notifications
Trigger notifications when:
- photo enrichment hits escalation threshold (see Section 8.3)
- a vehicle is blocked for autopost due to photo count, repeated platform failures, etc.

Delivery:
- in-app notifications for Sales Managers/masters
- optional email outbox entry (no inline send)

Also create **run-level summary** (per dealership run):
- candidates processed
- successes (new photos added)
- blocked (Cloudflare)
- deferred due to budgets
- vehicles newly reaching >=10 photos

---

## 7) UI plan (v1.1)

### 7.1 Inventory table (Manager)
- Photo count badge and enrichment status/state
- “Enrich photos now” action
- Soft delete + restore controls (RBAC gated)

### 7.2 Autopost Priority Queue screen (Manager)
- New screen for Sales Manager/GM
- Default ordering rule: **used first**, then new
- Drag-and-drop or up/down reorder
- Per-platform status columns (FB + CL)
- Ability to override photo gate per vehicle (with audit)

---

## 8) Operational safety (rate limits, cost caps, circuit breakers)

### 8.1 Feature flags
- `ENABLE_INVENTORY_SYNC_CRON`
- `ENABLE_INVENTORY_ENRICHMENT_CRON`
- `ENABLE_PRICE_REFRESH_CRON`
- `ENABLE_AUTOPOST_QUEUE`
- `ENABLE_VEHICLE_SOFT_DELETE`

### 8.2 Hard budgets (per dealership per day)
To prevent paid-provider runaway costs during enrichment, enforce explicit budgets:
- `MAX_ENRICH_VDPS_PER_DAY` (e.g., `50`)
- `MAX_PAID_PROVIDER_REQUESTS_PER_DAY` (e.g., `20` ZenRows/ScrapingBee total)
- `MAX_BROWSER_RENDER_REQUESTS_PER_DAY` (optional; highest-cost tier)

Budget behavior:
- once exceeded: defer remaining enrichment candidates and include counts in the run-level summary.

### 8.3 Domain-level circuit breaker
If Cloudflare block pages (or equivalent provider-block signals) occur `M` times in a run for the same domain:
- stop enrichment for that dealership/domain for the remainder of the run
- mark run as partial/deferred
- create an audit event and notify at the correct tier

Recommended `M=5` (tune per dealership).

### 8.4 Failure taxonomy + escalation tiers
Classify enrichment outcomes:
- `FETCH_FAILED` (network/provider)
- `BLOCKED` (Cloudflare)
- `PARSE_FAILED` (site selector/shape changed)
- `NO_NEW_PHOTOS` (valid fetch, but no delta)
- `SKIPPED_UNCHANGED` (hash unchanged)

Reset policy:
- Any successful **increase in unique photos** resets consecutive fail counts.
- `NO_NEW_PHOTOS` contributes toward `NO_MORE_AVAILABLE` but is not a “fetch failure”.

Escalation tiers:
- Tier 1: log only (first 1–2 failures)
- Tier 2: manager notification after `3` consecutive `FETCH_FAILED` or `BLOCKED`
- Tier 3: engineering/ops escalation when `PARSE_FAILED` spikes across many vehicles in one run (site changed)

---

## 9) Acceptance criteria (objective)
1) Running ingest twice produces **no duplicates** and merges forward according to the identity ladder.
2) Vehicles first created with <10 photos eventually reach >=10 when available; enrichment stops once satisfied.
3) Enrichment does not thrash: unchanged photo sets are detected via `lastPhotoSetHash` and skipped.
4) Repeated enrichment failures create audit log entries and manager notifications at the defined thresholds; circuit breakers prevent runaway.
5) Soft-deleted vehicles never appear in active inventory lists and are excluded from enrichment + autopost.
6) Autopost queue only contains eligible vehicles by default; photo gate (<10) blocks autopost unless override; managers can reorder queue.
7) Scrapers do not hard-delete; lifecycle transitions are status/soft-delete only.

---

## 10) Validation steps (developer/operator)
- Run ingest twice; verify uniqueness/merge behavior on identity ladder keys.
- Seed a vehicle with 0–3 photos; run enrichment retries; verify it becomes eligible at >=10 (or enters `NO_MORE_AVAILABLE`).
- Force Cloudflare-style block in test environment; verify circuit breaker triggers and defers.
- Force parse failure (changed selector); verify Tier 3 escalation semantics (run-level summary + audit).
- Delete a vehicle as Sales Manager; verify it disappears from inventory and autopost queue.
- Make a vehicle eligible; verify it is queued and can be reprioritized; verify per-platform statuses update.

---

## 11) Gap Report (auto-fill)
- **Current dedupe implementation** in `server/scraper.ts` prioritizes normalized URL; must be updated to use the identity ladder and merge-forward semantics.
- **Identity ladder DB support** may require new columns (`normalizedStockNumber`, `canonicalDealerVdpUrl`) and partial unique indexes; if partial indexes aren’t available, enforce uniqueness in application logic + audit anomalies.
- **Enrichment anti-thrash** requires persisting `lastPhotoSetHash` (and ensuring the hash is computed from normalized, de-duplicated photo URLs).
- **Budgets/circuit breakers** require counters per run/day and consistent block detection signals from the robust scraper.
- **Autopost readiness fields** (`autopostEligible`, `autopostBlockReason`, `autopostReadyAt`) may be derived rather than stored; choose one approach and document it in implementation.
