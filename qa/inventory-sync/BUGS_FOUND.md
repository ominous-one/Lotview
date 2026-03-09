# Bugs Found — Inventory Sync v1.1 QA

**Project:** `C:\Users\omino\projects\lotview`  
**QA date:** 2026-03-09

This file lists concrete gaps/bugs relative to the v1.1 requirements in `plans/inventory-sync/*`.

## Resolved since last QA pass (for audit trail)
- Prior dedupe issue (URL-first) is **fixed**: `server/scraper.ts` now prioritizes `(VIN + normalizedStockNumber)`.
- Prior hard delete paths for vehicles appear **removed**: `server/storage.ts deleteVehicle()` is soft delete; no `db.delete(vehicles)` found in server.
- Photo enrichment loop + scheduler job is **present**.

## BUG-001 — Autopost Priority Queue APIs + Manager UI not implemented (tables exist)
**Severity:** Blocker  
**Area:** Autopost Priority Queue subsystem

**Status:** RESOLVED (2026-03-09)

**Fix implemented:**
- Server:
  - `server/autopost-queue-service.ts` (enqueue/list/reorder/override/claim/result)
  - `server/routes.ts` routes:
    - `GET /api/manager/autopost/queue`
    - `POST /api/manager/autopost/queue/reorder`
    - `POST /api/manager/autopost/queue/:queueItemId/photo-override`
    - `POST /api/autopost/claim-next` (gated by `ENABLE_AUTOPOST_WORKER_API=true`)
    - `POST /api/autopost/result` (gated by `ENABLE_AUTOPOST_WORKER_API=true`)
- Client:
  - `client/src/pages/AutopostQueueManager.tsx`
  - Route: `/manager/autopost-queue`

**Validation:**
- UI loads queue list and supports reorder + photo override toggles.
- Claim/result endpoints are present (but require explicit env enable).

---

## BUG-002 — Legacy scrape path still skips 0‑photo vehicles (robust pipeline OK)
**Severity:** Medium (regression risk)  
**Area:** Ingest/enrichment gating

**Status:** RESOLVED (2026-03-09)

**Fix implemented:**
- `server/scraper.ts`: set `MIN_PHOTOS_REQUIRED = 0` so 0-photo vehicles are ingested and then handled by enrichment.
