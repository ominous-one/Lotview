# Inventory Sync Spec (Daily Cron) — LotView

**Project:** `C:\Users\omino\projects\lotview`

## 1) Scope
Implement a **daily inventory sync + enrichment pipeline** that:
- Ingests new vehicles from dealership scrape sources
- Refreshes price + photos for existing vehicles
- Attempts photo enrichment for vehicles with **<10 photos**
- Creates audit logs + notification events when enrichment fails repeatedly

This spec explicitly requires **reusing** the existing scraping stack (no duplicate scrapers).

---

## 2) Current system alignment (what exists today)
### 2.1 Scheduler
- `server/scheduler.ts` schedules nightly inventory sync at **2 AM Pacific** using `scrapeWithZenRows()` and falls back to `runRobustScrape()`.

### 2.2 Canonical scraping + upsert logic
- `server/robust-scraper.ts` already:
  - orchestrates scraping provider fallbacks (ZenRows → ScrapingBee → Puppeteer → Browserless → Apify → preserve)
  - enforces Cloudflare block detection + rate limiting
  - supports safe stale handling via `missedScrapeCount` (3 misses)
  - contains high-quality image extraction logic and filters
- `server/scraper.ts` already:
  - dedupes via **normalized dealer VDP URL** first, then VIN
  - smart-merges fields so gaps don’t overwrite good data
  - has hooks for enrichment gating (`checkVehicleNeedsEnrichment`) and fast price updates (`updateVehiclePriceOnly`)
  - caches images to DB and rewrites `vehicles.images` to local URLs

**Design decision:** The daily sync should call **`runRobustScrape`** as the single ingest path; `run-zenrows-scrape.ts` is treated as legacy/single-dealer utility.

---

## 3) Inventory sync pipeline (proposed)
### 3.1 Cron cadence
- Default: **daily at 2:00 AM Pacific** (keep existing cadence).
- Add feature flag(s):
  - `ENABLE_INVENTORY_SYNC_CRON=true`
  - `ENABLE_INVENTORY_ENRICHMENT=true`

### 3.2 Per-dealership job stages
For each **active dealership** (`storage.getAllDealerships().filter(isActive)`):

#### Stage A — Ingest (SoT)
- Call: `runRobustScrape('scheduler', dealershipId)`
- Output: scrape run record exists (already implemented via `storage.createScrapeRun/updateScrapeRun`).
- Idempotency: handled by `upsertVehicleByVin` (URL→VIN→fallback).

#### Stage B — Enrichment eligibility query
Select candidate vehicles where:
- `isDeleted=false` (soft-deletes excluded)
- AND (any):
  - `images.length < 10`
  - `price is null/0` OR stale price based on `lastScrapedAt` age
  - `vdpDescription is null` OR `techSpecs is null` OR `fuelType is null` (optional; aligns with existing `checkVehicleNeedsEnrichment`)

#### Stage C — Photo/price enrichment pass
For each candidate vehicle:
- Fetch VDP content using **existing provider chain** and rate limiting.
- Extract:
  - high-res image URLs (deduped)
  - price (if present)
  - optional: stock number, carfaxUrl/badges, VDP description/specs (already present in robust scraper helpers)
- Upsert only the fields that improved (or reuse `upsertVehicleByVin` smart merge if it won’t regress fields).

**Hard requirement:** photo enrichment must use the same “image hygiene” rules already enforced:
- blocklist patterns (`BLOCKED_IMAGE_PATTERNS`)
- normalization (`normalizeAutoTraderPhotoUrl`, `maximizeImageUrl`)
- “same CDN folder” validation (`validateSameFolderImages`) to prevent mixing photos from recommended vehicles

#### Stage D — Failure accounting + notifications
If enrichment attempt for a vehicle fails (cannot fetch VDP, Cloudflare block pages repeatedly, extracted images remain <10, etc.):
- increment `vehicles.enrichmentPhotoFailCount` (or separate table — see DB section)
- store `vehicles.lastEnrichmentAttemptAt`
- store `vehicles.lastEnrichmentError`

If `enrichmentPhotoFailCount` crosses a threshold (recommended **3 consecutive days**):
- create a `notification_event` (new type) and `notifications` rows for sales managers
- (optional) enqueue email via existing outbox pipeline (no direct send)

---

## 4) Data model changes
### Option A (recommended): Track enrichment attempts on the vehicle row
Add to `vehicles`:
- `photoCount` is derived from `images.length` (no column required)
- `enrichmentPhotoFailCount integer not null default 0`
- `enrichmentLastPhotoAttemptAt timestamp null`
- `enrichmentLastPhotoError text null`
- `enrichmentPhotoStatus enum('ok','needs_photos','failed')` (optional)

Pros: simple queries; per-vehicle state easily visible.
Cons: less granular for analytics.

