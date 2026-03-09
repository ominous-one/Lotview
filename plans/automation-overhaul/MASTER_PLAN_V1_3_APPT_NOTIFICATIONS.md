# LotView Automation Overhaul — MASTER PLAN (v1.3)

> **Project:** `C:\Users\omino\projects\lotview`
>
> **Supersedes / extends:**
> - `plans/automation-overhaul/MASTER_PLAN_V1_2.md`
>
> **Purpose (v1.3):**
> 1) Add a new workstream: **Appointment Booking + Notifications** (AI books appointments directly, with mandatory Sales Manager notification).
> 2) Strengthen **pricing/appraisal differentiation** so LotView is “better than vAuto” for used-car pricing/appraisals.
>
> **External side effects policy:** planning/spec only (no sending real messages, no writing production code, no vendor onboarding).

---

## Deliverables index (v1.3 delta plan)

| Deliverable | Path |
|---|---|
| Master plan v1.3 (this document) | `plans/automation-overhaul/MASTER_PLAN_V1_3_APPT_NOTIFICATIONS.md` |
| Deliverable matrix v1.3 | `plans/automation-overhaul/DELIVERABLE_MATRIX_V1_3_APPT_NOTIFICATIONS.md` |
| Appointment booking spec | `plans/automation-overhaul/APPOINTMENT_BOOKING_SPEC.md` |
| Notifications spec | `plans/automation-overhaul/NOTIFICATIONS_SPEC.md` |
| Prior master plan | `plans/automation-overhaul/MASTER_PLAN_V1_2.md` |
| CEO readiness gaps | `plans/automation-overhaul/CEO_IMPROVEMENTS_AND_GAPS.md` |
| FB replies spec (base) | `plans/automation-overhaul/FB_MARKETPLACE_REPLIES_SPEC.md` |
| FB replies addendum (v1.2) | `plans/automation-overhaul/FB_MARKETPLACE_REPLIES_SPEC_V1_2_ADDENDUM.md` |
| Existing implementation notes (WS2/3) | `docs/automation-overhaul/WORKSTREAMS_2_3_IMPLEMENTATION.md` |
| Existing implementation notes (WS4) | `docs/automation-overhaul/workstream-4-fb-marketplace-replies-implementation.md` |

---

## DoD Contract (Standard)

### 0) Scope + assumptions

**In scope (v1.3 planning):**
- Add **Workstream 4E — Appointment Booking + Notifications**.
- Strengthen Workstream 4C (appraisal/pricing) and Workstream 4B (competitive report) requirements to exceed vAuto-style value.
- Provide updated deliverable matrix, UX deliverables, and QA gates.

**Out of scope:**
- Production code changes.
- Sending real notifications (SMS/email) or writing to real calendars.
- Vendor contracts or keys.

**Assumptions (align with repo reality):**
- Workstream 4D already has server-authoritative send gating (`/api/extension/fb-replies/decide-send`) and in-app UI surfaces (Inbox/Settings/Audit) per `docs/automation-overhaul/workstream-4-fb-marketplace-replies-implementation.md`.
- Workstreams 2/3 already include a comps engine, competitive report snapshotting, and dealership settings persistence per `docs/automation-overhaul/WORKSTREAMS_2_3_IMPLEMENTATION.md`.

### 1) Acceptance criteria (objective)
- The 4 required v1.3 files exist at the exact paths in the deliverables index.
- Workstream 4E is specified with:
  - an **appointment state machine** (including cancellations/reschedule/no-show),
  - **assignment** (which salesperson owns the appointment),
  - **audit trail** for creation/changes,
  - **calendar/CRM integration strategy** that minimizes human work,
  - **mandatory Sales Manager notifications** for any appointment booked.
- Pricing/appraisal requirements are upgraded to explicitly target “better than vAuto” differentiation.
- QA gates include: false positives, cancellations, timezone issues, and double booking.

### 2) Validation steps
- Open all 4 v1.3 documents and verify:
  - Workstream 4E appears in work breakdown.
  - Mandatory manager notification is stated as a **hard requirement**.
  - Appointment booking has explicit failure modes and safe fallbacks.
  - Pricing/appraisal differentiation includes explainability + confidence + comp provenance.

### 3) Gap report
- See end of this document.

---

## 1) Executive summary (v1.3)

LotView becomes an industry-leading platform for:

### Sales Managers (pricing + appraisals: beat vAuto)
- **Appraisal/comps** becomes a manager-grade pricing engine with:
  - comp **provenance**, confidence, and condition normalization,
  - **explainable scoring** and “what moved price” deltas,
  - “Market day supply” indicators (days on lot distributions),
  - policy-controlled **recon/pack** adjustments and margin targets,
  - **competitive positioning** and reprice recommendations.

### Salespeople (post more + AI books appointments)
- Craigslist assisted autopost (4A) + FB Marketplace replies (4D) continue.
- New: **Appointment Booking (4E)** that can book test drives/visits directly from messaging, with safe constraints and minimal human steps.
- Mandatory: **Sales Manager is notified** whenever an appointment is booked/changed/cancelled.

---

## 2) Non-negotiables (v1.3 hard constraints)

### 2.1 Existing hard constraints (carried forward)
- Craigslist: assisted autopost only; **never** click final publish.
- Competitive report: **API-first + ZenRows fallback**, rate-limited, Canada-only.
- VIN/options: **cheap hybrid**; exact trim default; near-trim option.
- FB replies: **AUTO-SEND default ON** but narrow envelope + kill switches + audit + typing simulation.

### 2.2 New hard constraints (v1.3)

1) **Appointment booking must be safe-by-default**
   - AI can propose and confirm appointments only inside a strict policy envelope.
   - If constraints cannot be proven (time ambiguity, timezone mismatch, double booking risk), the system must fall back to **human confirmation**.

