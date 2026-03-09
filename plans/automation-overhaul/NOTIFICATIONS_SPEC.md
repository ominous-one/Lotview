# Notifications Spec (Workstream 4E)

> **Project:** `C:\Users\omino\projects\lotview`
>
> **Companion spec:** `plans/automation-overhaul/APPOINTMENT_BOOKING_SPEC.md`
>
> **Purpose:** Define notification channels, templates, preferences/opt-out rules, deliverability safeguards, dedupe/idempotency, audit, failure handling, and **mandatory Sales Manager alerts** for appointment events.
>
> **Hard requirements (v1.3):**
> - **In-app notification to Sales Managers is REQUIRED** for appointment booked/changed/cancelled.
> - **Email notification to Sales Managers is REQUIRED** for appointment booked/changed/cancelled.
> - SMS may exist later, but remains optional and feature-flagged.
>
> **External side effects policy:** planning/spec only.

---

## DoD Contract (Standard)

### Acceptance criteria
- Specifies:
  - notification event taxonomy for appointment lifecycle,
  - mandatory manager notifications (in-app + email),
  - channel rules + opt-out constraints,
  - deliverability safeguards (verification, bounce handling assumptions, retries),
  - test-mode behavior (no real external sends),
  - dedupe/idempotency rules,
  - audit log model and delivery status,
  - failure handling + escalation path.

### Validation steps
- Confirm no user/dealer preference can disable the manager’s **in-app OR email** notification for appointment **booked/changed/cancelled** events.
- Confirm test-mode exists and prevents sending real external email/SMS while still creating in-app records/audit.
- Confirm retries/idempotency are defined such that retries do not create duplicates.

---

## 1) Principles

1) **In-app records are canonical**
   - Every notification is created as an in-app record first (or atomically with event persistence via an outbox pattern in implementation).

2) **Appointment-critical manager notifications are non-negotiable**
   - For appointment booked/changed/cancelled: **Sales Managers MUST get both in-app + email**.

3) **Preferences apply only within allowed bounds**
   - Users may control optional channels and non-critical event types.
   - Users cannot opt out of required manager notifications.

4) **Idempotent + deduped**
   - Retries and replays must not spam duplicates.

5) **Deliverability is a first-class requirement**
   - Verification, retries, bounces, and “what happens when email cannot be delivered” must be specified.

6) **Auditable end-to-end**
   - Every attempt (in-app/email/SMS) produces a durable audit record with status and error info (sanitized).

---

## 2) Event taxonomy

### 2.1 Appointment events (minimum)
Appointment events that MUST exist for notification routing:
- `APPOINTMENT_BOOKED_AUTO`
- `APPOINTMENT_BOOKED_MANUAL`
- `APPOINTMENT_PENDING_CONFIRMATION`
- `APPOINTMENT_RESCHEDULE_REQUESTED`
- `APPOINTMENT_RESCHEDULED`
- `APPOINTMENT_CANCELLED_BY_BUYER`
- `APPOINTMENT_CANCELLED_BY_DEALER`
- `APPOINTMENT_NO_SHOW`
- `APPOINTMENT_COMPLETED`
- `CALENDAR_SYNC_FAILED`

### 2.2 Normalized notification payload
For every event:
- `dealerId`
- `eventId` (uuid)
- `eventType` (enum)
- `occurredAt` (timestamptz)
- `appointmentId`
- `threadId` (nullable)
- `vehicleId` (nullable)
- `ownerUserId` (nullable)
- `managerRecipients[]` (resolved user ids)
- `summary` (short text)
- `details` (structured JSON)

---

## 3) Mandatory Sales Manager notification requirement

### 3.1 Hard rule (appointment booked/changed/cancelled)
For any of the following events, the system MUST generate, for each Sales Manager recipient:
- an **in-app notification**, and
- an **email notification** (transactional).

**Events covered (minimum):**
- `APPOINTMENT_BOOKED_AUTO`
- `APPOINTMENT_BOOKED_MANUAL`
- `APPOINTMENT_RESCHEDULED`
- `APPOINTMENT_CANCELLED_BY_BUYER`
- `APPOINTMENT_CANCELLED_BY_DEALER`

Notes:
- `APPOINTMENT_PENDING_CONFIRMATION` is manager-critical but is not strictly “booked/changed/cancelled”; still REQUIRED **in-app** and strongly recommended **email**. (If product chooses to require email here too, mark it as required in the routing table below.)

### 3.2 Who is a “Sales Manager recipient”
- All users with role `SalesManager` (or `Manager` if that is the repo’s role name) at that dealership OR a configured subset (“duty manager list”).
- Recipient resolution must be store-aware if multi-rooftop support is added.

### 3.3 Non-disableable (opt-out constraints)
- A Sales Manager cannot disable in-app notifications for appointment booked/changed/cancelled.
- A Sales Manager cannot disable email notifications for appointment booked/changed/cancelled.
- Quiet hours / digests may apply to **optional** channels and **non-critical** events only.

