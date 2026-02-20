CREATE TABLE "admin_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"prompt_text" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"vehicle_id" integer,
	"vehicle_name" text,
	"messages" text NOT NULL,
	"session_id" text NOT NULL,
	"handoff_requested" boolean DEFAULT false NOT NULL,
	"handoff_phone" text,
	"handoff_sent" boolean DEFAULT false NOT NULL,
	"handoff_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_prompts" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario" text NOT NULL,
	"system_prompt" text NOT NULL,
	"greeting" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_prompts_scenario_unique" UNIQUE("scenario")
);
--> statement-breakpoint
CREATE TABLE "facebook_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_name" text NOT NULL,
	"page_id" text NOT NULL,
	"access_token" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"selected_template" text DEFAULT 'modern' NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "facebook_pages_page_id_unique" UNIQUE("page_id")
);
--> statement-breakpoint
CREATE TABLE "ghl_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_key" text NOT NULL,
	"location_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ghl_webhook_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"webhook_url" text NOT NULL,
	"webhook_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_priority_vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_id" integer NOT NULL,
	"vehicle_id" integer NOT NULL,
	"priority" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"session_id" text NOT NULL,
	"viewed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"trim" text NOT NULL,
	"type" text NOT NULL,
	"price" integer NOT NULL,
	"odometer" integer NOT NULL,
	"images" text[] NOT NULL,
	"badges" text[] NOT NULL,
	"location" text NOT NULL,
	"dealership" text NOT NULL,
	"description" text NOT NULL,
	"full_page_content" text,
	"vin" text,
	"stock_number" text,
	"cargurus_price" integer,
	"cargurus_url" text,
	"deal_rating" text,
	"video_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_priority_vehicles" ADD CONSTRAINT "page_priority_vehicles_page_id_facebook_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."facebook_pages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_priority_vehicles" ADD CONSTRAINT "page_priority_vehicles_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_views" ADD CONSTRAINT "vehicle_views_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;