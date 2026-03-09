# LotView Automation Overhaul — SPAWN PLAN (v1.2)

> **Project:** `C:\Users\omino\projects\lotview`
>
> **Master plan:** `plans/automation-overhaul/MASTER_PLAN_V1_2.md`
> **Deliverable matrix:** `plans/automation-overhaul/DELIVERABLE_MATRIX_V1_2.md`
>
> **Purpose:** define the exact next spawns (agents/roles) to execute v1.2 with world-class design quality gates.

---

## Deliverables index (this plan)

| Deliverable | Path |
|---|---|
| Spawn plan v1.2 (this document) | `plans/automation-overhaul/SPAWN_PLAN_V1_2.md` |

---

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope:** spawns for designer + reviewer + engineers with explicit DoD contracts and file outputs.
- **Out of scope:** running external automation or contacting vendors.
- **Assumptions:** parallel execution is encouraged; reviewer gates block merges/shipping until passed.

### 1) Deliverables checklist
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\SPAWN_PLAN_V1_2.md`

### 2) Acceptance criteria
- Includes:
  - a parallelized sequence (what can run in parallel),
  - explicit design deliverables early,
  - explicit reviewer gates that enforce world-class UX acceptance criteria,
  - explicit references to exact paths from `DELIVERABLE_MATRIX_V1_2.md`.

### 3) Validation steps
- Re-open file and confirm each spawn includes a DoD contract with explicit paths and a Gap Report requirement.

### 4) Gap report + auto-fill
- See end.

### 5) External side effects policy
- No external actions.

---

## 0) Orchestration overview (parallel-first)

### Parallel Track A (START IMMEDIATELY): Design system + key UX
- **Spawn:** `designer`
- **Spawn:** `reviewer` (design/UX gatekeeper)

### Parallel Track B (START IMMEDIATELY): Spec patch for Marketplace v1.2 semantics
- **Spawn:** `architect` or `spec-writer` (if separate) to write Marketplace addendum.

### Parallel Track C (AFTER Track A artifacts exist): Engineering
- **Spawn:** `fe` for Sales Manager web app screens (dashboard, inbox, settings, audit).
- **Spawn:** `ext` for FB inbox ingestion + send/typing simulation; and Craigslist review overlay.
- **Spawn:** `be` for schemas/migrations/endpoints/policy engine.
- **Spawn:** `qa` for fixture tests + DOM contract tests.

**Rule:** engineering spawns must reference the design exports and pass reviewer gates before being considered “done”.

---

## Spawn 1 — DESIGNER (world-class UI + exports)

### DoD Contract (Standard)

#### 0) Scope + assumptions
- **In scope**
  - Create design system documentation (tokens + components) compatible with Tailwind + shadcn/ui.
  - Produce key UX screen designs (wireframes acceptable early) for:
    - Craigslist assist review
    - Competitive report dashboard
    - Appraisal/comps UI
    - FB Sales Inbox + Automation Settings
  - Export the screens as **local PNG/PDF** to repo paths.
- **Out of scope**
  - Writing production UI code.
- **Assumptions**
  - Follow `BRAND.md` palette/typography constraints.
  - Optimize for dealership staff speed and clarity.

#### 1) Deliverables checklist
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\design\v1_2\README.md` — index + (optional) Figma links.
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\design\v1_2\design-system\TOKENS.md`
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\design\v1_2\design-system\COMPONENTS.md`
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\design\v1_2\exports\competitive-report-dashboard.png` (or `.pdf`)
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\design\v1_2\exports\appraisal-comps.png` (or `.pdf`)
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\design\v1_2\exports\craigslist-assist-review.png` (or `.pdf`)
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\design\v1_2\exports\sales-inbox.png` (or `.pdf`)
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\design\v1_2\exports\automation-settings.png` (or `.pdf`)

#### 2) Acceptance criteria
- Designs meet `DESIGN_BRIEF_V1_2.md` world-class acceptance criteria.
- Exports are readable, annotated with key states (loading/empty/error).
- FB flows reflect v1.2 defaults:
  - **auto-send default ON** but constrained,
  - visible kill switch,
  - typing simulation indicator.

#### 3) Validation steps
- Open each export and verify:
  - control labels are legible,
  - primary action is obvious,
  - key safety controls exist.

#### 4) Gap report + auto-fill
- If any export is missing, create a wireframe placeholder export (PNG) rather than leaving blank.

#### 5) External side effects policy
- No Figma required; optional links allowed.

---

## Spawn 2 — REVIEWER (world-class UX gatekeeper)

### DoD Contract (Standard)

#### 0) Scope + assumptions
- **In scope**
  - Create reviewer checklists used to enforce:
    - world-class UX acceptance criteria,
    - design parity (implementation matches exports),
    - safety/audit/killswitch visibility for automation.
  - Review designer artifacts for completeness and gaps.
- **Out of scope**
  - Writing code.

#### 1) Deliverables checklist
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\reviews\WORLD_CLASS_UX_REVIEW_CHECKLIST_V1_2.md`
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\reviews\DESIGN_PARITY_GATE_V1_2.md`
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\reviews\REVIEW_NOTES_DESIGN_V1_2.md` — findings + required fixes (if any).

#### 2) Acceptance criteria
- Checklists are objective (pass/fail), not subjective.
- Review notes list actionable gaps and map each to a file or screen.

#### 3) Validation steps
- Confirm checklists reference `DESIGN_BRIEF_V1_2.md` criteria.

#### 4) Gap report + auto-fill
- If a checklist item is ambiguous, rewrite it to be measurable.

---

## Spawn 3 — SPEC PATCH (Marketplace v1.2 addendum)

### DoD Contract (Standard)

#### 0) Scope + assumptions
- **In scope:** write a v1.2 addendum that patches the v1.1 Marketplace spec mismatches.
- **Out of scope:** editing production code.

#### 1) Deliverables checklist
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\FB_MARKETPLACE_REPLIES_SPEC_V1_2_ADDENDUM.md`

#### 2) Acceptance criteria
- Addendum explicitly specifies:
  - auto-send default ON,
  - name + vehicle confidence gating,
  - typing simulation parameters + abort conditions,
  - allowlist/denylist + anti-loop + rate limits,
  - required UX screens (settings + audit).

#### 3) Validation steps
- Cross-check addendum against `RESEARCHER_CRITIQUE_V1_1.md` decisions.

---

## Spawn 4 — ENGINEERING (only after Design exports exist)

> Engineering spawns MUST attach screenshots matching the design exports and pass reviewer gates.

### 4A) FE (Sales Manager web app)
- Implement Competitive Report dashboard, Appraisal/Comps UI, Sales Inbox, Automation Settings, Audit Console.

### 4B) EXT (Chrome extension)
- Implement Craigslist assist review overlay.
- Implement FB inbox ingestion (DOM bridge).
- Implement outbound send driver with typing simulation.

### 4C) BE (Backend)
- Implement schemas/migrations.
- Implement ingestion endpoints.
- Implement two-stage reply generation + policy evaluator.

### 4D) QA
- Implement conversation fixtures and golden tests.
- Implement DOM contract tests.

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items
- This spawn plan does not include every engineering spawn’s full DoD contracts (to avoid duplicating the matrix), but it does specify the required gating and core deliverables.

### Why missing
- Engineering scopes will be split into multiple spawns keyed off the design exports and addendum.

### Auto-fill action
- When spawning FE/BE/EXT/QA, copy the DoD contract template from `C:\Users\omino\.openclaw\workspace\process\DELIVERABLES-DOD.md` and include explicit file outputs and reviewer gates for each spawn.
