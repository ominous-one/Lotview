# Automation Overhaul — Workstreams 2 + 3 (Implementation)

> Project: `C:\Users\omino\projects\lotview`
> 
> This document covers production-ready implementation details for:
> - **Workstream 2:** Competitive report snapshot (every ~48h)
> - **Workstream 3:** VIN decode (cheap hybrid) + appraisal comps engine

## Deliverables index (paths)

| Deliverable | Path(s) |
|---|---|
| DB migrations | `migrations/0004_competitive_reports_and_vin_cache.sql`, `migrations/0005_dealership_automation_settings.sql` |
| Schema additions | `shared/schema.ts` (`dealershipAutomationSettings`, `vinDecodeCache`, `competitiveReportRuns`, `competitiveReportUnits`) |
| Storage layer methods | `server/storage.ts` (`getDealershipAutomationSettings`, `upsertDealershipAutomationSettings`, `getVinDecodeCache`, `upsertVinDecodeCache`, competitive report CRUD) |
| VIN decode router (cheap hybrid) | `server/vin-decode-router.ts` |
| Comps scoring (pure, unit-testable) | `server/comps-scoring.ts`, `server/comps-types.ts` |
| Appraisal comps engine | `server/comps-engine.ts` |
| Competitive report snapshot generator | `server/competitive-report-service.ts` (uses dealership automation settings; condition normalization) |
| API endpoints | `server/routes.ts` (`/api/manager/competitive-report/*`, `/api/manager/appraisal-comps`) |
| Scheduler hook | `server/scheduler.ts` (`startCompetitiveReportScheduler`) + `server/index-dev.ts`, `server/index-prod.ts` |
| In-app dashboard | `client/src/pages/Manager.tsx` (new **Competitive Report** tab) |
| Unit tests | `server/tests/comps-engine.test.ts` (scoring), `server/tests/competitive-report-service.int.test.ts` (snapshot job), `server/tests/dealership-automation-settings.test.ts`, `server/tests/zenrows-fallback.test.ts`, `server/tests/condition-normalization.test.ts` |

---

## Workstream 2 — Competitive Report (every ~48 hours)

### What it does
- Generates an immutable **snapshot run** per dealership containing per-unit market positioning.
- Snapshot cadence: **daily scheduler**, but each dealer is only regenerated when the last snapshot is older than ~48h.
- Default radius: **100km**, selectable in UI: **250/500/1000/National**.

### Required fields in snapshot comps
Stored in `competitive_report_units.comps` JSON array (per unit):
- price
- days on lot (when available from source)
- mileage
- trim
- condition (currently `null` placeholder; see Gap Report)
- accident history (**explicit handling**: `accident_free | reported | unknown`)
- exterior colour
- interior colour

### Scheduler
- Entry point: `startCompetitiveReportScheduler()`
- Schedule: `10 4 * * *` (runs daily at 04:10)
- Enable: set env var `ENABLE_COMPETITIVE_REPORT_SCHEDULER=true`
- External fetches guard:
  - If `LOTVIEW_EXTERNAL_FETCHES !== 'true'`, scheduled job uses cached DB only.

### Manual trigger
- `POST /api/manager/competitive-report/run`

### Dashboard
- Manager UI tab: **Manager → Competitive Report**
- Loads: `GET /api/manager/competitive-report/latest?radiusKm=...`

---

## Workstream 3 — Appraisal Comps Engine

### VIN decode pipeline (cheap hybrid)
File: `server/vin-decode-router.ts`

Behavior:
- **Baseline (default):** NHTSA vPIC decode.
- **Paid enrichment:** MarketCheck VIN decode is only called when:
  1) `LOTVIEW_ALLOW_PAID_APIS=true` and
  2) enrichment triggers fire (missing/low-confidence trim or missing options) and
  3) dealership has `marketcheckKey` configured.
- Cached in `vin_decode_cache` per dealership+VIN.

> Note: paid enrichment is disabled by default to comply with "no external side effects" during development/testing.

### Comps engine
File: `server/comps-engine.ts`

- Canada-only guardrail: requires valid Canadian postal code.
- Uses cached `market_listings` first; refreshes via `MarketAggregationService` only when cache older than 48h.
- Supports **Exact** trim and **Near-trim** mode.
- Returns:
  - sorted comps list
  - score breakdown + explainability reasons
  - summary percentiles + suggested retail price

### API
- `POST /api/manager/appraisal-comps`

Request body:
```json
{
  "vin": "...17 chars...",
  "mileageKm": 60000,
  "postalCode": "V6B 1A1",
  "radiusKm": 100,
  "trimMode": "exact"
}
```

---

## Migrations

### Apply
Use the project’s existing Drizzle migration workflow.

- Migration file: `migrations/0004_competitive_reports_and_vin_cache.sql`

If you apply manually:
- run the SQL against the Postgres DB used by LotView.

### New tables
- `vin_decode_cache`
- `competitive_report_runs`
- `competitive_report_units`

---

## Validation steps (DoD)

### Unit tests
- `npx jest server/tests/comps-engine.test.ts`

### Snapshot job integration-ish test
- `npx jest server/tests/competitive-report-service.int.test.ts`

### Manual end-to-end smoke
1. Ensure dealership has a `postalCode` set.
2. Start server.
3. In Manager UI → Competitive Report → click **Run Now**.
4. Verify snapshot returns rows and dashboard table renders.

---

## Gap Report + Auto-fill (MANDATORY)

### Closed gaps (implemented)
1. **Per-dealership settings persistence** is now implemented via `dealership_automation_settings`:
   - defaults: radius **100km**, cadence **48h**, allow national **true**
   - includes business hours + thresholds (JSON) and ZenRows rate limits
   - API:
     - `GET /api/manager/competitive-report/settings`
     - `PUT /api/manager/competitive-report/settings`
2. **ZenRows explicit fallback** is now wired into `MarketAggregationService` as a final fallback when *all other sources return 0 listings*.
   - controlled per dealership by `zenrowsFallbackEnabled`
   - rate limits are enforced in-process via `zenrowsMaxCallsPerMinute` and `zenrowsMaxCallsPerHour`
3. **Condition normalization strategy** is now implemented in `server/condition-normalization.ts`:
   - source priority order
   - enum mapping: `excellent | good | fair | poor | unknown`
   - UI rule: when `unknown`, the API returns `null/undefined` so the UI should render an em dash and treat it as unknown

### Remaining gaps / known limitations
- **Condition extraction coverage** is best-effort only because `market_listings` does not yet store a first-class condition field.
  - Current implementation attempts extraction from embedded JSON fields (e.g., `specsJson`) when present.
  - If sources do not provide condition, it will remain unknown.

### Auto-fill action (next)
- If/when a primary source provides a stable condition field, add a first-class `market_listings.condition` (and optionally `condition_source`) column and populate it in converters.
- Add a Manager UI panel to edit these dealership automation settings in-app (currently exposed via API).