### Option B: Dedicated enrichment attempts table (best for audit/analytics)
Create `inventory_enrichment_attempts`:
- `id uuid`
- `dealershipId int`
- `vehicleId int`
- `attemptType enum('photos','price','vdp')`
- `status enum('success','failed','skipped')`
- `error text null`
- `startedAt/finishedAt timestamps`
- `metrics jsonb` (ex: `{"beforePhotoCount":3,"afterPhotoCount":11}`)

Recommended approach:
- Do Option A for operational simplicity AND Option B for world-class observability.

### Reuse existing scrape run tables
`robust-scraper.ts` already writes scrape runs. Enrichment should either:
- extend that run with a linked enrichment run id, or
- add a separate `inventory_sync_runs` table.

**Recommended:** add `inventory_sync_runs` so ingest and enrichment are grouped.

Proposed `inventory_sync_runs`:
- `id uuid`
- `dealershipId int`
- `triggeredBy enum('cron','manual','webhook')`
- `startedAt/finishedAt`
- `status enum('success','partial','failed')`
- `scrapeRunId` nullable (links existing scrape run)
- `summary jsonb` (counts)

---

## 5) Notification + audit design
### 5.1 New notification event types
Add to `NotificationEventType` (or similar union) and DB enum:
- `INVENTORY_ENRICHMENT_FAILED`
- `INVENTORY_ENRICHMENT_RECOVERED` (optional)

### 5.2 Recipient policy
- Recipients: users with role `sales_manager` (and optionally `master`) for the dealership.
- Message content:
  - vehicle label
  - current photo count
  - last error
  - deep link to vehicle

### 5.3 Delivery
Use existing pattern:
- insert into `notification_events` + `notifications`
- optionally enqueue email in `email_outbox` (do not send inline; worker handles it)

---

## 6) API changes
### 6.1 Manual trigger (admin)
`POST /api/manager/inventory/sync`
- Auth: `master` or `sales_manager`
- Body: `{ dealershipId?: number, runEnrichment?: boolean }`
- Response: `{ inventorySyncRunId, scrapeRunId?, status }`

### 6.2 Sync history
`GET /api/manager/inventory/sync/runs?dealershipId=...`
- Auth: manager roles
- Response: list of recent runs + summary counts

### 6.3 Enrichment status per vehicle
`GET /api/manager/inventory/vehicles?dealershipId=...&needsPhotos=true`
- Adds fields: `photoCount`, `enrichmentPhotoFailCount`, `enrichmentLastPhotoAttemptAt`, `enrichmentLastPhotoError`

---

## 7) UI changes
### 7.1 Inventory table (manager)
Add columns:
- Photo count (badge)
- Enrichment status (OK / Needs photos / Failing)
- Last enrichment attempt

Add actions:
- “Enrich photos now” (single vehicle)
- “Run dealership enrichment” (bulk)

### 7.2 Vehicle detail
- Show audit timeline entries for:
  - sync ingest
  - enrichment attempts
  - failures + notification sent

---

## 8) Scheduler changes
### 8.1 Implementation approach
Add a new service `InventorySyncService` called by `server/scheduler.ts`.

**Keep existing cron time** but change the task body from `scrapeWithZenRows()` to:
1) `runRobustScrape('scheduler')`
2) `runInventoryEnrichmentPass()`

### 8.2 Guard rails
- If scrape imported < minimum threshold (existing logic uses 15 vehicles for stale check), do not run deletion-like logic.
- Enrichment must cap concurrency (e.g., 2–3 VDP fetches in parallel) and respect 5s delay for sensitive domains.

---

## 9) Test plan
### Unit tests
- Idempotency:
  - same VDP URL ingested twice → 1 record updated
- Enrichment gating:
  - images >=10 → skipped
  - images <10 → attempt
  - fail count increments correctly; resets on success

### Integration tests
- Manual sync endpoint enforces RBAC.
- Notifications created after 3 consecutive failures.

### E2E (optional)
- Simulate an inventory with 0-photo vehicle and verify UI indicates “Needs photos”, then shows “OK” after enrichment (mocking scraper output).

---

## 10) Definition of Done (DoD) — contract
- Spec includes cron, DB, API, UI, tests, safety.
- Aligns with existing scraping chain.
- No duplicated provider logic.

---

## 11) Gap Report (auto-fill)
1) **Where to implement new enums** for notification events depends on current type definition (`NotificationEventType` appears in appointment module). Implementation must update both TS types and DB enum (if any).
2) Exact Next.js route structure for manager inventory pages must be confirmed (spec assumes `/manager/...`).
3) Image caching currently rewrites `vehicles.images` to local `/api/public/vehicle-image/...` URLs; enrichment must preserve this behavior and avoid mixing external+local URLs.
