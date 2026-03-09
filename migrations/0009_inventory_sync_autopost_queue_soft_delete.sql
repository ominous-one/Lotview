-- Inventory Sync v1.1: soft delete + identity + enrichment observability + autopost priority queue

CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint

-- ===== Vehicles: soft delete + lifecycle + enrichment counters =====
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "deleted_by_user_id" integer;
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "deleted_reason" text;
--> statement-breakpoint

ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "lifecycle_status" text NOT NULL DEFAULT 'ACTIVE';
--> statement-breakpoint

ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "photo_enrich_fail_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "photo_enrich_last_attempt_at" timestamp;
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "photo_enrich_last_error" text;
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "photo_fingerprint" text;
--> statement-breakpoint

ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "last_price_refresh_at" timestamp;
--> statement-breakpoint

-- Identity index: dealershipId + vin + stockNumber (partial; avoid NULL collisions)
CREATE UNIQUE INDEX IF NOT EXISTS "vehicles_dealership_vin_stock_uq"
  ON "vehicles" ("dealership_id", "vin", "stock_number")
  WHERE "vin" IS NOT NULL AND "stock_number" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vehicles_dealership_deleted_at_idx" ON "vehicles" ("dealership_id", "deleted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_dealership_lifecycle_idx" ON "vehicles" ("dealership_id", "lifecycle_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_dealership_photo_enrich_idx" ON "vehicles" ("dealership_id", "photo_enrich_fail_count", "photo_enrich_last_attempt_at");
--> statement-breakpoint

-- ===== Autopost Priority Queue =====
CREATE TABLE IF NOT EXISTS "autopost_queue_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dealership_id" integer NOT NULL,
  "vehicle_id" integer NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "priority_rank" integer NOT NULL,
  "queued_at" timestamp NOT NULL DEFAULT now(),
  "dequeued_at" timestamp,
  "blocked_reason" text,
  "photo_gate_override" boolean NOT NULL DEFAULT false,
  "photo_gate_override_by_user_id" integer,
  "photo_gate_override_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "autopost_queue_items" ADD CONSTRAINT IF NOT EXISTS "autopost_queue_items_dealership_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "autopost_queue_items" ADD CONSTRAINT IF NOT EXISTS "autopost_queue_items_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "autopost_queue_items_active_uq" ON "autopost_queue_items" ("dealership_id", "vehicle_id") WHERE "is_active" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "autopost_queue_items_dealership_active_rank_idx" ON "autopost_queue_items" ("dealership_id", "is_active", "priority_rank");
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "autopost_platform" AS ENUM ('facebook_marketplace','craigslist');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "autopost_platform_status" AS ENUM ('not_queued','queued','blocked','claimed','posting','posted','failed','skipped');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "autopost_platform_statuses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dealership_id" integer NOT NULL,
  "queue_item_id" uuid NOT NULL,
  "platform" autopost_platform NOT NULL,
  "status" autopost_platform_status NOT NULL DEFAULT 'queued',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "last_attempt_at" timestamp,
  "last_error" text,
  "posted_url" text,
  "posted_external_id" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "autopost_platform_statuses" ADD CONSTRAINT IF NOT EXISTS "autopost_platform_statuses_dealership_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "autopost_platform_statuses" ADD CONSTRAINT IF NOT EXISTS "autopost_platform_statuses_queue_item_id_fk" FOREIGN KEY ("queue_item_id") REFERENCES "public"."autopost_queue_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "autopost_platform_statuses_queue_platform_uq" ON "autopost_platform_statuses" ("queue_item_id", "platform");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "autopost_platform_statuses_lookup_idx" ON "autopost_platform_statuses" ("dealership_id", "platform", "status", "updated_at");
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "autopost_event_type" AS ENUM (
    'ENQUEUED',
    'DEQUEUED',
    'PRIORITY_REORDERED',
    'PHOTO_GATE_BLOCKED',
    'PHOTO_GATE_OVERRIDE_SET',
    'ELIGIBILITY_CHANGED',
    'CLAIMED',
    'POSTING_STARTED',
    'POSTED_SUCCESS',
    'POSTED_FAILED',
    'SKIPPED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "autopost_queue_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dealership_id" integer NOT NULL,
  "queue_item_id" uuid NOT NULL,
  "platform" autopost_platform,
  "actor_user_id" integer,
  "event_type" autopost_event_type NOT NULL,
  "message" text,
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "autopost_queue_events" ADD CONSTRAINT IF NOT EXISTS "autopost_queue_events_dealership_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "autopost_queue_events" ADD CONSTRAINT IF NOT EXISTS "autopost_queue_events_queue_item_id_fk" FOREIGN KEY ("queue_item_id") REFERENCES "public"."autopost_queue_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "autopost_queue_events_dealership_created_at_idx" ON "autopost_queue_events" ("dealership_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "autopost_queue_events_queue_item_created_at_idx" ON "autopost_queue_events" ("queue_item_id", "created_at");
--> statement-breakpoint

-- ===== Vehicle audit events (soft delete + admin actions) =====
CREATE TABLE IF NOT EXISTS "vehicle_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dealership_id" integer NOT NULL,
  "vehicle_id" integer NOT NULL,
  "actor_user_id" integer,
  "action" text NOT NULL,
  "reason" text,
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "vehicle_audit_events" ADD CONSTRAINT IF NOT EXISTS "vehicle_audit_events_dealership_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "vehicle_audit_events" ADD CONSTRAINT IF NOT EXISTS "vehicle_audit_events_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicle_audit_events_dealership_created_at_idx" ON "vehicle_audit_events" ("dealership_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicle_audit_events_vehicle_created_at_idx" ON "vehicle_audit_events" ("vehicle_id", "created_at");
--> statement-breakpoint
