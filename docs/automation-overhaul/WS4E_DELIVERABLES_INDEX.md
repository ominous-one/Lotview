# WS4E (Appointments + Notifications) — Deliverables Index

Date: 2026-03-08

This workstream implements:
- Canonical internal LotView appointment calendar (system of record)
- Appointment state transitions + conflict detection + idempotency
- In-app notification feed
- Required Sales Manager email notifications (outbox + retry/backoff + audit)
- Manager email verification + settings UI
- Test-mode with local mail sink (no external sends)

## Specs (source of truth)
- `plans/automation-overhaul/APPOINTMENT_BOOKING_SPEC.md`
- `plans/automation-overhaul/NOTIFICATIONS_SPEC.md`
- `plans/automation-overhaul/DELIVERABLE_MATRIX_V1_3_APPT_NOTIFICATIONS.md`

## Database / migrations
- `migrations/0007_ws4e_appointments_notifications.sql`
  - Adds canonical `appointments`
  - Adds `appointment_audit_events`
  - Adds `notification_events`, `notifications`
  - Adds `email_outbox`
  - Adds `email_verification_tokens`
  - Adds user notification email fields to `users`
- `migrations/0008_ws4e_followup_calendar_state.sql`
  - Adds `appointment_audit_events.idempotency_key` + unique constraint for transition retries
  - Adds `notification_events.event_key` + unique constraint for event/notification dedupe
  - Adds `follow_up_tasks` table

## Backend (server)
### Appointment state + service
- `server/appointments/appointment-state.ts`
- `server/appointments/appointment-service.ts`
- `server/appointments/appointment-reassign.ts`

### Follow-up tasks
- `server/follow-ups/follow-up-service.ts`

### Notifications
- `server/notifications/notification-service.ts`
- `server/notifications/email-outbox-worker.ts`
- `server/notifications/mail-sink.ts`
- `server/notifications/email-verification.ts`

### Scheduler hook
- `server/scheduler.notifications.ts`
- `server/index-dev.ts` (starts notifications scheduler)
- `server/index-prod.ts` (starts notifications scheduler)

### API routes
- `server/routes.ts`
  - `/api/appointments` (list/create; supports `start/end/ownerUserId/status` filters)
  - `/api/appointments/:id` (detail + audit)
  - `/api/appointments/:id/reschedule`
  - `/api/appointments/:id/request-reschedule`
  - `/api/appointments/:id/cancel`
  - `/api/appointments/:id/no-show`
  - `/api/appointments/:id/complete`
  - `/api/appointments/:id/reassign`
  - `/api/follow-up-tasks` (feed; RBAC enforced)
  - `/api/appointments/:id/follow-up/no-response` (manual task creation)
  - `/api/notifications` (feed)
  - `/api/notifications/:id/read`
  - `/api/notifications/email-outbox` (GM/manager audit)
  - `/api/notifications/settings/manager-emails`
  - `/api/notifications/settings/manager-emails/:userId/start-verify`
  - `/api/notifications/verify-email`

## Frontend (client)
### Pages
- `client/src/pages/AppointmentsPage.tsx` — appointment feed + quick-book
- `client/src/pages/AppointmentCalendarPage.tsx` — manager Day/Week calendar view + filters
- `client/src/pages/FollowUpTasksPage.tsx` — follow-up tasks feed
- `client/src/pages/AppointmentDetailPage.tsx` — appointment detail + audit + actions
- `client/src/pages/NotificationsPage.tsx` — in-app notification feed
- `client/src/pages/ManagerEmailSettingsPage.tsx` — manager email verification UI

### Routing
- `client/src/App.tsx` — routes for:
  - `/manager/appointments`
  - `/manager/calendar`
  - `/manager/follow-up-tasks`
  - `/manager/appointments/:id`
  - `/manager/notifications`
  - `/manager/notifications/settings`

## Tests
- `server/tests/ws4e_appointment_state.test.ts`
- `server/tests/ws4e_email_outbox_worker.test.ts`

## QA
- `qa/automation-overhaul/E2E_CHECKLIST.md` — appended WS4E checklist section

## Runtime / config
- `NOTIFICATIONS_TEST_MODE=true` to suppress external sends
- Mail sink output directory: `artifacts/mail-sink/`
