-- Workstream 4D: FB Marketplace Replies (server source of truth)

CREATE TABLE IF NOT EXISTS "fb_reply_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "dealership_id" integer NOT NULL,
  "auto_send_enabled" boolean DEFAULT true NOT NULL,
  "global_kill_switch" boolean DEFAULT false NOT NULL,
  "business_hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "rate_limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "thresholds" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "typing_sim" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dry_run" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "fb_reply_settings_dealership_id_unique" UNIQUE("dealership_id")
);
--> statement-breakpoint
ALTER TABLE "fb_reply_settings" ADD CONSTRAINT "fb_reply_settings_dealership_id_dealerships_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "fb_inbox_threads" (
  "id" serial PRIMARY KEY NOT NULL,
  "dealership_id" integer NOT NULL,
  "fb_thread_id" text NOT NULL,
  "fb_account_id" integer,

  "participant_name" text,
  "participant_id" text,
  "lead_name_confidence" real DEFAULT 0 NOT NULL,

  "listing_url" text,
  "listing_title" text,

  "vehicle_id" integer,
  "vehicle_mapping_confidence" real DEFAULT 0 NOT NULL,
  "vehicle_mapping_method" text,

  "state" text DEFAULT 'NEW_INBOUND' NOT NULL,
  "unread_count" integer DEFAULT 0 NOT NULL,
  "last_inbound_at" timestamp,
  "last_outbound_at" timestamp,
  "last_message_at" timestamp,

  "do_not_contact" boolean DEFAULT false NOT NULL,
  "escalated" boolean DEFAULT false NOT NULL,

  "is_paused" boolean DEFAULT false NOT NULL,
  "auto_send_enabled" boolean DEFAULT true NOT NULL,

  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "fb_inbox_threads_dealership_thread_uq" UNIQUE("dealership_id", "fb_thread_id")
);
--> statement-breakpoint
ALTER TABLE "fb_inbox_threads" ADD CONSTRAINT "fb_inbox_threads_dealership_id_dealerships_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fb_inbox_threads" ADD CONSTRAINT "fb_inbox_threads_fb_account_id_fb_marketplace_accounts_id_fk" FOREIGN KEY ("fb_account_id") REFERENCES "public"."fb_marketplace_accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fb_inbox_threads" ADD CONSTRAINT "fb_inbox_threads_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fb_inbox_threads_dealership_last_message_idx" ON "fb_inbox_threads" ("dealership_id", "last_message_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "fb_inbox_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "dealership_id" integer NOT NULL,
  "thread_id" integer NOT NULL,
  "fb_message_id" text,
  "direction" text NOT NULL,
  "sender_role" text NOT NULL,
  "sent_at" timestamp,
  "text" text NOT NULL,
  "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "ingested_from" text DEFAULT 'EXTENSION_DOM' NOT NULL,
  "safety_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dedupe_hash" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fb_inbox_messages" ADD CONSTRAINT "fb_inbox_messages_dealership_id_dealerships_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fb_inbox_messages" ADD CONSTRAINT "fb_inbox_messages_thread_id_fb_inbox_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."fb_inbox_threads"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fb_inbox_messages_thread_fb_message_uq" ON "fb_inbox_messages" ("thread_id", "fb_message_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fb_inbox_messages_thread_dedupe_uq" ON "fb_inbox_messages" ("thread_id", "dedupe_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fb_inbox_messages_thread_sent_at_idx" ON "fb_inbox_messages" ("thread_id", "sent_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "fb_inbox_audit_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "dealership_id" integer NOT NULL,
  "thread_id" integer,
  "event_key" text NOT NULL,
  "kind" text NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fb_inbox_audit_events" ADD CONSTRAINT "fb_inbox_audit_events_dealership_id_dealerships_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fb_inbox_audit_events" ADD CONSTRAINT "fb_inbox_audit_events_thread_id_fb_inbox_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."fb_inbox_threads"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fb_inbox_audit_events_dealership_event_key_uq" ON "fb_inbox_audit_events" ("dealership_id", "event_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fb_inbox_audit_events_dealership_created_at_idx" ON "fb_inbox_audit_events" ("dealership_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "fb_thread_vehicle_map" (
  "id" serial PRIMARY KEY NOT NULL,
  "dealership_id" integer NOT NULL,
  "fb_thread_id" text NOT NULL,
  "participant_name" text DEFAULT '' NOT NULL,
  "listing_url" text DEFAULT '' NOT NULL,
  "vehicle_id" integer NOT NULL,
  "confidence" real DEFAULT 0 NOT NULL,
  "method" text DEFAULT 'unknown' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "fb_thread_vehicle_map_uq" UNIQUE("dealership_id", "fb_thread_id", "participant_name", "listing_url")
);
--> statement-breakpoint
ALTER TABLE "fb_thread_vehicle_map" ADD CONSTRAINT "fb_thread_vehicle_map_dealership_id_dealerships_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fb_thread_vehicle_map" ADD CONSTRAINT "fb_thread_vehicle_map_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fb_thread_vehicle_map_dealership_idx" ON "fb_thread_vehicle_map" ("dealership_id");
