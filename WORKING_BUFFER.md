# WORKING_BUFFER

Status: ACTIVE
Last Updated: 2026-03-26

Use this as the short-lived execution scratchpad for the current LotView run.

## Current context
- activeObjective: Push LotView toward actual production readiness, not planning theater.
- currentState: Auditing and fixing highest-risk multi-tenant and runtime issues already visible in repo.
- acceptanceTarget:
  - remove additional unsafe dealership fallbacks in critical paths
  - keep web/worker topology coherent in repo
  - pass typecheck/build after edits
  - return exact remaining live blockers

## Decisions
- Start with tenant isolation and scheduler/runtime correctness before lower-risk cleanup.
- Prefer fail-closed behavior over dealership 1 compatibility fallbacks.
- Only claim completion for what is evidenced locally; live workflows still need live credentials/runtime.

## Evidence produced
- Verified current modified files and repo dirty state via git status.
- Confirmed remaining fallback hotspots in tests and legacy paths via code search; production route definitions now show a single `/api/autopost/claim-next` and `/api/autopost/result` registration, both guarded by `externalApiAuth` and `autopost:write` permission checks in `server/routes.ts`.
- Patched `server/market-aggregation-service.ts` so aggregation always uses dealership-scoped MarketCheck and Apify services; the previous global/env fallback branch is gone from this path.
- Patched `server/robust-scraper.ts` Apify market refresh to fail closed without `dealershipId` and to read/update only the target dealership inventory instead of falling back to a global vehicle slice.
- Patched `server/runtime-readiness.ts` to emit startup drift indicators for DB config source (`DATABASE_URL` vs `PG*` vs missing) and migrations directory presence.
- Verified runtime split wiring locally:
  - `package.json` builds both `dist/index.js` and `dist/index-worker.js`
  - `server/index-prod.ts` only starts schedulers when `LOTVIEW_SCHEDULER_PROCESS=web`
  - `server/index-worker.ts` only starts schedulers when `LOTVIEW_SCHEDULER_PROCESS=worker`
  - `server/posting-scheduler.ts` keeps the legacy Facebook posting scheduler disabled unless `ENABLE_LEGACY_FACEBOOK_POSTING_SCHEDULER=true`
- Verified autopost queue service still enforces terminal hold/exhaustion semantics in code (`MAX_ATTEMPTS_PER_PLATFORM = 3`, claimed status transition, and operator-review hold path in `server/autopost-queue-service.ts`).
- Validation evidence:
  - `npm run check` passed
  - `npm run build` passed
  - direct import of `server/db.ts` fails without DB config: `Database configuration not found. Please ensure the database is provisioned.`
  - DB-backed tests like `server/tests/autopost-queue-service.test.ts` still cannot run in this session without DB env because they import `../db` and execute live DDL in `beforeAll`

## Open blockers
- No live DB/deploy/external-account access yet.
- DB-backed autopost queue tests cannot be executed in this session because `server/db.ts` hard-fails without `DATABASE_URL` or PG* env vars.
- Remaining route/component tenancy fallbacks still exist outside this slice, including multiple `req.dealershipId || 1` sites in `server/routes.ts` and UI-side `|| 1` defaults.

## Immediate next action
- Audit and patch the remaining route/component `|| 1` fallback sites, then run focused regression on tenant-isolated API flows.
