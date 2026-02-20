/**
 * Multi-Tenant Migration & Seed Script
 * 
 * IMPORTANT: Do NOT run this script manually!
 * 
 * Migration Strategy:
 * 1. Run `npm run db:push --force` to apply schema changes from shared/schema.ts
 * 2. The schema defines dealership_id as required on all tables
 * 3. Before running db:push, you must seed the default dealership first
 * 4. Then update existing records to reference the default dealership
 * 
 * This script is for REFERENCE only - use Drizzle's built-in migration system.
 * 
 * Proper Migration Steps:
 * 1. Temporarily make dealership_id nullable in schema (or delete all existing data)
 * 2. Run `npm run db:push --force` to create new tables and add columns
 * 3. Run this seed script to create default dealership
 * 4. Update existing records to set dealership_id = 1
 * 5. Make dealership_id non-nullable in schema
 * 6. Run `npm run db:push --force` again to enforce constraints
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  console.log('🚀 Starting multi-tenant migration...\n');

  try {
    // Step 1: Create dealerships table
    console.log('📋 Creating dealerships table...');
    await sql`
      CREATE TABLE IF NOT EXISTS dealerships (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        subdomain TEXT UNIQUE,
        logo TEXT,
        brand_colors TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        trial_ends_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log('✅ Dealerships table created\n');

    // Step 2: Insert default Olympic Auto Group dealership
    console.log('🏢 Creating default dealership: Olympic Auto Group...');
    const dealership = await sql`
      INSERT INTO dealerships (name, slug, subdomain, status, brand_colors)
      VALUES (
        'Olympic Auto Group',
        'olympic-auto',
        'olympic',
        'active',
        '{"primary": "#022d60", "secondary": "#00aad2"}'
      )
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;
    const dealershipId = dealership[0].id;
    console.log(`✅ Default dealership created with ID: ${dealershipId}\n`);

    // Step 3: Create subscription and API keys tables
    console.log('📋 Creating dealership_subscriptions table...');
    await sql`
      CREATE TABLE IF NOT EXISTS dealership_subscriptions (
        id SERIAL PRIMARY KEY,
        dealership_id INTEGER NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
        plan TEXT NOT NULL DEFAULT 'starter',
        status TEXT NOT NULL DEFAULT 'trial',
        current_period_end TIMESTAMP,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        monthly_price INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log('✅ Dealership subscriptions table created\n');

    console.log('🔑 Creating dealership_api_keys table...');
    await sql`
      CREATE TABLE IF NOT EXISTS dealership_api_keys (
        id SERIAL PRIMARY KEY,
        dealership_id INTEGER NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
        marketcheck_key TEXT,
        apify_token TEXT,
        apify_actor_id TEXT,
        gemini_api_key TEXT,
        ghl_api_key TEXT,
        ghl_location_id TEXT,
        facebook_app_id TEXT,
        facebook_app_secret TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    console.log('✅ Dealership API keys table created\n');

    // Step 4: Add dealership_id columns to existing tables (nullable for now)
    console.log('🔧 Adding dealership_id columns to existing tables...\n');

    const tables = [
      'vehicles',
      'vehicle_views',
      'facebook_pages',
      'page_priority_vehicles',
      'ghl_config',
      'ghl_webhook_config',
      'ai_prompt_templates',
      'chat_conversations',
      'chat_prompts',
      'users',
      'credit_score_tiers',
      'model_year_terms',
      'facebook_accounts',
      'ad_templates',
      'posting_queue',
      'posting_schedule',
      'remarketing_vehicles',
      'pbs_config',
      'pbs_webhook_events',
      'manager_settings',
      'market_listings'
    ];

    for (const table of tables) {
      try {
        console.log(`  Adding dealership_id to ${table}...`);
        await sql`ALTER TABLE ${sql(table)} ADD COLUMN IF NOT EXISTS dealership_id INTEGER`;
        console.log(`  ✅ ${table} updated`);
      } catch (error: any) {
        console.log(`  ⚠️  ${table}: ${error.message}`);
      }
    }

    console.log('\n🔄 Updating all existing records with default dealership ID...\n');

    // Step 5: Update all existing records with the default dealership ID
    for (const table of tables) {
      try {
        // Special case for users table - master users should have NULL dealership_id
        if (table === 'users') {
          console.log(`  Updating ${table} (keeping master users with NULL dealership_id)...`);
          await sql`
            UPDATE ${sql(table)} 
            SET dealership_id = ${dealershipId}
            WHERE dealership_id IS NULL AND role != 'master'
          `;
        } else {
          console.log(`  Updating ${table}...`);
          await sql`
            UPDATE ${sql(table)} 
            SET dealership_id = ${dealershipId}
            WHERE dealership_id IS NULL
          `;
        }
        console.log(`  ✅ ${table} records updated`);
      } catch (error: any) {
        console.log(`  ⚠️  ${table}: ${error.message}`);
      }
    }

    console.log('\n🔒 Making dealership_id columns non-nullable (except users)...\n');

    // Step 6: Make dealership_id non-nullable (except for users table where master users have NULL)
    for (const table of tables) {
      if (table === 'users') {
        console.log(`  Skipping ${table} (master users can have NULL dealership_id)`);
        continue;
      }

      try {
        console.log(`  Making dealership_id NOT NULL in ${table}...`);
        await sql`
          ALTER TABLE ${sql(table)} 
          ALTER COLUMN dealership_id SET NOT NULL
        `;
        console.log(`  ✅ ${table} dealership_id is now NOT NULL`);
      } catch (error: any) {
        console.log(`  ⚠️  ${table}: ${error.message}`);
      }
    }

    console.log('\n🔗 Adding foreign key constraints...\n');

    // Step 7: Add foreign key constraints
    for (const table of tables) {
      try {
        console.log(`  Adding FK constraint to ${table}...`);
        await sql`
          ALTER TABLE ${sql(table)} 
          ADD CONSTRAINT ${sql(`${table}_dealership_id_fkey`)} 
          FOREIGN KEY (dealership_id) 
          REFERENCES dealerships(id) 
          ON DELETE CASCADE
        `;
        console.log(`  ✅ ${table} FK constraint added`);
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          console.log(`  ℹ️  ${table} FK constraint already exists`);
        } else {
          console.log(`  ⚠️  ${table}: ${error.message}`);
        }
      }
    }

    console.log('\n🎉 Multi-tenant migration completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Run: npm run db:push --force');
    console.log('   2. Restart your application');
    console.log('   3. Test multi-tenant functionality\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
