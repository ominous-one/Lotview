# LotView Automation Overhaul — SPAWN PLAN (v1)

> **Project:** `C:\Users\omino\projects\lotview`
> 
> **Master plan:** `plans/automation-overhaul/MASTER_PLAN_V1.md`
> 
> **Purpose:** concrete execution spawns (specialist tasks) that produce implementation-ready specs/code artifacts with DoD contracts.

---

## Deliverables index

| Deliverable | Path | Status |
|---|---|---|
| Spawn plan v1 (this document) | `plans/automation-overhaul/SPAWN_PLAN_V1.md` | ✅ Delivered |

---

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope:** define next agent spawns, parallelization, and per-spawn DoD contracts.
- **Out of scope:** running spawns from this file.
- **Assumptions:** engineering will implement in Next.js/Node + MV3 extension.
- **Inputs needed:** vendor choices for API-first; Craigslist account creation decision.

### 1) Deliverables checklist
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\SPAWN_PLAN_V1.md`

### 2) Acceptance criteria
- Spawn tasks are grouped by parallel tracks.
- Each spawn includes:
  - scope/out-of-scope
  - exact output file paths
  - acceptance criteria + validation steps
  - explicit approval gates

### 3) Validation steps
- Re-open file and spot-check at least 2 spawns for complete DoD sections.

### 4) Gap report + auto-fill
- See end.

### 5) External side effects policy
- No external side effects without explicit user approval.

---

## 1) Parallelization map

**Can run in parallel now (no external side effects):**
- Backend schemas + DB migrations planning
- Web app dashboard UI scaffolding (mocked data)
- VIN decode router implementation (baseline vPIC)
- Extension Craigslist stepper scaffolding + fixtures

**Gated by approval/inputs:**
- Craigslist real-flow testing (needs dealer account + user approval gate)
- API vendor connector integration (needs vendor choice + keys)
- Scraping at scale (needs explicit approval)

---

## 2) Recommended spawn sequence (v1)

### Spawn 1 — Backend data contracts + DB migrations (foundations)
**Owner agent:** `backend`

**DoD Contract**
- **0) Scope + assumptions**
  - In scope: define schemas and implement DB migrations for caches/snapshots/audit logs.
  - Out of scope: vendor integration.
  - Assumptions: Postgres.
  - Inputs needed: none.
- **1) Deliverables checklist**
  - [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\schemas\POSTING_JOB.schema.json`
  - [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\schemas\COMPETITIVE_REPORT.schema.json`
  - [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\schemas\VEHICLE_SPEC_NORMALIZED.schema.json`
  - [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\schemas\COMP_LISTING.schema.json`
  - [ ] DB migrations in repo (exact path per codebase conventions):
    - `vin_decode_cache`
    - `competitive_report_snapshot` (+ child)
    - `posting_audit_log`
- **2) Acceptance criteria**
  - Schemas include required competitive report fields (including accident history + colors with `unknown` allowed).
  - Migrations apply cleanly in dev.
- **3) Validation steps**
  - Validate schemas with example payloads.
  - Apply migrations to a fresh dev DB.
- **4) Gap report + auto-fill**
  - If repo migration path is unclear, output a single question or search the repo and choose the established pattern.
- **5) External side effects**
  - None.

---

### Spawn 2 — Competitive report generator (API-first) + dashboard (mock-first)
**Owner agent:** `backend+frontend`

**DoD Contract**
- **0) Scope + assumptions**
  - In scope: implement report snapshot generation pipeline with mocked vendor connector; build Sales Manager dashboard wired to snapshot table.
  - Out of scope: real vendor keys.
  - Assumptions: 48h cadence.
- **1) Deliverables checklist**
  - [ ] Backend job: `src/server/jobs/competitiveReport.ts` (or established path)
  - [ ] API route(s) to fetch latest snapshot
  - [ ] UI pages/components for dashboard
  - [ ] CSV export
- **2) Acceptance criteria**
  - Snapshot is idempotent.
  - UI shows required fields and uses `unknown` explicitly.
- **3) Validation steps**
  - Seed DB with a fake snapshot and render UI.
  - Run job twice and verify no duplicates.
- **4) Gap report + auto-fill**
  - Create any missing fixtures automatically.
- **5) External side effects**
  - No real external calls.

---

### Spawn 3 — VIN decode router (cheap hybrid) + golden VIN tests
**Owner agent:** `data/backend`

**DoD Contract**
- **0) Scope + assumptions**
  - In scope: baseline vPIC integration, caching, trigger logic for paid enrichment, and golden VIN test harness.
  - Out of scope: purchasing a paid decoder.
- **1) Deliverables checklist**
  - [ ] VIN router module + cache reads/writes
  - [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\testdata\golden_vins.csv`
  - [ ] Unit tests for deterministic behavior
- **2) Acceptance criteria**
  - Baseline decode always works.
  - Exact-trim default logic supported; near-trim toggle supported.
- **3) Validation steps**
  - Run tests.
- **4) Gap report + auto-fill**
  - If exact trim cannot be confirmed from baseline, ensure confidence is low and enrichment trigger fires (without calling paid API).
- **5) External side effects**
  - Only NHTSA vPIC (free) unless disallowed; otherwise mock.

---

### Spawn 4 — Extension: Craigslist assisted autopost stepper + publish prevention + fallback export
**Owner agent:** `extension`

**Approval gate note:** Real testing requires a Craigslist dealer account (see `OPEN_QUESTIONS_BLOCKERS.md`).

**DoD Contract**
- **0) Scope + assumptions**
  - In scope: craigslist driver + content script that fills forms and stops at review; never publishes; export/copy fallback.
  - Out of scope: unattended batch posting.
- **1) Deliverables checklist**
  - [ ] `extension/src/drivers/craigslist.ts`
  - [ ] `extension/src/content/craigslist.ts`
  - [ ] `extension/src/config/craigslistAreas.ts` (Tri-Cities/Surrey/Whistler)
  - [ ] UI: export/copy post package
  - [ ] DOM fixture tests for step detection
- **2) Acceptance criteria**
  - Extension never clicks publish.
  - Works end-to-end through review step for at least one region.
- **3) Validation steps**
  - Manual QA in dev extension.
  - Run fixture tests.
- **4) Gap report + auto-fill**
  - If any step selectors are unknown, add robust selectors and log diagnostics.
- **5) External side effects**
  - No account creation without explicit approval.

---

### Spawn 5 — Vendor connector implementation (after vendor decision)
**Owner agent:** `backend`

**DoD Contract**
- **0) Scope + assumptions**
  - In scope: integrate chosen vendor API for comps/listings; implement km radius support; map to normalized schemas.
  - Out of scope: signing contracts (user-owned).
  - Inputs needed: vendor selection + API keys (explicit approval).
- **1) Deliverables checklist**
  - [ ] Vendor client module(s)
  - [ ] Normalization mapping
  - [ ] Integration tests with mocked responses
- **2) Acceptance criteria**
  - Meets radii: 100/250/500/1000/national (Canada-only).
  - Emits required report fields with provenance and `unknown` where missing.
- **3) Validation steps**
  - Run tests; run report job in staging.
- **4) Gap report + auto-fill**
  - If accident history cannot be provided, ensure schema supports `unknown` and UI displays it.
- **5) External side effects**
  - No vendor calls without explicit approval.

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items
- None (this file is a plan for spawns; implementation artifacts are owned by those spawns).

### Why missing
- N/A

### Auto-fill action
- N/A
