# Test Commands — Inventory Sync v1.1 QA

**Project:** `C:\Users\omino\projects\lotview`

These commands are intended for local/dev QA.

> Safety note: Anything that runs scrapers can hit external websites and paid providers (ZenRows/ScrapingBee/Browserless/Puppeteer). Only run those when explicitly approved.

## 0) Build/typecheck
```bash
npm run check
```

## 1) Apply migrations (Drizzle)
```bash
npm run db:push
```

## 2) Start app (dev)
```bash
npm run dev
```

## 3) Optional: run enrichment sweep manually (no external scrape providers required if it uses direct VDP fetches; still hits dealer sites)
> Only run when approved.

If you want to run the same function the scheduler runs, add a short-lived dev script or a dev-only route that calls:
- `runPhotoEnrichmentSweep({ dealershipId: 1, limit: 25, minPhotosTarget: 10 })`

Scheduler reference:
- `server/scheduler.ts` (cron: `*/30 * * * *`)

## 4) Optional: run robust inventory sync manually
> Only run when approved.

Canonical path used by the scheduler:
- `runRobustScrape('scheduler', dealershipId)`

Repo scripts that exist (may require env keys):
```bash
node --loader tsx run-sync.ts
node --loader tsx run-scraper.ts
node --loader tsx run-zenrows-scraper.ts
node --loader tsx run-browserless-scraper.ts
```

## 5) DB verification queries (Postgres)

### 5.1 Detect duplicate VIN+normalizedStock per dealership (canonical)
```sql
SELECT dealership_id, vin, normalized_stock_number, COUNT(*)
FROM vehicles
WHERE vin IS NOT NULL AND normalized_stock_number IS NOT NULL
GROUP BY dealership_id, vin, normalized_stock_number
HAVING COUNT(*) > 1;
```

### 5.2 Find vehicles with 0 photos (should exist; will be enriched later)
```sql
SELECT id, dealership_id, vin, stock_number, normalized_stock_number,
       COALESCE(array_length(images, 1), 0) AS photo_count,
       photo_status,
       dealer_vdp_url
FROM vehicles
WHERE images IS NULL OR array_length(images, 1) = 0
ORDER BY id DESC
LIMIT 50;
```

### 5.3 Validate soft deletes (vehicles should not be hard-deleted)
```sql
SELECT id, dealership_id, vin, stock_number, deleted_at, deleted_reason, lifecycle_status
FROM vehicles
WHERE deleted_at IS NOT NULL
ORDER BY deleted_at DESC
LIMIT 50;
```

### 5.4 Autopost queue tables exist
```sql
SELECT to_regclass('public.autopost_queue_items') AS autopost_queue_items,
       to_regclass('public.autopost_platform_statuses') AS autopost_platform_statuses,
       to_regclass('public.autopost_queue_events') AS autopost_queue_events;
```

## 6) Targeted code references (for QA)
- VIN+stock dedupe + merge behavior:
  - `server/scraper.ts` → `upsertVehicleByVin()`
  - `migrations/0010_inventory_sync_identity_photo_status_autopost_eligibility.sql` → `vehicles_dealership_vin_normstock_uq`
- 0-photo ingest in robust pipeline:
  - `server/robust-scraper.ts` (logs mention pending enrichment when no photos)
- Photo enrichment loop + fingerprinting:
  - `server/inventory-enrichment-service.ts`
  - `server/inventory-enrichment-utils.ts`
- Soft delete:
  - `server/storage.ts` → `deleteVehicle()`
  - `server/routes.ts` → `DELETE /api/vehicles/:id`
- Autopost queue data model (but APIs/UI missing as of this QA):
  - `migrations/0009_inventory_sync_autopost_queue_soft_delete.sql`
  - `shared/schema.ts`