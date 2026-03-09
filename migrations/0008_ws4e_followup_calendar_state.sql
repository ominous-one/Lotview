-- WS4E follow-ups + state machine idempotency + notification event dedupe

-- ===== Appointment audit events: transition idempotency =====
ALTER TABLE "appointment_audit_events"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "appointment_audit_events_idempotency_uq"
  ON "appointment_audit_events"("dealership_id", "appointment_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- ===== Notification events: event key for dedupe =====
ALTER TABLE "notification_events"
  ADD COLUMN IF NOT EXISTS "event_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "notification_events_event_key_uq"
  ON "notification_events"("dealership_id", "event_key")
  WHERE "event_key" IS NOT NULL;

-- ===== Follow-up tasks (WS4E) =====
CREATE TABLE IF NOT EXISTS "follow_up_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dealership_id" integer NOT NULL REFERENCES "dealerships"("id") ON DELETE CASCADE,
  "appointment_id" uuid REFERENCES "appointments"("id") ON DELETE CASCADE,
  "owner_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "kind" text NOT NULL,
  "status" text NOT NULL DEFAULT 'OPEN',
  "title" text NOT NULL,
  "description" text,
  "due_at" timestamptz,
  "completed_at" timestamptz,
  "created_by_type" text NOT NULL DEFAULT 'SYSTEM',
  "created_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "follow_up_tasks_dealer_due_idx" ON "follow_up_tasks"("dealership_id", "due_at");
CREATE INDEX IF NOT EXISTS "follow_up_tasks_owner_due_idx" ON "follow_up_tasks"("owner_user_id", "due_at");
