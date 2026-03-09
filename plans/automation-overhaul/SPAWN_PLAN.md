# LotView Automation Overhaul — Spawn Plan (Architect → Specialists)

## Purpose
Define which sub-agents to spawn next, what can run in parallel, and the exact DoD contract to embed.

## Parallelizable workstreams
These can run in parallel immediately:
1) **Researcher**: ToS/legal risk + vendor evaluations (Craigslist, VIN decoder, pricing APIs)
2) **Engineer**: Extension implementation plan for Craigslist assisted autopost
3) **Product/Design**: Competitive report format + appraisal UX notes

Critical path dependencies:
- Vendor/API selection for competitive reports and VIN decode impacts engineering tasks.
- Craigslist flow specifics (region/category) impacts final selectors and navigation plan.

---

## Spawn 1 — Researcher (critique + vendor shortlist)
### DoD Contract
#### 0) Scope + assumptions
- **In scope:**
  - Critique `ARCHITECT_PLAN_PACKAGE.md` focusing on alternatives, missing risks, and QA gates.
  - Research viable market data sources for competitive pricing reports (US/Canada).
  - Research VIN decoder vendors and field coverage.
  - Provide a Craigslist automation risk memo (ToS + practical risk).
- **Out of scope:**
  - Any account logins, paid trials, or scraping.
- **Assumptions:**
  - Public web research is allowed.
- **Inputs needed (if any):** none (use assumptions; list questions if needed).

#### 1) Deliverables checklist
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\research\RESEARCHER_CRITIQUE.md` — critique + recommended plan changes
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\extension\CRAIGSLIST_RISK_MEMO.md` — ToS + mitigation + recommended mode
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\reports\DATA_SOURCES_EVAL.md` — API vs scrape comparison, recs, cost/coverage
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\appraisal\VIN_DECODER_EVAL.md` — vendor comparison + recommendation

#### 2) Acceptance criteria
- Each deliverable exists at exact paths.
- Includes citations/links where claims are made.
- Explicitly calls out approval gates.
- No “TBD” placeholders.

#### 3) Validation steps
- Re-open each file and confirm completeness.
- Ensure recommendations map to LotView scale (100 dealers, 10–200 units each).

#### 4) Gap report + auto-fill
- If anything missing, create it unless blocked by unavailable public info; otherwise ask minimal questions.

#### 5) External side effects policy
- No logins, purchases, scraping at scale.

---

## Spawn 2 — Extension Engineer (Craigslist assisted automation implementation plan)
### DoD Contract
#### 0) Scope + assumptions
- **In scope:**
  - Write an implementable spec and file-by-file plan to add Craigslist support to the existing MV3 extension.
  - Define message types, tab navigation, content-script step detection, and image upload strategy.
  - Define logging and user safety gates.
- **Out of scope:**
  - Shipping code changes (unless explicitly requested).
- **Assumptions:**
  - Assisted mode only; user publishes manually.
- **Inputs needed (if any):**
  - Which Craigslist domain(s) at launch (list assumptions if unknown).

#### 1) Deliverables checklist
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\extension\CRAIGSLIST_AUTOMATION_SPEC.md`
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\extension\IMPLEMENTATION_PLAN.md`
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\extension\POSTING_QA_CHECKLIST.md`

#### 2) Acceptance criteria
- Spec includes step map, selector strategy, and explicit failure modes.
- Implementation plan lists exact extension files to modify/create (manifest, driver index, content scripts, popup UI).
- QA checklist is runnable by a non-dev.

#### 3) Validation steps
- Re-open deliverables; ensure they mention existing driver architecture and message channel patterns.

#### 4) Gap report + auto-fill
- Auto-create missing docs unless blocked.

#### 5) External side effects policy
- No Craigslist posting or account access.

---

## Spawn 3 — Product/Design (report + appraisal UX)
### DoD Contract
#### 0) Scope + assumptions
- **In scope:**
  - Define competitive report layout, filters, and export schema.
  - Define appraisal UX flow for VIN decode + comps with explainability.
- **Out of scope:**
  - High-fidelity design.
- **Assumptions:**
  - shadcn/ui and data-dense tables.

#### 1) Deliverables checklist
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\reports\COMPETITIVE_REPORT_SPEC.md`
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\appraisal\APPRAISAL_UX_NOTES.md`

#### 2) Acceptance criteria
- Includes empty/error states.
- Uses dealer language; minimal clicks.

#### 3) Validation steps
- Re-open each file; ensure it is specific and implementation-ready.

#### 4) Gap report + auto-fill
- Auto-create missing sections.

#### 5) External side effects policy
- None.
