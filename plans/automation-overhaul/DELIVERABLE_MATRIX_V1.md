# LotView Automation Overhaul — DELIVERABLE MATRIX (v1)

> **Project:** `C:\Users\omino\projects\lotview`
> 
> **Master plan:** `plans/automation-overhaul/MASTER_PLAN_V1.md`

---

## Deliverables index (this file)

| Deliverable | Path | Status |
|---|---|---|
| Deliverable matrix v1 (this document) | `plans/automation-overhaul/DELIVERABLE_MATRIX_V1.md` | ✅ Delivered |

---

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope:** enumerate all implementation deliverables for v1 across extension + backend + web app + data.
- **Out of scope:** writing production code in this task; signing vendors.
- **Assumptions:** Next.js + Postgres; MV3 extension exists.
- **Inputs needed (if any):** none to produce this matrix.

### 1) Deliverables checklist
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\DELIVERABLE_MATRIX_V1.md`

### 2) Acceptance criteria
- Matrix includes: deliverable, owner role/agent, exact path/artifact, dependencies, acceptance criteria, validation steps.
- Includes explicit approval gates for external side effects.

### 3) Validation steps
- Re-open file and confirm all rows have objective acceptance + validation.

### 4) Gap report + auto-fill
- See end.

### 5) External side effects policy
- Planning only.

---

## Matrix

**Legend (Owner):**
- **architect** = systems/plan/spec
- **ext** = extension engineer
- **be** = backend engineer
- **fe** = web app engineer
- **data** = data/ML engineer
- **qa** = QA/test engineer

| # | Workstream | Deliverable | Owner | Artifact / Path | Depends on | Acceptance criteria (objective) | Validation steps |
|---:|---|---|---|---|---|---|---|
| 1 | Cross-cutting | Technical architecture v1 | architect | `plans/automation-overhaul/TECH_ARCH_V1.md` | — | Data flows + storage + rate limits + approval gates documented; aligns with constraints | Open file; spot-check constraints and tables | 
| 2 | Cross-cutting | Migration + rollout plan | architect | `plans/automation-overhaul/MIGRATION_ROLLOUT_PLAN.md` | — | Phased rollout, kill switches, backout, monitoring defined | Open file; confirm staged rollout + rollback steps |
| 3 | Cross-cutting | Open blockers list (minimal) | architect | `plans/automation-overhaul/OPEN_QUESTIONS_BLOCKERS.md` | — | Only truly blocking questions; small list | Open file; count items; verify all are blocking |
| 4 | Data contracts | PostingJob schema (normalized) | architect/be | `plans/automation-overhaul/schemas/POSTING_JOB.schema.json` | Master plan | Schema includes craigslist+facebook fields, audit fields; versioned | JSON validates; sample job passes |
| 5 | Data contracts | CompetitiveReport schema | architect/be | `plans/automation-overhaul/schemas/COMPETITIVE_REPORT.schema.json` | Vendor decision | Includes required fields (price, DOM, mileage, trim, condition, accident history, colors) + unknowns | Validate with example payload |
| 6 | Data contracts | VehicleSpecNormalized schema | architect/data | `plans/automation-overhaul/schemas/VEHICLE_SPEC_NORMALIZED.schema.json` | — | Includes trim confidence + options list + sources | Validate JSON + example |
| 7 | Data contracts | CompListing schema | architect/data | `plans/automation-overhaul/schemas/COMP_LISTING.schema.json` | — | Includes listing source + required report fields + provenance | Validate JSON + example |
| 8 | Backend | DB migration: vin_decode_cache | be | `db/migrations/*_vin_decode_cache.sql` (or ORM equivalent) | #6 | Cache by VIN; TTL; source + confidence; encrypted fields policy documented | Run migrations in dev; insert/select |
| 9 | Backend | DB migration: competitive_report_snapshot | be | `db/migrations/*_competitive_report_snapshot.sql` | #5 | Snapshot table stores params, generatedAt, dealerId, radiusKm, summary, blob/JSON | Run migrations; create snapshot |
| 10 | Backend | DB migration: competitive_comp_listings (optional normalized store) | be/data | `db/migrations/*_comp_listings.sql` | #7 | Stores normalized comps with source/provenance + dedupe keys | Run migrations; add records |
| 11 | Backend | DB migration: posting_audit_log | be | `db/migrations/*_posting_audit_log.sql` | #4 | Logs assisted autopost attempts; no credentials stored | Run migrations; write log entry |
| 12 | Backend | Rate limiting + caching module | be | `src/server/lib/rateLimit.ts` + `cache.ts` (paths TBD) | — | Per-domain token bucket + backoff + circuit breaker; cache TTL rules | Unit tests for 429/403 + backoff |
| 13 | Backend | Vendor client (API-first) | be | `src/server/vendors/<vendor>.ts` | Vendor decision | Supports comps search in km radii; maps to normalized schema | Integration tests with mocked responses |
| 14 | Backend | ZenRows fetcher fallback | be | `src/server/vendors/zenrows.ts` | ZenRows config exists | Escalation ladder (basic→premium→js) + cost caps + cache | Simulate block pages; assert fallback triggered |
| 15 | Backend | Report generator worker (48h) | be | `src/server/jobs/competitiveReport.ts` | #9, #13 | Generates per-dealer snapshot; idempotent; stores report | Run job twice; verify no duplicate snapshots |
| 16 | Web app | Sales Manager dashboard (report) | fe | `src/app/(sales)/competitive-report/*` | #15 | In-app dashboard shows latest snapshot, drilldowns, CSV export | Manual QA with seeded data |
| 17 | Web app | Report detail UI includes required comp fields | fe | same as #16 | #5 schema | UI shows: price, DOM, mileage, trim, condition, accident history, ext/int color; shows `unknown` when missing | Visual QA; snapshot test |
| 18 | Data/logic | Comps scoring engine (Canada-only) | data/be | `src/server/comps/score.ts` | #6, #7 | Deterministic scoring; exact-trim default; near-trim toggle | Unit tests: exact vs near-trim ranking |
| 19 | Web app | Appraisal comps UX controls | fe | `src/app/(sales)/appraisal/*` | #18 | Radius selectable; trim mode toggle; no mileage tolerance input | Manual QA: ensure no mileage tolerance setting |
| 20 | Data/logic | VIN decode router (cheap hybrid) | be/data | `src/server/vin/router.ts` | #8, vendor decisions | Always baseline decode; paid enrichment only on triggers; caches results | Unit tests: trigger rules + caching |
| 21 | QA | Golden VIN test set + harness | qa/data | `plans/automation-overhaul/testdata/golden_vins.csv` + `tests/vinDecode.test.ts` | #20 | Covers makes/years; expected trims; asserts confidence behavior | Run tests; review failures |
| 22 | Extension | Craigslist driver (background orchestration) | ext | `extension/src/drivers/craigslist.ts` | #4 | Opens correct domain, injects content script, sends fill message | Manual run in dev extension |
| 23 | Extension | Craigslist content script stepper | ext | `extension/src/content/craigslist.ts` | #22 | Detects steps; fills fields; uploads images; stops before publish | Manual QA + DOM fixture tests |
| 24 | Extension | Craigslist area mapping table + UI prompt | ext/fe | `extension/src/config/craigslistAreas.ts` | Regions decision | Tri-Cities/Surrey/Whistler supported; fallback prompt if unknown | Manual QA selecting each area |
| 25 | Extension | Fallback export mode (copy/open page) | ext/fe | `extension/src/ui/ExportPostPackage.tsx` (TBD) | ToS risk posture | Allows copy of title/body + download images; opens posting page | Manual QA: export works |
| 26 | Extension | Publish prevention gate | ext/qa | tests + runtime checks | — | Extension never triggers final publish click; blocks any attempt | Static scan + manual QA |
| 27 | Ops | Feature flags + kill switch | be | `src/server/config/flags.ts` | — | Can disable craigslist assist and/or scraping per dealer globally | Toggle in dev; verify behavior |
| 28 | Ops | Observability dashboards + alerts | be/ops | docs + provider config | Worker exists | Alerts on vendor failures/cost spikes/job failures | Induce failure; verify alert triggers |
| 29 | Compliance | Craigslist compliance decision record (CDR) | architect | `plans/automation-overhaul/COMPLIANCE_CRAIGSLIST_CDR.md` | Legal input | Records ToS risk, posture, fallback mode, go/no-go | Open file; verify decision captured |
| 30 | Approvals | Approval gate doc (account creation + paid vendors) | architect | `plans/automation-overhaul/APPROVAL_GATES.md` | — | Explicitly lists all external side effects requiring user approval | Review list completeness |

---

## Approval gates (must be enforced)
- Craigslist dealer account creation: user creates accounts OR explicit approval (external side effect).
- Paid vendor onboarding/API keys: explicit approval.
- Scraping scale-up to new sources: explicit approval + ToS review.

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items
- The matrix references additional artifacts not created by this planning task (schemas, migrations, code). They are **intentionally** not created here.

### Why missing
- This task is to publish the revised master plan + matrix + spawn plan and architecture docs; implementation artifacts are for execution tasks.

### Auto-fill action
- The spawn plan (`plans/automation-overhaul/SPAWN_PLAN_V1.md`) includes concrete next spawns to create the referenced artifacts with DoD contracts.
