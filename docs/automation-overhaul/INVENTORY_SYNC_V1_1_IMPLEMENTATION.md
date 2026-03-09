# Inventory Sync v1.1 — Implementation Notes (LotView)

Updated: 2026-03-09

## What shipped

### 1) Canonical inventory identity
- `vehicles.normalizedStockNumber` is persisted (alnum uppercase) and used for canonical upsert identity.
- Canonical identity: **(dealershipId, vin, normalizedStockNumber)**.
- Merge-forward behavior: if a vehicle was initially ingested with a placeholder/NULL VIN, a later scrape containing a real VIN will **merge into the existing row** by matching `normalizedStockNumber`.

### 2) 0-photo ingest + photo status
- Vehicles can ingest with **0 photos**.
- `vehicles.photoStatus` is set based on unique photo count:
  - `pending` when 0 photos
  - `complete` when >=10 unique photos
  - `unknown` otherwise

### 3) Photo enrichment loop
- `runPhotoEnrichmentSweep()` retries vehicles under photo target until they reach >=10 unique photos, or hit terminal conditions.
- Anti-thrash:
  - `vehicles.photoFingerprint` prevents rewrites when the photo set is unchanged.
- Circuit breaker:
  - Per-host failure caps prevent hammering a broken/blocked domain.
- Terminal stop:
  - After `photoEnrichFailCount >= maxFails`, vehicle is marked `photoStatus='terminal'` and `lifecycleStatus='ENRICHMENT_TERMINAL_NO_MORE_AVAILABLE'`.

### 4) Soft delete
- No hard deletes in production scrapers.
- Sold/stale inventory is soft-deleted with:
  - `deletedAt`
  - `deletedReason` (e.g. `REMOVED_BY_SYNC`)
  - `lifecycleStatus`
- Manual deletes are RBAC-gated and audited in `vehicle_audit_events`.

### 5) Autopost Priority Queue
- Tables: `autopost_queue_items`, `autopost_platform_statuses`, `autopost_queue_events`.
- Eligibility is computed on vehicles:
  - `vehicles.autopostEligible`
  - `vehicles.autopostBlockReason`
  - `vehicles.autopostReadyAt`
- Enqueue occurs via scheduled evaluation (see scheduler), and after enrichment passes.
- Manager UI route: `/manager/autopost-queue`

## Scheduler
- Nightly inventory sync (existing) + enrichment sweep every 30 min.
- Autopost eligibility/enqueue evaluated:
  - after each enrichment sweep
  - every 10 minutes as a backstop

## Worker/extension API (optional)
- `POST /api/autopost/claim-next`
- `POST /api/autopost/result`

These endpoints are gated behind:
- `ENABLE_AUTOPOST_WORKER_API=true`

## Migrations
- `0009_inventory_sync_autopost_queue_soft_delete.sql`
- `0010_inventory_sync_identity_photo_status_autopost_eligibility.sql`