2) **Mandatory Sales Manager notification (in-app + email)**
   - Any appointment booked/changed/cancelled by AI or human via LotView must notify Sales Managers via:
     - **in-app notification feed (REQUIRED)**, and
     - **email (REQUIRED)**.
   - SMS may be supported later but remains optional and gated (see `NOTIFICATIONS_SPEC.md`).

3) **Appointment ownership must be explicit**
   - Every appointment has exactly one **owner salesperson** (or an explicit “unassigned” state with SLA).
   - Ownership changes are audited.

4) **Audit trail is append-only and exportable (manager/GM)**
   - Creation/updates/cancellations must write immutable audit events with reason codes.

5) **No silent double-booking**
   - Booking flow must include a server-side concurrency guard and calendar conflict checks.

---

## 3) Workstreams (v1.3)

### 3.1 Workstream 4B — Competitive report (strengthened differentiation)
Add the following requirements to the existing competitive report snapshot:
- **Comp provenance** per listing: `source`, `fetchedAt`, `confidence`, `unknownFields[]`.
- **Market distribution** for each unit:
  - median/25th/75th price for exact-trim and near-trim cohorts,
  - days-on-lot distribution (where available).
- **Repricing recommendations**:
  - “To be top 10% in radius X, price at $Y” (with confidence interval).
  - “Likely overpriced” flags with evidence (count of cheaper comps, adjusted for mileage/condition).
- **Manager actions** (plan-level, not code):
  - “Create pricing task” from a unit row,
  - “Explain why” drilldown that shows the top factors affecting price.

### 3.2 Workstream 4C — Appraisal/comps (strengthened differentiation vs vAuto)
New “industry-leading” requirements (manager-grade):
- **Explainable scoring** (already partially present) must be upgraded to:
  - human-readable factor cards: mileage delta, trim delta, condition delta, accident delta, options delta (when known), source trust.
- **Policy-driven adjustments**:
  - dealership config for pack, recon, margin targets, and “minimum gross” rules.
  - adjustments appear as line items and are auditable.
- **Confidence + guardrails**:
  - each valuation returns `confidence` and “missing data reasons”.
  - if confidence is low, UI must recommend next action (e.g., “Need trim/options confirmation” or “Need condition input”).
- **What-if tools**:
  - slider/inputs to model recon cost, mileage corrections, and condition change.
  - produces a delta view (“price moved by +$X because…”).
- **Competitive positioning bridge**:
  - given an appraisal valuation, show “market buy” vs “retail ask” suggestion aligned to competitive report snapshots.

### 3.3 Workstream 4D — FB Marketplace replies (extended to appointment booking)
Add a normative extension:
- When intent is scheduling, the assistant must prefer a **structured appointment flow** (Workstream 4E), not ad-hoc texting.

### 3.4 Workstream 4E — Appointment Booking + Notifications (NEW)
See:
- `plans/automation-overhaul/APPOINTMENT_BOOKING_SPEC.md`
- `plans/automation-overhaul/NOTIFICATIONS_SPEC.md`

---

## 4) Phasing / work breakdown (v1.3)

### Phase 0 — Cross-cutting foundations (carry forward)
- World-class UX states across all surfaces.
- RBAC and dealer provisioning improvements per `CEO_IMPROVEMENTS_AND_GAPS.md` (still P0 for 1000 dealerships).

### Phase 1 — Pricing/appraisal differentiation upgrades (4B/4C)
- Add provenance/confidence requirements.
- Add manager task workflows (create tasks from units; audit).

### Phase 2 — Appointment booking core (4E)
- Appointment objects, state machine, owner assignment.
- In-app appointment feed + filtering.
- Booking envelope + conflict guards.

### Phase 3 — Notification system (4E)
- In-app notifications required.
- **Email to Sales Managers required** for appointment booked/changed/cancelled (with verification + deliverability safeguards).
- Optional SMS gated and verified.

### Phase 4 — Calendar/CRM integration (4E)
- **LotView internal calendar is the system of record** (visible to GM + Sales Managers).
- Minimal-human external calendar projections (ICS + Google/Microsoft connectors) with safe fallbacks.
- CRM connector strategy (initially: structured export + webhook integrations; later native connectors).

### Phase 5 — QA hardening + rollout
- False-positive prevention, cancellation/reschedule flows, timezones, and double-booking tests.

---

## 5) UX deliverables (v1.3 adds 4E surfaces)

**New required screens (and states) are fully defined in:**
- `plans/automation-overhaul/APPOINTMENT_BOOKING_SPEC.md` (screens + states section)

Minimum list:
- Appointment Feed (Sales Manager view; includes booked/changed/cancelled)
- Lead Assignment / Ownership (manager assignment controls)
- Follow-up Tasks (auto-created tasks post-appointment)

---

## Gap Report + Auto-fill (v1.3)

### Newly identified gaps (must be addressed by implementation work, not this planning)
1) **Calendar/CRM connectors do not exist yet** in code; need a minimal connector framework and secrets handling.
2) **Notification service** (in-app + **required manager email** + optional SMS) requires a queue/outbox pattern, deliverability handling, and permissioned settings.
3) **Appointment state machine** + conflict detection are not present; must be implemented server-authoritatively.

### Why missing
- This subtask is planning/specification only.

### Auto-fill actions (recommended next deliverables beyond this request)
- Add a cross-cutting workstream “Dealer Platform Foundations” (RBAC/provisioning, audit retention/export, observability) as recommended in `CEO_IMPROVEMENTS_AND_GAPS.md`.
- Create an implementation spike plan for calendar provider selection (Google/Microsoft) and SMS vendor (if any), gated behind explicit approval and feature flags.
