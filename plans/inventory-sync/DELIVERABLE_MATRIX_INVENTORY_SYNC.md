# LotView — Deliverable Matrix: Inventory Sync + Enrichment + Deletion

**Project:** `C:\Users\omino\projects\lotview`

## Deliverables

| Deliverable | File path | Owner | Acceptance criteria | Validation steps |
|---|---|---|---|---|
| Master Plan | `plans/inventory-sync/MASTER_PLAN_INVENTORY_SYNC.md` | architect | Clear phases + definitions; aligns with existing scraper + scheduler; includes acceptance criteria + gap report | Review plan against `server/scheduler.ts`, `server/robust-scraper.ts`, `server/scraper.ts` |
| Deliverable Matrix | `plans/inventory-sync/DELIVERABLE_MATRIX_INVENTORY_SYNC.md` | architect | Maps outputs to owners and objective checks | Confirm all required files exist at paths |
| Inventory Sync Spec | `plans/inventory-sync/INVENTORY_SYNC_SPEC.md` | architect | Defines cron behavior, idempotency, enrichment algorithm, audit + notification rules, API surface, DB changes, tests | Walkthrough: simulate 2 consecutive runs; verify no duplicates; verify enrichment thresholds + notifications |
| Inventory Deletion Spec | `plans/inventory-sync/INVENTORY_DELETION_SPEC.md` | architect | Soft-delete model, RBAC rules, API/UI changes, audit requirements, tests | Verify role matrix; verify deleted vehicles excluded from queries; verify restore |
| Scraping Logic Alignment | `plans/inventory-sync/SCRAPING_LOGIC_ALIGNMENT.md` | architect | Names canonical scraping files and how enrichment must reuse them; no duplicate stacks | Confirm code references are correct (paths, functions) |

---

## Definition of Done (DoD) — contract
1) **All deliverables exist** at the exact paths above.
2) Each spec includes:
   - DB schema changes (tables/columns/indexes)
   - API endpoints (request/response + auth)
   - UI changes (screens/components)
   - Tests (unit/integration/e2e) with clear scope
   - Operational safety (feature flags, rate limiting, idempotency)
3) **No external side effects** (no messaging/email sending, no scraping live sites) as part of producing these files.
4) **Gap Report + auto-fill:** any missing non-blocking element is added into the specs rather than deferred.

---

## Gap Report (auto-fill)
- None for the planning/spec deliverables themselves. Implementation gaps are called out inside each spec.
