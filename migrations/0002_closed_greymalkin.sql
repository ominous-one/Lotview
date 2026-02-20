CREATE TABLE "ad_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"template_name" text NOT NULL,
	"title_template" text NOT NULL,
	"description_template" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_score_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tier_name" text NOT NULL,
	"min_score" integer NOT NULL,
	"max_score" integer NOT NULL,
	"interest_rate" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facebook_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"account_name" text NOT NULL,
	"facebook_user_id" text,
	"access_token" text,
	"token_expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manager_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"postal_code" text NOT NULL,
	"default_radius_km" integer DEFAULT 50 NOT NULL,
	"geocode_lat" text,
	"geocode_lon" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"source" text NOT NULL,
	"listing_type" text NOT NULL,
	"year" integer NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"trim" text,
	"price" integer NOT NULL,
	"mileage" integer,
	"location" text NOT NULL,
	"postal_code" text,
	"latitude" text,
	"longitude" text,
	"seller_name" text,
	"image_url" text,
	"listing_url" text NOT NULL,
	"posted_date" timestamp,
	"scraped_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "market_listings_listing_url_unique" UNIQUE("listing_url")
);
--> statement-breakpoint
CREATE TABLE "model_year_terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"min_model_year" integer NOT NULL,
	"max_model_year" integer NOT NULL,
	"available_terms" text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pbs_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"webhook_url" text,
	"webhook_secret" text,
	"pbs_api_url" text DEFAULT 'https://partnerhub.pbsdealers.com' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pbs_webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"event_id" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"processed_at" timestamp,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posting_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"facebook_account_id" integer,
	"vehicle_id" integer NOT NULL,
	"template_id" integer,
	"queue_order" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"scheduled_for" timestamp,
	"posted_at" timestamp,
	"facebook_post_id" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posting_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"start_time" text DEFAULT '09:00' NOT NULL,
	"interval_minutes" integer DEFAULT 30 NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"last_posted_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "posting_schedule_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "remarketing_vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"budget_priority" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ad_templates" ADD CONSTRAINT "ad_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facebook_accounts" ADD CONSTRAINT "facebook_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_settings" ADD CONSTRAINT "manager_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posting_queue" ADD CONSTRAINT "posting_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posting_queue" ADD CONSTRAINT "posting_queue_facebook_account_id_facebook_accounts_id_fk" FOREIGN KEY ("facebook_account_id") REFERENCES "public"."facebook_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posting_queue" ADD CONSTRAINT "posting_queue_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posting_queue" ADD CONSTRAINT "posting_queue_template_id_ad_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."ad_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posting_schedule" ADD CONSTRAINT "posting_schedule_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remarketing_vehicles" ADD CONSTRAINT "remarketing_vehicles_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;