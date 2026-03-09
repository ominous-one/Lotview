# Implementation Map — Inventory Sync v1.1 + Autopost Priority Queue + Soft Delete

**Project:** `C:\Users\omino\projects\lotview`

This map lists concrete repo-level files/modules to change or add to implement the v1.1 plan.

---

## 0) Guiding constraints
- **Vehicle identity:** `(dealershipId, vin, stockNumber)` is the canonical dedupe key.
- **No hard deletes** from scrapers/sync.
- **Autopost queue** is downstream of sync/enrichment and must be multi-tenant.

---

## 1) Database / migrations
### 1.1 Vehicles identity + soft delete
Add migrations under `migrations/` to include:
- Unique index: `(dealershipId, vin, stockNumber)` (partial index where vin/stock not null)
- Soft delete columns on `vehicles`:
  - `deletedAt`, `deletedByUserId`, `deletedReason`
- Optional enrichment counters:
  - `enrichmentPhotoFailCount`, `enrichmentLastPhotoAttemptAt`, `enrichmentLastPhotoError`

Likely files:
- `migrations/*_vehicles_soft_delete.sql` (or drizzle migration format used in repo)
- `server/schema.ts` or wherever Drizzle table definitions live (confirm exact file)

### 1.2 Autopost priority queue tables
New tables + indexes:
- `autopost_queue_items`
- `autopost_platform_status`
- `autopost_queue_events`

Likely files:
- `migrations/*_autopost_queue.sql`
- Schema definition file(s): `server/schema.ts` (or `shared/schema.ts` depending on repo)

---

## 2) Core scraping + upsert changes
### 2.1 Update vehicle upsert dedupe strategy
**File:** `server/scraper.ts`
- Update `upsertVehicleByVin(...)` to prioritize matching by:
  1) `dealershipId + vin + stockNumber`
  2) fallback(s) when incomplete: `(dealershipId + vin)` if unambiguous
  3) fallback: normalized `dealerVdpUrl` only as temporary identity
- Add safety to avoid splitting same VIN+stock across multiple records.

### 2.2 Ensure scrapers never hard-delete vehicles
**File:** `server/run-zenrows-scrape.ts` (legacy script)
- Replace `storage.deleteVehicle(...)` (or direct `db.delete(vehicles)`) with:
  - lifecycle status updates (SOLD / REMOVED_BY_SYNC) and/or soft delete
- Add a comment banner: “PRODUCTION SAFE: no hard deletes”.

**File:** `server/robust-scraper.ts`
- Audit any “stale/sold cleanup” logic and ensure it uses:
  - `missedScrapeCount` increments
  - lifecycle status transitions
  - never deletes rows

---

## 3) Scheduler / cron updates
**File:** `server/scheduler.ts`
- Nightly ingest at 2 AM should be driven by **robust scrape** (multi-tenant) instead of `scrapeWithZenRows()`.
- Add scheduled jobs:
  - photo enrichment retries (e.g., every 2 hours)
  - price refresh cadence (e.g., every 6 hours)
  - autopost queue evaluation + processing (e.g., every 10 minutes)
- Add feature flags:
  - `ENABLE_INVENTORY_SYNC_CRON`
  - `ENABLE_INVENTORY_ENRICHMENT_CRON`
  - `ENABLE_PRICE_REFRESH_CRON`
  - `ENABLE_AUTOPOST_QUEUE`

New services suggested under `server/`:
- `server/inventory-sync-service.ts`
- `server/inventory-enrichment-service.ts`
- `server/price-refresh-service.ts`
- `server/autopost-queue-service.ts`

---

## 4) Storage layer / queries
**File:** `server/storage.ts`
Add methods (or extend existing):
- vehicle queries that default to `deletedAt IS NULL`
- queue methods:
  - `listAutopostQueue(...)`
  - `reorderAutopostQueue(...)`
  - `setAutopostPhotoOverride(...)`
  - `claimNextAutopostItem(...)`
  - `recordAutopostResult(...)`
- audit/event insertion:
  - `createAutopostQueueEvent(...)`

---

## 5) API routes
> Exact locations depend on the Next.js structure; adjust to actual `src/app/api` layout.

Add manager-facing APIs:
- `src/app/api/manager/autopost/queue/route.ts` (GET)
- `src/app/api/manager/autopost/queue/reorder/route.ts` (POST)
- `src/app/api/manager/autopost/queue/[queueItemId]/photo-override/route.ts` (POST)

Add worker/extension APIs (auth model TBD):
- `src/app/api/autopost/claim-next/route.ts` (POST)
- `src/app/api/autopost/result/route.ts` (POST)

Inventory deletion APIs if not present:
- `src/app/api/manager/inventory/vehicles/[vehicleId]/route.ts` (DELETE)
- `src/app/api/manager/inventory/vehicles/[vehicleId]/restore/route.ts` (POST)

---

## 6) UI changes
### 6.1 Autopost Queue screen
Likely files:
- `src/app/manager/autopost/queue/page.tsx`
- `src/components/autopost/AutopostQueueTable.tsx`
- `src/components/autopost/AutopostQueueReorder.tsx` (drag/drop)

### 6.2 Inventory list + vehicle detail
Update to:
- display photo count + enrichment status
- enforce soft-delete exclusion
- expose delete/restore actions (RBAC)

Likely files:
- `src/app/manager/inventory/page.tsx`
- `src/app/manager/inventory/[vehicleId]/page.tsx`

---

## 7) Notifications / audit
**Files:**
- `server/notifications/*` (existing outbox + workers)
- `server/notification-service.ts` (if exists)

Add event types:
- `INVENTORY_ENRICHMENT_FAILED`
- `AUTOPOST_PLATFORM_FAILED`

---

## 8) Tests
Add/extend tests under `tests/`:
- Deduplication: VIN+stock uniqueness
- Soft delete: excluded from queries + restored
- Autopost queue: reorder, claim-next exclusivity, photo-gate behavior

---

## 9) Validation checklist (implementation-time)
- Confirm actual schema definition location (Drizzle table definitions).
- Confirm whether `isNew`/condition field exists; if not, define how “used first” is computed.
- Confirm current auth/RBAC middleware for manager APIs and reuse it.

---

## 10) Gap Report (auto-fill)
- This file is a mapping document; it does not verify which of the suggested `src/app/api/...` paths exist in this repo. An implementer must align the API file placement to the actual Next.js routing structure in `src/`.
- Auth model for extension/worker endpoints (`/api/autopost/*`) is not defined here; must be decided (service token vs signed user token vs dealership-scoped API key).