### 3.4 Required email address policy (deliverability prerequisite)
To satisfy “email is required” safely:
- Each manager recipient must have an email address on file.
- Email addresses must be verified (see §4.3).
- If verification is missing, the system must:
  - still create the in-app notification,
  - create a delivery audit record as `FAILED` with reason `EMAIL_UNVERIFIED`, and
  - raise a visible admin/manager banner: “Manager email not verified—required for appointment notifications.”

---

## 4) Channels, preferences, and opt-out rules

### 4.1 Channel overview
- **In-app:** required for all appointment events.
- **Email:** required for Sales Managers for appointment booked/changed/cancelled.
- **SMS:** optional (future), feature-flagged.

### 4.2 In-app (required)
- Always enabled.
- Must surface in:
  - notifications bell/feed,
  - appointment feed banner/badge for managers,
  - appointment detail drilldown (with audit timeline links).

### 4.3 Email (required for managers on appointment booked/changed/cancelled)
**Enablement rules:**
- For manager-critical appointment events, email sending is not “opt-in”; it is a required behavior.
- However, sending must still be **safety-gated** by:
  - verified email address per recipient,
  - dealer email-sending capability configured (domain/provider), and
  - test-mode controls (see §8).

**Verification rule (plan-level):**
- A manager’s email must be verified before external sending is allowed.
- Verification method is implementation-defined (token link, SSO-verified domain, etc.) but MUST produce an auditable `EMAIL_VERIFIED` event.

**Deliverability safeguards (requirements):**
- All required emails must be sent via a transactional provider that supports:
  - provider message id,
  - bounce/complaint feedback,
  - rate limiting.
- Hard bounces/complaints MUST automatically disable email to that address and create an in-app admin alert (see §7.4).

### 4.4 SMS (optional, gated)
Enable only when:
- dealership admin enables SMS channel,
- recipient phone is verified,
- SMS provider configured,
- feature flag is enabled.

Constraints:
- Respect quiet hours.
- SMS content must be short, non-sensitive.

### 4.5 Preferences model (what can/can’t be controlled)
Per-user preferences MAY control:
- optional channels (SMS),
- non-critical event categories,
- quiet hours/digest options for optional channels.

Per-user preferences MUST NOT control (cannot disable):
- Sales Manager **in-app** notifications for appointment booked/changed/cancelled.
- Sales Manager **email** notifications for appointment booked/changed/cancelled.

Dealer-level settings MAY control:
- which roles are considered “manager recipients” (all managers vs duty list),
- non-critical event routing.

Dealer-level settings MUST NOT disable:
- manager in-app + email for appointment booked/changed/cancelled.

---

## 5) Routing table (normative)

| Event | In-app (Mgr) | Email (Mgr) | SMS (Mgr) | Notes |
|---|---:|---:|---:|---|
| `APPOINTMENT_BOOKED_AUTO` | REQUIRED | REQUIRED | Optional | Appointment booked |
| `APPOINTMENT_BOOKED_MANUAL` | REQUIRED | REQUIRED | Optional | Appointment booked |
| `APPOINTMENT_RESCHEDULED` | REQUIRED | REQUIRED | Optional | Appointment changed |
| `APPOINTMENT_CANCELLED_BY_BUYER` | REQUIRED | REQUIRED | Optional | Appointment cancelled |
| `APPOINTMENT_CANCELLED_BY_DEALER` | REQUIRED | REQUIRED | Optional | Appointment cancelled |
| `APPOINTMENT_PENDING_CONFIRMATION` | REQUIRED | RECOMMENDED | Optional | Consider making REQUIRED if managers need immediate email |
| `CALENDAR_SYNC_FAILED` | REQUIRED | Optional | Optional | Ops/admin-type event |

---

## 6) Templates (minimum)

### 6.1 Appointment booked (manager)
**Title:** `Appointment booked: {buyerName} — {vehicleLabel}`

**Body must include:**
- datetime with timezone
- owner salesperson (or “Unassigned”)
- source channel (e.g., FB Marketplace)
- whether auto-booked vs manual
- location (if configured)
- deep link: “View appointment”

### 6.2 Appointment changed (rescheduled)
Include:
- previous datetime
- new datetime
- actor (buyer/dealer/system)
- deep link

### 6.3 Appointment cancelled
Include:
- datetime that was cancelled
- cancellation actor (buyer/dealer)
- deep link

### 6.4 Required email headers/content constraints
- Subject must be unambiguous and include dealership name.
- Must not include sensitive info.
- Must include a deep link and an appointment identifier.

---

## 7) Dedupe, idempotency, retries, and failure handling

### 7.1 Core idempotency keys
**Event idempotency:**
- `eventId` is globally unique and immutable.

