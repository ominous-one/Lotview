/**
 * Push ai_settings table to production database via direct SQL.
 * Usage: npx tsx push-ai-settings.ts
 */
import pg from "pg";

const DATABASE_URL = "postgresql://lotview:5KdItEyPBMM2jdiwXPkMrXSsFld9kEha@dpg-d6etlto8tnhs73emduk0-a.oregon-postgres.render.com/lotview?sslmode=require";

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log("Connected to production database.");

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS ai_settings (
      id SERIAL PRIMARY KEY,
      dealership_id INTEGER NOT NULL UNIQUE REFERENCES dealerships(id) ON DELETE CASCADE,
      sales_personality TEXT,
      greeting_template TEXT,
      tone TEXT DEFAULT 'professional',
      response_length TEXT DEFAULT 'short',
      always_include TEXT,
      never_say TEXT,
      objection_handling JSONB,
      business_hours TEXT,
      escalation_rules TEXT,
      custom_ctas TEXT,
      sample_conversations TEXT,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );
  `;

  await client.query(createTableSQL);
  console.log("✅ ai_settings table created (or already exists).");

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
