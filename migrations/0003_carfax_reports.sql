CREATE TABLE "carfax_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer,
	"dealership_id" integer NOT NULL,
	"vin" text NOT NULL,
	"report_url" text,
	"accident_count" integer DEFAULT 0,
	"owner_count" integer DEFAULT 0,
	"service_record_count" integer DEFAULT 0,
	"last_reported_odometer" integer,
	"last_reported_date" text,
	"damage_reported" boolean DEFAULT false,
	"lien_reported" boolean DEFAULT false,
	"registration_history" jsonb,
	"service_history" jsonb,
	"accident_history" jsonb,
	"ownership_history" jsonb,
	"odometer_history" jsonb,
	"full_report_data" jsonb,
	"badges" text[],
	"scraped_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "carfax_reports" ADD CONSTRAINT "carfax_reports_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "carfax_reports" ADD CONSTRAINT "carfax_reports_dealership_id_dealerships_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "public"."dealerships"("id") ON DELETE cascade ON UPDATE no action;
