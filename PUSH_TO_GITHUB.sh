#!/bin/bash
# Push Lotview v1.0 to GitHub
# Run this script after setting your GitHub credentials

set -euo pipefail

echo "═══════════════════════════════════════════"
echo "  Lotview v1.0 — Push to GitHub"
echo "═══════════════════════════════════════════"

# Check for GitHub credentials
if [ -z "${GITHUB_TOKEN:-}" ] && [ -z "$(git config --global user.name 2>/dev/null)" ]; then
  echo ""
  echo "⚠️  GitHub authentication required"
  echo ""
  echo "Option 1: Set GITHUB_TOKEN environment variable"
  echo "   export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx"
  echo ""
  echo "Option 2: Use Git credential helper"
  echo "   git config --global credential.helper cache"
  echo ""
  echo "Option 3: Manually push with:"
  echo "   git remote add origin https://github.com/ominous-one/Lotview.git"
  echo "   git push -u origin main --force"
  echo ""
  exit 1
fi

# Push using token if available
if [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "🔑 Using GITHUB_TOKEN for authentication"
  git remote set-url origin "https://${GITHUB_TOKEN}@github.com/ominous-one/Lotview.git" 2>/dev/null || \
    git remote add origin "https://${GITHUB_TOKEN}@github.com/ominous-one/Lotview.git"
fi

echo "🚀 Pushing to github.com/ominous-one/Lotview..."
git push -u origin main --force

echo ""
echo "✅ Successfully pushed to GitHub!"
echo "   Repo: https://github.com/ominous-one/Lotview"
echo "   Branch: main"
echo ""
echo "Next step: Deploy on Render"
echo "   1. Go to https://dashboard.render.com/blueprints"
echo "   2. Connect your GitHub repo"
echo "   3. Render will auto-deploy from render.yaml"
echo ""
