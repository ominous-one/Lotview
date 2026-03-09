# Appointment Booking Spec (Workstream 4E)

> **Project:** `C:\Users\omino\projects\lotview`
>
> **Master plan:** `plans/automation-overhaul/MASTER_PLAN_V1_3_APPT_NOTIFICATIONS.md`
>
> **Purpose:** Define how LotView books appointments directly (from FB Marketplace and future channels) with:
> - minimal human interaction,
> - explicit ownership/assignment,
> - server-authoritative conflict prevention,
> - mandatory Sales Manager notification (see `NOTIFICATIONS_SPEC.md`),
> - and an **internal LotView calendar** that is the **system of record**.
>
> **External side effects policy:** planning/spec only.

---

## DoD Contract (Standard)

### Acceptance criteria
This spec is done when it includes:
1) A **booking envelope** (what AI is allowed to book automatically).
2) A complete **appointment state machine** including cancellations/reschedules/no-shows.
3) **Ownership + assignment** rules (who owns the appointment).
4) **Permissions**: who can view/edit/cancel/reassign.
5) **Audit trail** requirements (append-only events, reason codes).
6) **Calendar/CRM integration strategy** with safe fallbacks, explicitly stating that the **LotView internal calendar is canonical**.
7) UX deliverables (screens + states): appointment feed, appointment detail, lead assignment, follow-up tasks.
8) QA gates for: false positives, cancellations, timezone, double booking, notifications.

### Validation steps
- Verify sections 4–11 exist and are internally consistent.
- Ensure every state transition maps to an audit event and notification behavior.
- Ensure internal calendar canonicality is stated and external calendars are projections.

---

## 1) Goals

### 1.1 Primary goals
- **Book more appointments** directly from buyer messaging (starting with FB Marketplace).
- **Never double book** (server-authoritative conflicts + idempotency).
- **Minimize human work**:
  - AI proposes times and confirms a slot.
  - Internal calendar entry is created automatically.
  - External calendar/CRM projections are created automatically where configured.
- **Mandatory manager visibility**:
  - Sales Managers receive required notifications for appointment booked/changed/cancelled (in-app + email per `NOTIFICATIONS_SPEC.md`).

### 1.2 Non-goals (v1)
- Complex multi-rooftop scheduling across multiple dealerships.
- Automatic vehicle hold/reservation promises.
- Negotiation of pricing via appointment flow (booking is separate from negotiation).

---

## 2) Definitions

- **Appointment**: a scheduled visit/test drive/phone call associated with a lead/thread and optionally a vehicle.
- **Internal LotView calendar**: LotView’s dealership-scoped calendar UI/data for appointments; **system of record**.
- **Owner (salesperson)**: the user accountable for the appointment outcome.
- **Sales Manager / GM**: roles that must have dealership-wide visibility and control.
- **Booking envelope**: constraints that must be satisfied to allow auto-booking without human confirmation.

---

## 3) Canonical calendar model (system of record)

### 3.1 Hard rule: LotView calendar is authoritative
- The **LotView internal calendar** is the system of record for appointment truth.
- External calendars (Google/Microsoft/ICS) are **projections** of the canonical LotView appointment.
- If an external calendar write fails, the appointment remains valid and visible in LotView; the failure is recorded and notified.

### 3.2 Canonical invariants
- Every `BOOKED` / `RESCHEDULED` appointment MUST correspond to a canonical internal calendar entry.
- Any edit/cancel/reschedule MUST occur against the canonical LotView appointment first.
- External calendar events MUST include a stable reference to `appointmentId` to enable idempotent updates.

### 3.3 Visibility requirement
- Internal calendar must be visible to:
  - **GM**: all appointments across the dealership.
  - **Sales Managers**: all appointments across the dealership.
  - **Salespeople**: only their owned appointments (and optionally unassigned appointments if configured).

---

## 4) Booking envelope (safe-by-default)

### 4.1 Appointment types
Supported types (v1):
- `IN_PERSON_VISIT`
- `TEST_DRIVE`
- `PHONE_CALL`

