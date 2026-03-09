# LotView Automation Overhaul — Deliverable Matrix (v1.3)

> **Project:** `C:\Users\omino\projects\lotview`
>
> **Companion master plan:** `plans/automation-overhaul/MASTER_PLAN_V1_3_APPT_NOTIFICATIONS.md`
>
> **This matrix is a v1.3 delta** focused on:
> - NEW: **Workstream 4E Appointment Booking + Notifications**
> - Upgrades: **Workstreams 4B/4C pricing + appraisal differentiation**

---

## DoD Contract (Standard)

### Acceptance criteria
- All deliverables listed below include:
  - explicit file path,
  - owner role (PM/Design/Eng/QA),
  - acceptance criteria,
  - validation steps,
  - gaps/risks.
- The matrix includes **all required items from the task prompt**:
  - appointment state machine
  - CRM/calendar integration strategy (minimal human interaction)
  - sales manager notification channels (**in-app + required email**, plus optional SMS gated)
  - audit trail + assignment (owner salesperson)

---

## 1) Workstream 4E — Appointment Booking + Notifications (NEW)

### 1.1 Specs (normative)

| Deliverable | Path | Owner | Acceptance criteria | Validation steps |
|---|---|---|---|---|
| Appointment booking spec (state machine, constraints, UX, QA) | `plans/automation-overhaul/APPOINTMENT_BOOKING_SPEC.md` | PM/Eng | Contains: state machine; booking envelope; conflict rules; owner assignment; audit events; UX screens+states; QA gates | Open file; check required sections exist; cross-check with `NOTIFICATIONS_SPEC.md` |
| Notifications spec (channels, templates, opt-out rules, deliverability, audit) | `plans/automation-overhaul/NOTIFICATIONS_SPEC.md` | PM/Eng | Contains: manager in-app **and email** required for booked/changed/cancelled; optional SMS; templates; deliverability safeguards; test-mode; dedupe/idempotency; audit + failure handling | Open file; check manager mandatory in-app+email rule; confirm opt-out constraints; confirm test-mode + idempotency keys |

### 1.2 Appointment booking state machine (explicit deliverable)

| Deliverable | Path | Owner | Acceptance criteria | Validation steps |
|---|---|---|---|---|
| Appointment state machine diagram + transition table | `plans/automation-overhaul/APPOINTMENT_BOOKING_SPEC.md#4-appointment-state-machine` | PM/Eng | Includes: proposed, pending-confirmation, booked, rescheduled, cancelled, no-show, completed; transition triggers + who can trigger | Ensure every transition has: trigger, actor, audit event, notification behavior |

### 1.3 CRM / calendar integration strategy (minimal human interaction)

| Deliverable | Path | Owner | Acceptance criteria | Validation steps |
|---|---|---|---|---|
| Calendar integration strategy (canonical LotView calendar + projections) | `plans/automation-overhaul/APPOINTMENT_BOOKING_SPEC.md#9-calendar--crm-integration-strategy-minimal-human-interaction` | Eng | States: **LotView internal calendar is system of record**; provider projections (ICS + Google/Microsoft); conflict checks (canonical first); failure fallback | Confirm strategy covers: canonical invariants, timezones, idempotency keys, retries, and manual override |
| CRM integration strategy | `plans/automation-overhaul/APPOINTMENT_BOOKING_SPEC.md#9-calendar--crm-integration-strategy-minimal-human-interaction` | Eng | Defines: MVP export + webhook lane; later native connectors; assignment sync; canonical LotView appointment model | Confirm strategy references appointment owner + audit provenance |

### 1.4 Sales manager notifications (channels + gating)

| Deliverable | Path | Owner | Acceptance criteria | Validation steps |
|---|---|---|---|---|
| Sales Manager notification policy | `plans/automation-overhaul/NOTIFICATIONS_SPEC.md#3-mandatory-sales-manager-notification-requirement` | PM/Eng | Any appointment booked/changed/cancelled triggers **in-app + email** manager notification (non-disableable); optional SMS gated | Check event list includes booked/rescheduled/cancelled; confirm opt-out constraints + dedupe/idempotency |
| Notification channels + preferences | `plans/automation-overhaul/NOTIFICATIONS_SPEC.md#4-channels-preferences-and-opt-out-rules` | Eng | In-app always; **manager email required** for booked/changed/cancelled with verification + deliverability safeguards; SMS optional; explicit opt-out constraints | Confirm preference model does not allow disabling manager in-app/email for booked/changed/cancelled; confirm test-mode behavior |

