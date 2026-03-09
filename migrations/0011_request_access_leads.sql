-- Request access leads captured from marketing site

CREATE TABLE IF NOT EXISTS "request_access_leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "dealership" text NOT NULL,
  "phone" text,
  "source_hostname" text,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "request_access_leads_created_at_idx" ON "request_access_leads" ("created_at");
CREATE INDEX IF NOT EXISTS "request_access_leads_email_idx" ON "request_access_leads" ("email");
