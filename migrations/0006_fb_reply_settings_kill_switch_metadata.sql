-- Workstream 4D UX: kill switch confirmation metadata

ALTER TABLE "fb_reply_settings"
  ADD COLUMN IF NOT EXISTS "global_kill_switch_last_toggled_at" timestamp;
--> statement-breakpoint
ALTER TABLE "fb_reply_settings"
  ADD COLUMN IF NOT EXISTS "global_kill_switch_last_toggled_by" text;
--> statement-breakpoint
ALTER TABLE "fb_reply_settings"
  ADD COLUMN IF NOT EXISTS "global_kill_switch_last_reason" text;
