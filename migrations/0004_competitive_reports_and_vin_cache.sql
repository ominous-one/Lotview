CREATE TABLE "vin_decode_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"dealership_id" integer NOT NULL,
	"vin" text NOT NULL,
	"baseline_source" text NOT NULL,
	"baseline_payload" jsonb NOT NULL,
	"enriched_source" text,
	"enriched_payload" jsonb,
	"trim_confidence" text NOT NULL DEFAULT 'unknown',
	"options_confidence" text NOT NULL DEFAULT 'unknown',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "vin_decode_cache" ADD CONSTRAINT "vin_decode_cache_dealership_id_dealerships_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "vin_decode_cache_dealership_vin_uq" ON "vin_decode_cache" ("dealership_id", "vin");
--> statement-breakpoint
CREATE INDEX "vin_decode_cache_dealership_id_idx" ON "vin_decode_cache" ("dealership_id");
--> statement-breakpoint
CREATE INDEX "vin_decode_cache_updated_at_idx" ON "vin_decode_cache" ("updated_at");
--> statement-breakpoint

CREATE TABLE "competitive_report_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"dealership_id" integer NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"radius_km" integer NOT NULL DEFAULT 100,
	"sources" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"status" text NOT NULL DEFAULT 'success',
	"metrics" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "competitive_report_runs_dealership_generated_at_idx" ON "competitive_report_runs" ("dealership_id", "generated_at");
--> statement-breakpoint
ALTER TABLE "competitive_report_runs" ADD CONSTRAINT "competitive_report_runs_dealership_id_dealerships_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE TABLE "competitive_report_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"vehicle_id" integer NOT NULL,
	"vin" text,
	"year" integer,
	"make" text,
	"model" text,
	"trim" text,
	"our_price" integer,
	"our_mileage" integer,
	"our_days_on_lot" integer,
	"comp_count" integer NOT NULL DEFAULT 0,
	"comp_median_price" integer,
	"delta_to_median" integer,
	"position" text,
	"confidence" text NOT NULL DEFAULT 'low',
	"comps" jsonb NOT NULL DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "competitive_report_units_run_id_idx" ON "competitive_report_units" ("run_id");
--> statement-breakpoint
CREATE INDEX "competitive_report_units_vehicle_id_idx" ON "competitive_report_units" ("vehicle_id");
--> statement-breakpoint
ALTER TABLE "competitive_report_units" ADD CONSTRAINT "competitive_report_units_run_id_competitive_report_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."competitive_report_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "competitive_report_units" ADD CONSTRAINT "competitive_report_units_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;
