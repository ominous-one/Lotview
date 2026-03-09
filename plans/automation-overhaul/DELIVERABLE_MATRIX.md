# LotView Automation Overhaul — Deliverable Matrix

> Owner agents are suggestions for the main agent to spawn.

| Area | Deliverable | Owner | File path | Acceptance criteria (summary) |
|---|---|---:|---|---|
| Overall | System master spec (revised after Researcher critique) | architect | `plans/automation-overhaul/ARCHITECT_PLAN_PACKAGE_v1.md` | Addresses critique, no TBDs, includes approvals + QA gates |
| Extension | Craigslist automation spec (assisted mode) | engineer + architect | `plans/automation-overhaul/extension/CRAIGSLIST_AUTOMATION_SPEC.md` | Step map, selectors strategy, fallback behavior, logging, test checklist |
| Extension | Manifest/content-script implementation plan | engineer | `plans/automation-overhaul/extension/IMPLEMENTATION_PLAN.md` | Exact files to edit, message types, permissions, test plan |
| Extension | Craigslist ToS/legal risk memo + mitigation | researcher | `plans/automation-overhaul/extension/CRAIGSLIST_RISK_MEMO.md` | Identifies ToS constraints, safe-mode design, approval gates |
| Extension | QA checklist (Facebook + Craigslist) | qa | `plans/automation-overhaul/extension/POSTING_QA_CHECKLIST.md` | Repeatable manual steps, expected results, rollback steps |
| Reports | Competitive report functional spec | product | `plans/automation-overhaul/reports/COMPETITIVE_REPORT_SPEC.md` | Data definitions, UI wire outline, export format, acceptance tests |
| Reports | Data sources evaluation (API vs scrape) | researcher | `plans/automation-overhaul/reports/DATA_SOURCES_EVAL.md` | Cost/coverage table, recommendation, fallback plan, approval points |
| Reports | Scheduling + ops runbook | engineer | `plans/automation-overhaul/reports/SCHEDULER_RUNBOOK.md` | Cron strategy, retries, alerts, idempotency, validation steps |
| Appraisal | VIN decode vendor evaluation | researcher | `plans/automation-overhaul/appraisal/VIN_DECODER_EVAL.md` | Vendors compared, fields coverage, pricing, recommendation |
| Appraisal | Comps engine technical spec | architect + engineer | `plans/automation-overhaul/appraisal/COMPS_ENGINE_SPEC.md` | Pipeline, schemas, scoring, explainability, QA, UI touchpoints |
| Appraisal | UI/UX integration notes + wireframes (low-fi) | product/design | `plans/automation-overhaul/appraisal/APPRAISAL_UX_NOTES.md` | User flows, screen sections, empty/error states |
| Governance | Approval points + external side effects checklist | architect | `plans/automation-overhaul/APPROVAL_POINTS.md` | Clear “must ask” items and what can proceed |

## Notes
- This matrix lists **next deliverables** required to complete the overhaul work, beyond the initial architect package (v0).
- The mandatory Architect ↔ Researcher critique loop produces `ARCHITECT_PLAN_PACKAGE_v1.md` after critique.
