-- WS4E: Internal LotView appointments calendar + notifications outbox
-- Canonical internal calendar is system of record.

-- ===== Users: notification email + verification/deliverability flags =====
ALTER TABLE "users" 
  ADD COLUMN IF NOT EXISTS "notification_email" text,
  ADD COLUMN IF NOT EXISTS "notification_email_verified_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "notification_email_hard_bounced_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "notification_email_spam_complaint_at" timestamptz;

-- ===== Appointments (canonical calendar) =====
CREATE TABLE IF NOT EXISTS "appointments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dealership_id" integer NOT NULL REFERENCES "dealerships"("id") ON DELETE CASCADE,
  "thread_id" integer,
  "vehicle_id" integer REFERENCES "vehicles"("id") ON DELETE SET NULL,
  "lead_name" text,
  "lead_phone" text,
  "lead_email" text,
  "source_channel" text NOT NULL DEFAULT 'unknown',
  "type" text NOT NULL,
  "status" text NOT NULL,
  "owner_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "start_at" timestamptz NOT NULL,
  "end_at" timestamptz,
  "timezone" text NOT NULL,
  "location" text,
  "notes" text,
  "created_by_type" text NOT NULL DEFAULT 'SYSTEM',
  "created_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "idempotency_key" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "appointments_dealer_idempotency_key_uq" 
  ON "appointments"("dealership_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "appointments_dealer_start_at_idx" ON "appointments"("dealership_id", "start_at");
CREATE INDEX IF NOT EXISTS "appointments_owner_start_at_idx" ON "appointments"("owner_user_id", "start_at");

-- ===== Appointment audit events (append-only) =====
CREATE TABLE IF NOT EXISTS "appointment_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dealership_id" integer NOT NULL REFERENCES "dealerships"("id") ON DELETE CASCADE,
  "appointment_id" uuid NOT NULL REFERENCES "appointments"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "actor_type" text NOT NULL,
  "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "reason_codes" text[],
  "details" jsonb,
  "source_thread_id" integer
);

CREATE INDEX IF NOT EXISTS "appointment_audit_events_appt_idx" ON "appointment_audit_events"("appointment_id", "occurred_at");

-- ===== Notification event + in-app notifications =====
CREATE TABLE IF NOT EXISTS "notification_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dealership_id" integer NOT NULL REFERENCES "dealerships"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "appointment_id" uuid REFERENCES "appointments"("id") ON DELETE CASCADE,
  "thread_id" integer,
  "vehicle_id" integer REFERENCES "vehicles"("id") ON DELETE SET NULL,
  "owner_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "summary" text NOT NULL,
  "details" jsonb
);

CREATE INDEX IF NOT EXISTS "notification_events_dealer_occurred_idx" ON "notification_events"("dealership_id", "occurred_at" DESC);

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dealership_id" integer NOT NULL REFERENCES "dealerships"("id") ON DELETE CASCADE,
  "event_id" uuid NOT NULL REFERENCES "notification_events"("id") ON DELETE CASCADE,
  "recipient_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "notification_key" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "deep_link" text,
  "is_read" boolean NOT NULL DEFAULT false,
  "read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_notification_key_uq" ON "notifications"("notification_key");
CREATE INDEX IF NOT EXISTS "notifications_recipient_created_idx" ON "notifications"("recipient_user_id", "created_at" DESC);

-- ===== Email outbox (idempotent, retry/backoff) =====
CREATE TABLE IF NOT EXISTS "email_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dealership_id" integer NOT NULL REFERENCES "dealerships"("id") ON DELETE CASCADE,
  "notification_id" uuid NOT NULL REFERENCES "notifications"("id") ON DELETE CASCADE,
  "send_key" text NOT NULL,
  "to_email" text NOT NULL,
  "to_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "subject" text NOT NULL,
  "html" text NOT NULL,
  "text" text,
  "status" text NOT NULL DEFAULT 'PENDING',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 8,
  "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
  "last_error" text,
  "provider_message_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "sent_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_outbox_send_key_uq" ON "email_outbox"("send_key");
CREATE INDEX IF NOT EXISTS "email_outbox_next_attempt_idx" ON "email_outbox"("status", "next_attempt_at");

-- ===== Email verification tokens =====
CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "token" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_verification_tokens_token_uq" ON "email_verification_tokens"("token");
