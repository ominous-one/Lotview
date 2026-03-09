-- Automation Overhaul WS2+WS3 hardening: per-dealership settings persistence

CREATE TABLE IF NOT EXISTS "dealership_automation_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "dealership_id" integer NOT NULL,

  -- Competitive report settings
  "competitive_report_default_radius_km" integer NOT NULL DEFAULT 100,
  "competitive_report_cadence_hours" integer NOT NULL DEFAULT 48,
  "competitive_report_allow_national" boolean NOT NULL DEFAULT true,

  -- Business hours and thresholds are stored as JSON for forward compatibility.
  -- Example businessHours shape:
  -- { tz: 'America/Vancouver', days: { mon: { start: '09:00', end: '18:00' }, ... } }
  "business_hours" jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Example thresholds shape:
  -- { minCompsHigh: 10, minCompsMedium: 4, deltaBand: 500 }
  "thresholds" jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- ZenRows fallback (market aggregation) settings
  "zenrows_fallback_enabled" boolean NOT NULL DEFAULT false,
  "zenrows_max_calls_per_minute" integer NOT NULL DEFAULT 6,
  "zenrows_max_calls_per_hour" integer NOT NULL DEFAULT 120,

  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "dealership_automation_settings"
  ADD CONSTRAINT "dealership_automation_settings_dealership_id_fk"
  FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "dealership_automation_settings_dealership_id_uq"
  ON "dealership_automation_settings" ("dealership_id");
