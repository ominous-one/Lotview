# Inventory Sync v1.1 (Implemented)

Date: 2026-03-09

This document summarizes what was implemented for Inventory Sync v1.1 in LotView.

## Summary

- **Soft-delete**: Vehicles are no longer hard-deleted by sync logic. Stale vehicles are marked with `deleted_at` and `deleted_reason=REMOVED_BY_SYNC`.
- **Canonical identity**: Scraper upsert now prioritizes `(dealershipId, VIN, stockNumber)` matching.
- **0-photo ingest supported**: Inventory ingest no longer skips vehicles with 0 photos; they are ingested and marked for enrichment.
- **Photo enrichment loop (MVP)**: A periodic enrichment sweep attempts to re-fetch VDP pages for vehicles under the **10-photo gate**, with anti-thrash fingerprinting.
- **Enrichment stuck notifications**: When enrichment becomes terminal (no more photos available), a manager/GM notification event is created.
- **Autopost priority queue (end-to-end)**:
  - DB schema (queue items + per-platform status + audit events)
  - Server service + API routes to list/reorder/override/dequeue
  - Worker/extension routes to claim-next + record results
  - Manager UI page to view + reorder + set photo-gate override
- **Production guardrails**: Legacy TRUNCATE inventory code path is blocked in production unless explicitly overridden.

## Vehicle lifecycle / deletion

### Columns added to `vehicles`

- `deleted_at`, `deleted_by_user_id`, `deleted_reason`
- `lifecycle_status` (default `ACTIVE`)
- Enrichment observability: `photo_enrich_fail_count`, `photo_enrich_last_attempt_at`, `photo_enrich_last_error`, `photo_fingerprint`
- `last_price_refresh_at`

### Sync behavior

- Sync processes should **soft-delete** vehicles that disappear from the source inventory.
- Scrapers **do not resurrect** vehicles soft-deleted by a user (`deleted_by_user_id` set).
- Scrapers **may restore** vehicles removed by sync (`deleted_reason=REMOVED_BY_SYNC`) if the vehicle re-appears.

## Photo enrichment loop (MVP)

Implemented a best-effort enrichment sweep (`runPhotoEnrichmentSweep`) that:

- Selects vehicles where `array_length(images) < 10`
- Throttles attempts (default every 2h per vehicle)
- Stops after `photo_enrich_fail_count >= 10`
- Fetches the VDP HTML and extracts image URLs
- Uses a **photo fingerprint** (sha256 of normalized URLs) to prevent thrash

> Note: The HTML parsing is conservative and may not overcome heavy bot protection. The intent is to provide an internal loop + observability; if needed, swap the fetcher for ZenRows/Browserless.

## Autopost priority queue

Schema was added:

- `autopost_queue_items`
- `autopost_platform_statuses`
- `autopost_queue_events`

Server implementation:

- Service: `server/autopost-queue-service.ts`
- Manager APIs (RBAC: `master` + `sales_manager`):
  - `GET /api/manager/autopost/queue?platform=all|facebook_marketplace|craigslist`
  - `POST /api/manager/autopost/queue/evaluate` (manual evaluate + enqueue)
  - `POST /api/manager/autopost/queue/reorder`
  - `POST /api/manager/autopost/queue/:queueItemId/photo-override`
  - `POST /api/manager/autopost/queue/:queueItemId/dequeue`
- Worker/extension APIs (JWT auth + tenant scoping):
  - `POST /api/autopost/claim-next`
  - `POST /api/autopost/result`

UI:

- `client/src/pages/AutopostQueue.tsx`
- Route: `/manager/autopost/queue` (also kept legacy `/manager/autopost-queue`)

This enables:

- backlog-first default ordering with used-first heuristic
- per-platform state machine tracking (FB + CL)
- audit/event trail (`autopost_queue_events`)
- photo gate enforcement (<10 unique photos blocks claim unless override)

## Scheduler

- Nightly ingest at **2 AM** now runs `runRobustScrape('scheduler', 1)` (Olympic Hyundai Vancouver).
- Enrichment sweep runs every **30 minutes** for dealershipId=1.

## Migrations

See: `migrations/0009_inventory_sync_autopost_queue_soft_delete.sql`
