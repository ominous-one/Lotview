-- Inventory Sync v1.1 (follow-up): identity normalization + photo status + autopost eligibility fields

ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "normalized_stock_number" text;
--> statement-breakpoint

-- Photo status: pending when 0 photos, complete when >=10 unique, etc.
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "photo_status" text NOT NULL DEFAULT 'unknown';
--> statement-breakpoint

-- Autopost eligibility computed field (consumed by queue)
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "autopost_eligible" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "autopost_block_reason" text;
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "autopost_ready_at" timestamp;
--> statement-breakpoint

-- Backfill normalized_stock_number from stock_number
UPDATE "vehicles"
SET "normalized_stock_number" = UPPER(REGEXP_REPLACE(COALESCE("stock_number", ''), '[^A-Za-z0-9]', '', 'g'))
WHERE ("normalized_stock_number" IS NULL OR "normalized_stock_number" = '') AND "stock_number" IS NOT NULL;
--> statement-breakpoint

-- Canonical identity index uses normalized stock
CREATE UNIQUE INDEX IF NOT EXISTS "vehicles_dealership_vin_normstock_uq"
  ON "vehicles" ("dealership_id", "vin", "normalized_stock_number")
  WHERE "vin" IS NOT NULL AND "normalized_stock_number" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vehicles_dealership_normstock_idx" ON "vehicles" ("dealership_id", "normalized_stock_number");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "vehicles_dealership_autopost_eligible_idx" ON "vehicles" ("dealership_id", "autopost_eligible", "autopost_ready_at");
--> statement-breakpoint