### 4.2 Auto-booking allowed only when ALL are true
Auto-booking is permitted only when the system can prove:

1) **Time is unambiguous**
   - A concrete date + time exists.
   - If buyer says “tomorrow afternoon”, AI must ask a clarifying question; do not book.

2) **Timezone is known**
   - Dealer timezone is configured.
   - If buyer timezone is unknown, assume dealer timezone only when the buyer language strongly implies local time; otherwise require confirmation.

3) **Vehicle mapping is correct (if vehicle-specific)**
   - If the appointment references a vehicle, thread→vehicle binding confidence must be above threshold.

4) **Conflict checks pass (canonical)**
   - No conflict in the **internal LotView calendar** for the owner (or store calendar) and any configured resource constraints.
   - A server-side lock prevents concurrent booking of the same slot.

5) **Contact method is safe**
   - Avoid requesting sensitive info.
   - Collect only minimal needed fields.

6) **Business rules satisfied**
   - Store business hours.
   - Minimum lead time.
   - Buffer times.

### 4.3 When the envelope fails
The system must fall back to one of:
- Propose times and ask the buyer to pick (no booking created).
- Create an appointment in `PENDING_CONFIRMATION` requiring manager/salesperson confirmation.
- Escalate thread to human queue.

---

## 5) Appointment state machine

### 5.1 States
- `DRAFT` — internal placeholder (not shown to buyer); created when user begins booking.
- `PROPOSED` — times proposed to buyer; no slot reserved.
- `PENDING_CONFIRMATION` — buyer accepted a proposed time, but system requires human confirmation (envelope failed).
- `BOOKED` — confirmed appointment with final datetime and type.
- `RESCHEDULE_REQUESTED` — buyer asked to reschedule.
- `RESCHEDULED` — booked moved to a new datetime.
- `CANCELLED_BY_BUYER`
- `CANCELLED_BY_DEALER`
- `NO_SHOW`
- `COMPLETED`

### 5.2 Transition table (minimum)

| From | To | Trigger | Actor | Required audit event | Notifications |
|---|---|---|---|---|---|
| (none) | DRAFT | Create appointment flow starts | System/User | `APPT_CREATED` | none |
| DRAFT | PROPOSED | AI sends time options | System | `APPT_PROPOSED` | none |
| PROPOSED | BOOKED | Buyer confirms + envelope passes | System | `APPT_BOOKED_AUTO` | Manager required (in-app+email); owner; optional buyer confirmation message |
| PROPOSED | PENDING_CONFIRMATION | Buyer confirms but envelope fails | System | `APPT_PENDING_CONFIRMATION` | Manager required in-app; email per routing policy |
| PENDING_CONFIRMATION | BOOKED | Sales/Manager confirms | User | `APPT_BOOKED_MANUAL_CONFIRM` | Manager required (in-app+email); owner |
| BOOKED | RESCHEDULE_REQUESTED | Buyer asks to reschedule | System/User | `APPT_RESCHEDULE_REQUESTED` | Manager in-app required; optional email |
| RESCHEDULE_REQUESTED | RESCHEDULED | New slot booked | System/User | `APPT_RESCHEDULED` | Manager required (in-app+email); owner |
| BOOKED/RESCHEDULED | CANCELLED_BY_BUYER | Buyer cancels | System | `APPT_CANCELLED_BUYER` | Manager required (in-app+email); owner |
| BOOKED/RESCHEDULED | CANCELLED_BY_DEALER | Dealer cancels | User | `APPT_CANCELLED_DEALER` | Manager required (in-app+email); owner |
| BOOKED/RESCHEDULED | NO_SHOW | No-show marked after grace period | User/System | `APPT_NO_SHOW` | Manager required in-app; optional email |
| BOOKED/RESCHEDULED | COMPLETED | Mark completed | User | `APPT_COMPLETED` | Manager optional; owner |

### 5.3 Idempotency + concurrency invariants
- **Idempotency key:** `appointmentId + action + targetStartAt` (or equivalent) used for state transitions and external projections.
- **Concurrency:** server must enforce:
  - per-appointment lock, and
  - per-owner-time-slot lock
  to prevent two simultaneous bookings.