**Notification idempotency (per recipient):**
- `notificationKey = dealerId + eventType + appointmentId + recipientUserId + eventId`

**Channel send idempotency (per recipient, per channel):**
- `sendKey = notificationKey + channel`

### 7.2 Exactly-once in-app record
- Creating the in-app notification record must be atomic with event persistence (implementation recommendation: outbox + unique constraint on `notificationKey`).

### 7.3 Email retry policy (requirements)
- Email sends must be retried with exponential backoff on transient errors.
- Retries MUST be idempotent using `sendKey` (no duplicate emails per provider when possible).
- After max attempts (implementation-defined), mark `FAILED` and escalate (see §7.4).

### 7.4 Escalation when email cannot be delivered
If a required email cannot be sent or is blocked due to deliverability (unverified/bounce/complaint):
- The in-app notification still exists (canonical).
- Create an additional in-app **Ops/Admin alert** for dealership admins/GM: “Manager appointment email delivery failing.”
- Surface a persistent banner in appointment feed/settings until resolved.
- Record reason codes:
  - `EMAIL_UNVERIFIED`
  - `EMAIL_HARD_BOUNCE`
  - `EMAIL_SPAM_COMPLAINT`
  - `EMAIL_PROVIDER_ERROR`

### 7.5 Throttling and collapsing
- If multiple changes occur rapidly (e.g., rescheduled twice within 2 minutes), the UI may collapse into a single “Appointment updated” card, but audit must retain each underlying event.
- Email for required events should be sent per event; if collapsing is implemented, ensure managers still get timely awareness (implementation choice).

---

## 8) Test-mode (no external side effects)

### 8.1 Purpose
Provide a deterministic way to exercise notification flows without sending real external emails/SMS.

### 8.2 Requirements
When `NOTIFICATIONS_TEST_MODE = true` (or equivalent):
- In-app notifications are still created normally.
- Email/SMS external sends are suppressed.
- Delivery attempts are still written to audit as `SUPPRESSED_TEST_MODE`.
- Subjects/bodies should be generated (for preview) and stored as sanitized render output for QA.

### 8.3 Test recipients override (optional)
If implemented:
- Route all outbound emails to a configured test inbox (e.g., `test-notifications@lotview.local`) with clear subject prefix `[TEST MODE]`.
- Still record the *intended* recipient in audit (do not leak to the actual email transport).

---

## 9) Audit log (delivery + content provenance)

### 9.1 Audit entities (conceptual)
- **NotificationEvent**: the normalized event that triggers notifications.
- **NotificationRecord (in-app)**: per user recipient record.
- **DeliveryAttempt**: per channel attempt record.

### 9.2 Minimum DeliveryAttempt fields
- `dealerId`
- `notificationId`
- `channel` = `IN_APP | EMAIL | SMS`
- `recipientUserId`
- `recipientAddress` (email/phone; may be hashed/redacted)
- `attemptedAt`
- `status` = `PENDING | SENT | DELIVERED | FAILED | SUPPRESSED_TEST_MODE`
- `providerMessageId` (if any)
- `errorCode` / `errorMessage` (sanitized)

### 9.3 Observability requirements (plan-level)
- Dealer admins/GM must be able to view:
  - recent failed email attempts,
  - bounce/complaint status,
  - test-mode state.

---

## 10) QA gates

1) **Mandatory manager in-app + email**
   - Booking/rescheduling/cancelling an appointment creates:
     - in-app notification for each manager recipient, and
     - an email delivery attempt for each manager recipient.

2) **Opt-out enforcement**
   - No preference setting can disable manager in-app/email for booked/changed/cancelled.

3) **Dedupe / idempotency**
   - Retried events do not create duplicate in-app notifications or duplicate email sends.

4) **Deliverability safeguards**
   - Unverified emails do not send externally; system escalates via in-app admin alert.
   - Hard bounce disables further sends to that address and escalates.

5) **Test-mode**
   - No external sends occur; audit shows suppression; in-app records still exist.

6) **Failure handling**
   - Provider outages produce retries and then a clear FAILED state with reason codes and escalation.

---

## Gap Report

### What changed vs prior spec
- Email to Sales Managers for appointment booked/changed/cancelled is now **REQUIRED**, not optional.
- Added deliverability safeguards, explicit opt-out constraints, test-mode, audit entity model, idempotency keys, and failure escalation requirements.

### Known missing items (intentional)
- Provider-specific integration details (DKIM setup steps, vendor selection, webhook schemas) are omitted.

### Why missing
- This subtask is specification-only and must avoid vendor coupling and external side effects.

### Auto-fill actions
- If implementation is authorized:
  - Choose provider + define domain authentication (SPF/DKIM/DMARC) playbook.
  - Implement outbox + unique constraints for idempotency keys.
  - Implement bounce/complaint ingestion and admin remediation UI.