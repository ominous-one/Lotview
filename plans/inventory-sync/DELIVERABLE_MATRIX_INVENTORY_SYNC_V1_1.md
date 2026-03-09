# LotView — Deliverable Matrix v1.1: Inventory Sync + Enrichment + Soft Deletion + Autopost Priority Queue

**Project:** `C:\Users\omino\projects\lotview`

## Deliverables

| Deliverable | File path | Owner | Acceptance criteria | Validation steps |
|---|---|---|---|---|
| Master Plan v1.1 | `plans/inventory-sync/MASTER_PLAN_INVENTORY_SYNC_V1_1.md` | architect | Includes v1.1 deltas: dedupe key VIN+stock, full Autopost Priority Queue subsystem, scheduler/cadence design, and soft-delete posture (no hard delete) | Review for completeness vs requirements list; confirm referenced files exist in repo (`server/scheduler.ts`, `server/scraper.ts`, `server/robust-scraper.ts`) |
| Autopost Priority Queue Spec | `plans/inventory-sync/AUTPOST_PRIORITY_QUEUE_SPEC.md` | architect | Defines DB tables, priority ordering, per-platform status state machine, APIs, UI, and integration points: sync → enrichment → eligible → queue | Walkthrough with sample vehicles (used/new, <10 photos, override) and expected queue ordering and statuses |
| Implementation Map (repo-level) | `plans/inventory-sync/IMPLEMENTATION_MAP.md` | architect | Lists concrete repo files/modules to modify/add for v1.1 (migrations, storage, scheduler, API routes, UI screens) | Spot-check that each mapped file exists and that new files are placed under correct directories |

## Definition of Done (DoD) — contract (planning set)
1) **All deliverables exist** at the exact file paths listed above.
2) Each spec includes:
   - DB schema changes (tables/columns/indexes)
   - API endpoints (request/response + auth)
   - UI changes (screens/components)
   - Tests (unit/integration/e2e scope)
   - Operational safety (feature flags, rate limiting, idempotency)
3) **No external side effects** (no live scraping, no sending messages, no logins) as part of producing these files.
4) **Gap Report + auto-fill:** any missing non-blocking element is included in the docs rather than deferred.

## Gap Report (auto-fill)
- Researcher critique file not present at `plans/inventory-sync/RESEARCHER_CRITIQUE.md` during v1.1 write-up. No critique incorporated.