---

## 6) Permissions (RBAC) and responsibilities

### 6.1 Roles (minimum)
- `GM`
- `SalesManager`
- `Salesperson`
- (Optional later) `BDC` / `Coordinator`

### 6.2 View permissions
- **GM:** view all appointments + audit + notification status.
- **SalesManager:** view all appointments + audit + notification status.
- **Salesperson:** view appointments where `ownerUserId == self`.
- **Unassigned visibility:** Salesperson visibility into unassigned appointments is configurable; default OFF.

### 6.3 Edit permissions
- **GM / SalesManager:** may create, edit, reschedule, cancel, mark no-show/completed, and reassign owner.
- **Salesperson:** may edit/reschedule/cancel only their owned appointments; may mark completed/no-show for their owned appointments.

### 6.4 Assignment permissions
- **GM / SalesManager:** may assign/reassign any appointment owner.
- **Salesperson:** may not reassign ownership (unless explicitly enabled by dealership policy).

### 6.5 Audit and reason requirements
- Any cancel/reschedule action performed by a user MUST require a reason (free text or reason code).
- Reassignment requires reason code `USER_OVERRIDE` plus optional detail.

---

## 7) Ownership, assignment, and SLA

### 7.1 Ownership rules
- Every appointment must have:
  - `ownerUserId` (salesperson), OR
  - `ownerUserId = null` and be treated as “unassigned” (flag + SLA).

Recommended default assignment order:
1) If appointment originates from a thread with `assigneeUserId`, use that user.
2) Else if vehicle has a default salesperson/BDC owner, use that.
3) Else set unassigned and alert Sales Manager.

### 7.2 Manager override
- Sales Manager can reassign owner at any time.
- Reassignment must create audit event `APPT_REASSIGNED` with from/to and reason.

### 7.3 SLA expectations (product behavior)
- Unassigned appointments must surface with a visible SLA badge (e.g., “Unassigned — assign within 15 minutes”).

---

## 8) Audit trail + immutability requirements

### 8.1 Audit events (append-only)
For every appointment lifecycle event, record:
- `dealerId`, `appointmentId`
- `kind` (enum; see transition table)
- `actorType` = `SYSTEM | USER`
- `actorUserId` (nullable)
- `occurredAt` (timestamptz)
- `reasonCodes[]` (standardized)
- `details` (structured JSON)
- `sourceThreadId` (if created from messaging)

### 8.2 Required reason codes (minimum)
- `ENVELOPE_FAILED_TIME_AMBIGUOUS`
- `ENVELOPE_FAILED_TIMEZONE_UNKNOWN`
- `ENVELOPE_FAILED_CONFLICT`
- `ENVELOPE_FAILED_VEHICLE_MAPPING_LOW_CONF`
- `USER_OVERRIDE`

### 8.3 Audit visibility
- GM/Sales Manager must be able to drill into an appointment and view:
  - who created it,
  - what data the AI used,
  - why it was auto-booked vs required confirmation,
  - internal calendar vs external projection statuses.

---

## 9) Calendar / CRM integration strategy (minimal human interaction)

### 9.1 Principles
- **LotView internal calendar is canonical.**
- **Write-through when possible, fail safe when not.**
- **No vendor lock-in in the data model.** External entries are projections.
- **Idempotent projections:** repeated attempts must not create duplicates.

### 9.2 Conflict checking strategy (canonical first)
1) Always check conflicts against the **internal LotView calendar**.
2) If an external provider is configured, additionally query provider free/busy.
3) If provider query fails, do not block booking solely on provider failure; instead:
   - book in LotView (canonical),
   - flag “external calendar conflict unknown”,
   - notify manager per policy.

### 9.3 Calendar integration (MVP strategy)
MVP options (choose per dealership):
1) **ICS invite email** (lowest friction)
   - LotView generates an ICS attachment for booked appointments.
   - ICS sending is subject to notifications/email policy.
