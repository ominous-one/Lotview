# LotView Automation Overhaul — MIGRATION + ROLLOUT PLAN (v1)

> **Project:** `C:\Users\omino\projects\lotview`
> 
> **Master plan:** `plans/automation-overhaul/MASTER_PLAN_V1.md`

---

## Deliverables index

| Deliverable | Path | Status |
|---|---|---|
| Migration + rollout plan (this document) | `plans/automation-overhaul/MIGRATION_ROLLOUT_PLAN.md` | ✅ Delivered |

---

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope:** phased rollout plan, data migration steps, backout strategy, and operational gates.
- **Out of scope:** executing migrations in prod.
- **Assumptions:** feature flags available; DB migrations are versioned.
- **Inputs needed:** which pilot dealerships to use (non-blocking for this doc).

### 1) Deliverables checklist
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\MIGRATION_ROLLOUT_PLAN.md`

### 2) Acceptance criteria
- Provides staged rollout for:
  - competitive report,
  - appraisal comps,
  - craigslist assist.
- Includes explicit kill-switches and rollback steps.

### 3) Validation steps
- Re-open file and confirm all phases have entry/exit criteria.

### 4) Gap report + auto-fill
- See end.

### 5) External side effects policy
- None.

---

## 1) Rollout principles
- Ship value fast, but never break dealer operations.
- Default-safe behaviors:
  - If comps vendor fails, show last snapshot and mark stale.
  - If Craigslist flow changes, fail gracefully and offer export/copy mode.
- Everything behind feature flags (global + per-dealer).

---

## 2) Data migrations (planned)

### 2.1 New tables
- `vin_decode_cache`
- `competitive_report_snapshot` (+ child tables if normalized)
- `posting_audit_log`
- Optional: `comp_listing`

### 2.2 Migration steps
1) Add tables with nullable fields and conservative defaults.
2) Deploy backend code that writes/reads both “old” and “new” paths if needed.
3) Backfill where safe:
   - VIN cache: opportunistic (fill on read), not a bulk job.
   - Competitive report: generate first snapshot per dealer on schedule.

### 2.3 Rollback
- DB rollback is rarely safe; plan rollback as:
  - disable features via flags,
  - stop workers,
  - keep tables (no destructive rollback) until stable.

---

## 3) Phased rollout plan

### Phase A — Internal dev / staging
**Entry criteria**
- Migrations applied in dev/staging.
- Unit tests passing for:
  - km radius conversions
  - snapshot idempotency
  - VIN decode router triggers

**Exit criteria**
- Competitive report generates at least 1 snapshot with seeded data.
- Appraisal comps returns results with exact/near-trim toggle.
- Extension Craigslist stepper works in a controlled test account without clicking publish.

---

### Phase B — Pilot dealers (1–3 dealerships)
**Entry criteria**
- Dealer agrees to pilot.
- Craigslist account exists (created by user) and they acknowledge ToS risk.

**Controls**
- Enable per-dealer flags:
  - `competitiveReport.enabled`
  - `appraisalComps.enabled`
  - `craigslistAssist.enabled`

**Success metrics (2-week window)**
- Competitive report: >95% snapshot jobs succeed.
- Dashboard usage: Sales Manager opens report at least 2×/week.
- Craigslist assist: reduction in posting time per unit; <10% flow failures.

**Exit criteria**
- No high-severity bugs.
- Cost within guardrails (vendor calls + ZenRows).

---

### Phase C — Expanded rollout (10–25 dealerships)
- Expand gradually; monitor:
  - vendor error rates
  - cost anomalies
  - ToS friction (blocks/captcha)
- Add optimizations:
  - caching improvements
  - source prioritization by region

---

### Phase D — General availability
- Default enable competitive report for the $499/mo tier.
- Keep Craigslist assist as opt-in per dealer (or per user) due to ToS risk.

---

## 4) Operational controls

### 4.1 Kill switches
- Global kill switch for each feature.
- Per-dealer disable.
- Per-source disable (if a marketplace becomes hostile).

### 4.2 Monitoring
- Worker job success rate, duration, vendor error rates.
- Cost telemetry:
  - vendor calls/day
  - ZenRows requests/day and feature multipliers used

### 4.3 Incident playbooks (minimal)
- Vendor outage: fall back to last report; mark stale; alert.
- Scraping blocks: trip circuit breaker; stop ZenRows escalation; alert.
- Craigslist flow breaks: disable Craigslist assist; keep export/copy mode.

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items
- Specific pilot dealer IDs and target dates.

### Why missing
- Not provided in the task inputs; not blocking for the rollout framework.

### Auto-fill action
- Use placeholders in execution tickets only (not in code): pick 1 internal test dealer + 2 friendly pilots once available.
