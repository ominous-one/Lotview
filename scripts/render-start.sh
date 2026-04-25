#!/bin/bash
# Lotview SaaS — Render Startup Script
# Runs at container startup on Render

set -euo pipefail

echo "═══════════════════════════════════════════"
echo "  Lotview — Starting on Render"
echo "  Process: ${LOTVIEW_SCHEDULER_PROCESS:-web}"
echo "  Port: ${PORT:-10000}"
echo "═══════════════════════════════════════════"

# 1. Run database migrations
echo "🐘 Running database migrations..."
if [ -n "${DATABASE_URL:-}" ]; then
  npx drizzle-kit migrate 2>/dev/null || echo "   ⚠️  Migration will be handled by seed script"
  
  # Apply performance indexes
  echo "📊 Applying performance indexes..."
  psql "$DATABASE_URL" -f drizzle/migrations/0001_performance_indexes.sql 2>/dev/null || echo "   ⚠️  Indexes may already exist"
  
  # Apply Carfax/AI fields
  echo "🔍 Applying Carfax + AI fields..."
  psql "$DATABASE_URL" -f drizzle/migrations/0002_carfax_merge_ai_fields.sql 2>/dev/null || echo "   ⚠️  Carfax fields may already exist"
else
  echo "   ❌ DATABASE_URL not set!"
  exit 1
fi

# 2. Seed database if empty
echo "🌱 Checking if seed is needed..."
SEED_CHECK=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
if [ "$SEED_CHECK" = "0" ] || [ -z "$SEED_CHECK" ]; then
  echo "   Database empty — running seed..."
  npx tsx scripts/seed.ts 2>/dev/null || echo "   ⚠️  Seed requires tsx — install with: npm install -g tsx"
else
  echo "   Database already seeded ($SEED_CHECK users)"
fi

# 3. Start the application
echo "🚀 Starting application..."
echo "═══════════════════════════════════════════"

if [ "${LOTVIEW_SCHEDULER_PROCESS:-web}" = "worker" ]; then
  echo "   Mode: WORKER (background jobs + schedulers)"
  exec node dist/index-worker.js
else
  echo "   Mode: WEB (API server)"
  exec node dist/index.js
fi