2) **Google Calendar connector** (per user or per store calendar)
3) **Microsoft 365 / Outlook connector**

### 9.4 CRM integration (MVP strategy)
- **Phase 1:** structured export (CSV/JSON) for appointments + outcomes.
- **Phase 2:** webhook-based connectors.
- **Phase 3:** native CRM connectors.

### 9.5 Failure behavior
If external calendar write fails:
- appointment remains `BOOKED` in LotView (canonical),
- a `CALENDAR_SYNC_FAILED` audit event is created,
- Sales Manager receives an in-app notification; email optional unless policy escalates.

---

## 10) UX screens + states (required deliverables)

> These are product requirements; implementation is out of scope.

### 10.1 Internal Calendar / Appointment Feed (GM/Manager & Sales)
**Primary functions:** overview, filters, ownership, status changes, drilldown.

**Core UI elements:**
- Views: day/week/list.
- Filters: date range, owner, status, source channel, vehicle, unassigned.
- Rows/cards show: buyer name, vehicle, appointment time (with timezone), owner, status badge.
- Quick actions: assign/reassign, reschedule, cancel, mark completed, mark no-show.

**States:**
- Loading
- Empty
- Error
- Unassigned warning state
- Conflict warning state

### 10.2 Lead Assignment (Manager)
**Primary functions:** assign appointment owner and thread owner; see history.

**UI elements:**
- Current owner + dropdown assignment.
- Ownership history timeline.
- Reason required for reassignment.

**States:**
- Assigning
- Success
- Error with retry

### 10.3 Appointment Detail (Drilldown)
**UI elements:**
- Buyer + thread link
- Vehicle card
- Appointment info: type, datetime, location, notes
- Audit timeline (envelope checks; calendar projection status)
- Notification delivery status (in-app + email; see notifications spec)

---

## 11) Follow-up tasks

### 11.1 Task creation rules
When an appointment is `BOOKED` or `RESCHEDULED`:
- Create task: `Confirm appointment` due 24h prior (or next business day if shorter).
- Create task: `Day-of reminder` due 2h prior.

When appointment is `NO_SHOW`:
- Create task: `No-show follow-up` due within 2 business hours.

When appointment is `COMPLETED`:
- Create task: `Post-visit follow-up` due next business day.

### 11.2 Ownership
- Tasks are owned by `ownerUserId`.
- If unassigned, tasks are unassigned and must trigger manager notification.

---

## 12) QA gates + test matrix

### 12.1 False positives (booking when buyer didn’t agree)
**Gate:** system must not create `BOOKED` unless buyer explicitly confirms a proposed time.

### 12.2 Cancellations and reschedules
**Gate:** cancellations/reschedules must propagate to:
- appointment state,
- audit event,
- manager notifications (in-app + email where required),
- external projections update/cancel where configured.

### 12.3 Timezone correctness
**Gate:** displayed time must include timezone and be consistent across:
- message transcript reference,
- appointment record,
- internal calendar UI,
- external calendar entries.

### 12.4 Double booking prevention
**Gate:** two simultaneous booking attempts for same owner/time must result in:
- one success,
- one failure with reason `ENVELOPE_FAILED_CONFLICT` and a safe fallback.

### 12.5 Notification reliability + dedupe
**Gate:** appointment events produce exactly-once in-app manager notifications and exactly-once required email attempts (idempotent).

### 12.6 Audit completeness
**Gate:** every state transition emits an audit event with actor and reason.

---

## Gap Report

### What changed vs prior spec
- Made the **internal LotView calendar** explicitly the **system of record**.
- Added an explicit **permissions/RBAC** section for GM/Sales Managers/Salespeople.
- Updated notification expectations in the state machine to align with required manager email + in-app for booked/changed/cancelled.

### Known missing items (intentional)
- Database schemas/routes/UI implementation details are omitted.

### Auto-fill action
- If implementation is approved, create a WS4E implementation plan mapping:
  - appointment tables + internal calendar views,
  - notification outbox,
  - external projection workers,
  - UI pages
  to repo file paths.