# WS4E (Appointments + Notifications) — Gap Report

Date: 2026-03-08

This report lists known gaps vs the WS4E specs (appointments + required manager notifications).

## Implemented
- Canonical internal LotView appointment calendar (`appointments` table) + audit events.
- Server-side conflict detection (owner/time overlap) with advisory locks.
- Idempotency via `(dealership_id, idempotency_key)` unique index.
- Appointment transitions: create, reschedule, cancel, request-reschedule, no-show, completed, reassigned.
- Transition idempotency: `appointment_audit_events.idempotency_key` + unique constraint.
- Notification event dedupe: `notification_events.event_key` prevents duplicate notifications/outbox on retries.
- Notification outbox pattern:
  - In-app `notifications` records created per event per recipient.
  - `email_outbox` rows created with idempotent `send_key`.
  - Worker processes outbox with retry/backoff.
- Mandatory manager notifications for booked/rescheduled/cancelled:
  - In-app REQUIRED for sales managers.
  - Email outbox REQUIRED for sales managers (gated by verification/deliverability).
- Test-mode:
  - `NOTIFICATIONS_TEST_MODE=true` suppresses external sends.
  - Writes mail payloads to `artifacts/mail-sink/`.
- Manager email verification flow:
  - start verify → creates token and sends verify link (mail sink in test mode)
  - verify endpoint marks email as verified.
- UI pages for appointment feed/detail and notifications feed/settings.

## Gaps / follow-ups
### Appointment booking envelope (business rules)
- Missing store business hours, minimum lead time, and buffer-time configuration.
- Missing vehicle/thread binding confidence and timezone ambiguity checks.
- No `PROPOSED` / `PENDING_CONFIRMATION` end-to-end UX flow (API supports status on create; UI currently books directly).

### Full state machine coverage
- ✅ Implemented transitions/endpoints for:
  - `RESCHEDULE_REQUESTED`
  - `NO_SHOW`
  - `COMPLETED`
  - reassignment (`APPT_REASSIGNED`)

### Internal calendar UI (day/week view)
- ✅ Added manager Day/Week calendar view with filters.

### Follow-up tasks
- ✅ Implemented `follow_up_tasks` table + API + manager UI feed.
- ✅ Tasks are generated on: booked/rescheduled, no-show, cancelled, completed, and manual "no response" action.

### Notification preferences / opt-out constraints
- Hard non-disableable policy is enforced implicitly by routing, but there is no preferences UI/model yet.

### Email deliverability feedback loop
- No bounce/complaint webhook ingestion yet.
- Columns exist for hard bounce/complaint timestamps, but nothing sets them.

### Outbox observability
- Minimal outbox audit endpoint exists (`/api/notifications/email-outbox`) but no UI.

## Risks
- Role taxonomy inconsistencies in repo (`manager` vs `sales_manager`) could cause recipient resolution bugs.
- Appointment conflict detection currently only checks overlaps for `owner_user_id` (no shared resource / store-wide constraints).

## Auto-fill next steps
1) Add bounce/complaint ingestion and disable sends per spec.
2) Add booking envelope validation and PENDING_CONFIRMATION flow.
3) Add outbox audit UI (currently API-only).
4) Add business-hours aware due-date computation for follow-up tasks (optional improvement).