### 1.5 Audit trail + assignment (who owns the appointment)

| Deliverable | Path | Owner | Acceptance criteria | Validation steps |
|---|---|---|---|---|
| Ownership & assignment rules | `plans/automation-overhaul/APPOINTMENT_BOOKING_SPEC.md#5-ownership-assignment--sla` | PM/Eng | Every appointment has `ownerUserId` or explicit unassigned state; assignment changes audited | Confirm rules cover: round-robin optional, manager override, auto-assignment from thread |
| Audit trail requirements | `plans/automation-overhaul/APPOINTMENT_BOOKING_SPEC.md#6-audit-trail--immutability-requirements` | Eng/QA | Append-only audit events for create/update/cancel/reschedule; includes actor + reason codes | Confirm each state transition maps to an audit event |

### 1.6 UX deliverables (screens + states)

| Deliverable | Path | Owner | Acceptance criteria | Validation steps |
|---|---|---|---|---|
| Appointment Feed screen spec | `plans/automation-overhaul/APPOINTMENT_BOOKING_SPEC.md#8-ux-screens--states` | Design/PM | Includes: loading/empty/error, filters, drilldown, action CTAs | Check states list includes cancellations and timezone display |
| Lead Assignment screen spec | `plans/automation-overhaul/APPOINTMENT_BOOKING_SPEC.md#8-ux-screens--states` | Design/PM | Includes: assign/unassign, ownership history, manager override | Validate ownership audit visibility |
| Follow-up Tasks spec | `plans/automation-overhaul/APPOINTMENT_BOOKING_SPEC.md#9-follow-up-tasks` | PM/Eng | Defines task generation rules pre/post appointment | Check tasks include due times and owner |

### 1.7 QA gates (appointment booking)

| Deliverable | Path | Owner | Acceptance criteria | Validation steps |
|---|---|---|---|---|
| QA gates and test plan | `plans/automation-overhaul/APPOINTMENT_BOOKING_SPEC.md#10-qa-gates--test-matrix` | QA/Eng | Includes: false positives, cancellations, timezone, double booking, idempotency, notification dedupe | Ensure each gate has pass/fail criteria and example fixtures |

---

## 2) Workstream 4B — Competitive report (pricing differentiation upgrades)

| Deliverable | Path | Owner | Acceptance criteria | Validation steps |
|---|---|---|---|---|
| Competitive report: provenance + explainability requirements (delta) | `plans/automation-overhaul/MASTER_PLAN_V1_3_APPT_NOTIFICATIONS.md#31-workstream-4b--competitive-report-strengthened-differentiation` | PM | Adds provenance + distribution + repricing recs + explain-why UX | Review section for explicit lists and manager actions |

---

## 3) Workstream 4C — Appraisal/comps (beat vAuto requirements)

| Deliverable | Path | Owner | Acceptance criteria | Validation steps |
|---|---|---|---|---|
| Appraisal/comps: explainability + policy adjustments + what-if tools (delta) | `plans/automation-overhaul/MASTER_PLAN_V1_3_APPT_NOTIFICATIONS.md#32-workstream-4c--appraisalcomps-strengthened-differentiation-vs-vauto` | PM | Requirements include: factor cards, adjustments, confidence + missing data reasons, what-if deltas | Review section; ensure it references auditability |

---

## 4) Cross-cutting (risk + governance references)

| Deliverable | Path | Owner | Acceptance criteria | Validation steps |
|---|---|---|---|---|
| CEO scale readiness gaps reference (non-normative) | `plans/automation-overhaul/CEO_IMPROVEMENTS_AND_GAPS.md` | PM | Used to inform future workstream: RBAC/provisioning, audit retention/export, observability | Confirm v1.3 plan gap report references these |

---

## Gap Report (matrix)

### Missing items
- This matrix does **not** enumerate code-level deliverables (migrations/routes/UI components). v1.3 request is for requirements/spec deliverables only.

### Why missing
- Task scope is to produce new requirements/specifications and a delta plan.

### Auto-fill action
- If implementation is authorized, generate a WS4E implementation plan mapping specs to repo file paths (migrations, server routes, UI pages, extension changes).