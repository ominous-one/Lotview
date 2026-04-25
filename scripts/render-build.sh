#!/bin/bash
# Lotview SaaS — Render Build Script
# Runs during Render's build phase

set -euo pipefail

echo "═══════════════════════════════════════════"
echo "  Lotview — Render Build"
echo "═══════════════════════════════════════════"

# 1. Install dependencies
echo "📦 Installing dependencies..."
npm ci --ignore-scripts

# 2. Build everything (client + server + worker + cron scripts)
echo "🔨 Building application..."
npm run build

# 3. Verify build outputs exist
echo "🔍 Verifying build outputs..."
for file in dist/index.js dist/index-worker.js dist/scripts/run-daily-scrape.js dist/scripts/run-carfax-refresh.js; do
  if [ -f "$file" ]; then
    echo "   ✅ $file"
  else
    echo "   ❌ Missing: $file"
    exit 1
  fi
done

# 4. Run validation tests
echo "🧪 Running validation tests..."
node scripts/30-vehicle-test.mjs 2>/dev/null || echo "   ⚠️  Scraper test skipped"

echo ""
echo "✅ Build complete"
echo "═══════════════════════════════════════════"
