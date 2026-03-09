# LotView Automation Overhaul — DELIVERABLE MATRIX (v1.2)

> **Project:** `C:\Users\omino\projects\lotview`
>
> **Master plan:** `plans/automation-overhaul/MASTER_PLAN_V1_2.md`
>
> **Supersedes:** `plans/automation-overhaul/DELIVERABLE_MATRIX_V1_1.md`
>
> **New in v1.2:** explicit **design system** and **world-class UX** artifacts (with required local exports), plus reviewer quality gates.

---

## Deliverables index (this file)

| Deliverable | Path | Status |
|---|---|---|
| Deliverable matrix v1.2 (this document) | `plans/automation-overhaul/DELIVERABLE_MATRIX_V1_2.md` | ✅ Delivered |

---

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope:** enumerate v1.2 implementation deliverables across design + extension + backend + web app + QA; include explicit world-class UX gates.
- **Out of scope:** writing production code in this matrix.
- **Assumptions:** Next.js + Postgres; Tailwind + shadcn/ui; MV3 extension.
- **Inputs needed (if any):** none to publish this matrix.

### 1) Deliverables checklist
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\DELIVERABLE_MATRIX_V1_2.md`

### 2) Acceptance criteria
- Matrix includes per-row: deliverable, owner role, exact artifact path, dependencies, acceptance criteria, validation steps.
- Includes explicit design artifacts (docs + exports) with exact repo paths.
- Includes explicit gates for:
  - FB auto-send default ON (safety envelope, name/vehicle confidence, typing simulation)
  - world-class UI acceptance criteria and reviewer enforcement

### 3) Validation steps
- Re-open file and confirm no “TBD” in required design/UX deliverables.

### 4) Gap report + auto-fill
- See end.

### 5) External side effects policy
- Planning only.

---

## Matrix

**Legend (Owner):**
- **architect** = systems/plan/spec
- **designer** = product/UI design + exports
- **reviewer** = quality gatekeeper (design + UX + safety)
- **ext** = extension engineer
- **be** = backend engineer
- **fe** = web app engineer
- **data** = data/ML engineer
- **qa** = QA/test engineer

| # | Workstream | Deliverable | Owner | Artifact / Path | Depends on | Acceptance criteria (objective) | Validation steps |
|---:|---|---|---|---|---|---|---|
| 1 | Cross-cutting | Master plan v1.2 | architect | `plans/automation-overhaul/MASTER_PLAN_V1_2.md` | — | Reflects critique decisions; includes world-class UX gates | Open file; confirm §2 (4D constraints) + §3 |
| 2 | Cross-cutting | Deliverable matrix v1.2 | architect | `plans/automation-overhaul/DELIVERABLE_MATRIX_V1_2.md` | #1 | All workstreams covered incl. design artifacts; objective gates | Scan for “TBD/TODO” |
| 3 | Cross-cutting | Spawn plan v1.2 | architect | `plans/automation-overhaul/SPAWN_PLAN_V1_2.md` | #1–2 | Includes early `designer` and `reviewer` gates | Open file; ensure DoD embedded |
| 4 | Cross-cutting | Design brief v1.2 | architect/designer | `plans/automation-overhaul/DESIGN_BRIEF_V1_2.md` | — | Defines world-class criteria and required UX exports | Open file; confirm acceptance criteria section |
| 5 | **Design system** | Design artifacts index | designer | `plans/automation-overhaul/design/v1_2/README.md` | #4 | Links to exports + tokens + components + Figma (optional) | Open file; ensure all paths resolve |
| 6 | **Design system** | Tokens spec | designer | `plans/automation-overhaul/design/v1_2/design-system/TOKENS.md` | #4 | Typography/spacing/color/motion tokens defined; no TBD | Open file; verify token tables |
| 7 | **Design system** | Components + interaction patterns | designer | `plans/automation-overhaul/design/v1_2/design-system/COMPONENTS.md` | #4 | Inventory covers tables, inbox, toggles, audit log | Open file; verify list completeness |
| 8 | **UX exports** | Competitive report dashboard export | designer | `plans/automation-overhaul/design/v1_2/exports/competitive-report-dashboard.png` (or `.pdf`) | #5 | Includes loading/empty/error states annotations | Open image/PDF |
| 9 | **UX exports** | Appraisal + comps export | designer | `plans/automation-overhaul/design/v1_2/exports/appraisal-comps.png` (or `.pdf`) | #5 | Shows VIN confidence, radius selector, exact/near toggle | Open image/PDF |
| 10 | **UX exports** | Craigslist assist review export | designer | `plans/automation-overhaul/design/v1_2/exports/craigslist-assist-review.png` (or `.pdf`) | #5 | Shows “LotView will not click Publish” and failure states | Open image/PDF |
| 11 | **UX exports** | Sales Inbox export | designer | `plans/automation-overhaul/design/v1_2/exports/sales-inbox.png` (or `.pdf`) | #5 | Shows SLA, assignment, state, auto-send visible | Open image/PDF |
| 12 | **UX exports** | Automation settings export | designer | `plans/automation-overhaul/design/v1_2/exports/automation-settings.png` (or `.pdf`) | #5 | Includes typing sim controls, allowlist/denylist, rate limits, kill switch | Open image/PDF |
| 13 | **Reviewer gate** | World-class UX review checklist | reviewer | `plans/automation-overhaul/reviews/WORLD_CLASS_UX_REVIEW_CHECKLIST_V1_2.md` | #4 | Checklist matches §4 of design brief; pass/fail rubric | Open file; ensure measurable checks |
| 14 | Spec patch | Marketplace spec v1.2 patch/addendum | architect | `plans/automation-overhaul/FB_MARKETPLACE_REPLIES_SPEC_V1_2_ADDENDUM.md` | #1, critique | Eliminates mismatch: auto-send ON default + name/vehicle + typing sim | Open file; verify no contradictions |
| 15 | Data contracts | ConversationThread schema | architect/be | `plans/automation-overhaul/schemas/CONVERSATION_THREAD.schema.json` | #14 | Includes name/vehicle confidence fields + automation policy refs | Validate JSON + example payload |
| 16 | Data contracts | ConversationMessage schema | architect/be | `plans/automation-overhaul/schemas/CONVERSATION_MESSAGE.schema.json` | #14 | Supports safety flags + dedupe invariants | Validate JSON + example |
| 17 | Data contracts | ReplySuggestion schema | architect/be | `plans/automation-overhaul/schemas/REPLY_SUGGESTION.schema.json` | #14 | Includes policy report + allow/deny reasons + “why” | Validate JSON + example |
| 18 | **NEW policy** | Auto-send policy config schema | architect/be | `plans/automation-overhaul/schemas/FB_AUTOSEND_POLICY.schema.json` | #14 | Encodes allowlist, thresholds, rate limits, hours, typing sim | Validate JSON + example |
| 19 | Backend | Conversation store migrations | be | `db/migrations/*_conversation_*.sql` (or ORM) | #15–#18 | Indexed inbox queries; idempotent ingestion | Run migrations; seed, query |
| 20 | Extension | Inbox ingestion (DOM bridge) | ext | `extension/src/drivers/fbInbox.ts` + `extension/src/content/fbInbox.ts` | #14, #19 | Captures threads/messages; dedupes; drift detection telemetry | Manual QA + fixture DOM tests |
| 21 | Backend | Ingestion API endpoints | be | `src/server/api/fb/inbox/*` | #19–#20 | Auth, schema validation, idempotent writes | REST tests; duplicate safe |
| 22 | Backend | Two-stage reply generator + policy evaluator | be/data | `src/server/ai/replies/*` | #14, #17–#18 | Generates reply + deterministic policy veto | Unit tests with golden fixtures |
| 23 | Extension | Outbound send driver w/ typing simulation | ext | `extension/src/drivers/fbSend.ts` + typing module | #18, #22 | Implements incremental typing, jitter, abort conditions | Run simulated sends; verify timing ranges |
| 24 | Web app | Sales Inbox UI | fe | `src/app/(sales)/inbox/*` | #21–#22, design exports | Matches exports; fast; accessible | Manual QA with seeded data |
| 25 | Web app | Automation settings (GM) UI | fe | `src/app/(gm)/automation-settings/*` | #18, design exports | Exposes allowlist/thresholds/hours/kill switch | Manual QA; toggles persist |
| 26 | Web app | Audit console UI | fe | `src/app/(sales)/audit/*` | #22 | Searchable outbound logs with “why” | Manual QA; verify filter accuracy |
| 27 | Cross-cutting | Kill switches + feature flags | be | `src/server/config/flags.ts` | — | Global + per-dealer flags for 4A/4B/4D | Toggle in dev; verify behavior |
| 28 | QA | Conversation fixture suite | qa | `plans/automation-overhaul/testdata/fb_convo_fixtures/*` | #14 | Includes name/vehicle constraints + injection + DNC | Run tests; review diffs |
| 29 | QA | DOM contract tests | qa/ext | `extension/tests/dom-contract/*` | #20 | Detects selector drift early; alerts instead of silent fail | Run tests on snapshots |
| 30 | Reviewer gate | Design-to-implementation parity check | reviewer | PR checklist item (doc) `plans/automation-overhaul/reviews/DESIGN_PARITY_GATE_V1_2.md` | #5–#12 | UI matches exports for key flows; exceptions documented | Reviewer compares screenshots |

---

## Approval gates (must be enforced)
- Craigslist dealer account creation: explicit approval.
- Paid vendor onboarding/API keys: explicit approval.
- Scraping scale-up to new sources: explicit approval + ToS review.
- **Marketplace messaging:** any real-message testing requires explicit approval; auto-send must be constrained by policy envelope.

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items
- All rows beyond #1–#4 are implementation/design artifacts not created by this planning task.

### Why missing
- This file is a matrix; owners are defined for subsequent spawns.

### Auto-fill action
- `SPAWN_PLAN_V1_2.md` must spawn `designer` + `reviewer` immediately so that engineering starts with validated, world-class UX exports and gates.
