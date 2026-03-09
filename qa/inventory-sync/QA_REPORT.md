# QA Report — Inventory Sync v1.1 (VIN+Stock Dedupe + 0‑Photo Ingest + Enrichment Loop + Soft Delete + Autopost Queue)

**Project:** `C:\Users\omino\projects\lotview`  
**QA date:** 2026-03-09  
**QA method:** Static code review + typecheck (`npm run check`). No live scraping executed (avoids external side effects).

## Executive summary
**Overall status: PASS (v1.1 requirements satisfied; no remaining blockers).**

### What changed since prior QA
- **Autopost Priority Queue is now implemented end-to-end (API + Manager UI)** and wired to the DB tables.
- **Legacy 0-photo gating removed** (`MIN_PHOTOS_REQUIRED` adjusted) so 0-photo units can ingest and rely on enrichment.

---

## What I reviewed
- QA + bug docs:
  - `qa/inventory-sync/QA_REPORT.md`
  - `qa/inventory-sync/BUGS_FOUND.md`
- Autopost queue implementation:
  - `server/autopost-queue-api.ts` (DB-backed queue ops)
  - `server/routes.ts` (routes: manager UI + worker endpoints)
  - `client/src/pages/AutopostQueueManager.tsx` (manager screen)
- Prior v1.1 work (spot-check only; previously verified):
  - `server/scraper.ts`, `server/robust-scraper.ts`
  - `server/inventory-enrichment-service.ts`, `server/scheduler.ts`
  - `server/storage.ts`
  - `shared/schema.ts`, migrations `0009`, `0010`

---

## Validation steps executed
- `npm run check` (TypeScript compile): **PASS**

---

## Acceptance criteria results (objective)

### 1) VIN + normalized stock dedupe implemented
**Status: PASS**

(Previously verified) Identity ladder in `server/scraper.ts` prioritizes `(dealershipId, VIN, normalizedStockNumber)`; DB unique partial index exists in `migrations/0010_inventory_sync_identity_photo_status_autopost_eligibility.sql`.

---

### 2) 0‑photo ingest allowed
**Status: PASS**

- Robust pipeline allows 0-photo ingest (vehicles can be inserted with empty `images[]` and `photo_status=pending`).
- **Legacy gating risk addressed:** `server/scraper.ts` no longer blocks 0-photo units (see `qa/inventory-sync/BUGS_FOUND.md` BUG-002).

---

### 3) Enrichment loop exists and is schedulable
**Status: PASS**

- Enrichment sweep exists (`server/inventory-enrichment-service.ts`).
- Scheduled execution exists (`server/scheduler.ts` cron).

---

### 4) Soft delete implemented and hard deletes removed from production vehicle deletion paths
**Status: PASS**

- Vehicle delete paths route through soft delete (e.g., `storage.deleteVehicle()` updates `deletedAt`, `lifecycleStatus`, etc.).
- No evidence of active hard delete usage for vehicles in production paths.

---

### 5) Autopost queue tables + APIs + UI exist
**Status: PASS**

**Server API (manager):** implemented in `server/routes.ts`
- `GET /api/manager/autopost/queue` (list)
- `POST /api/manager/autopost/queue/reorder` (reorder)
- `POST /api/manager/autopost/queue/:queueItemId/photo-override` (toggle photo gate override)

**Server API (worker/extension):** implemented + gated (intentional)
- `POST /api/autopost/claim-next`
- `POST /api/autopost/result`

**Security gate:** worker endpoints are disabled unless `ENABLE_AUTOPOST_WORKER_API=true`.

**Manager UI:** implemented
- `client/src/pages/AutopostQueueManager.tsx`
- Route: `/manager/autopost-queue`
- Supports: view queue, move up/down, save order, toggle photo override.

**DB wiring:** implemented in `server/autopost-queue-api.ts` via Drizzle tables:
- `autopost_queue_items`, `autopost_platform_statuses`, `autopost_queue_events` (from `shared/schema.ts` + migrations)

---

## Gap report (QA)
- **No v1.1 blockers found** based on static review + typecheck.
- **Non-blocking follow-up (recommended):** add a small API test (or E2E) proving reorder persistence and event creation, so future changes don’t regress this subsystem.