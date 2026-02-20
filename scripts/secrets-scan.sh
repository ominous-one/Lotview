#!/bin/bash
# Secrets Scanning Script
# Scans repository for accidentally committed secrets
# Usage: ./scripts/secrets-scan.sh

set -e

echo "=== SECRETS SCAN ==="
echo "Scanning repository for exposed secrets..."
echo ""

FOUND_SECRETS=0

# Define patterns to search for (excluding common false positives)
PATTERNS=(
  "sk-[a-zA-Z0-9]{20,}"                    # OpenAI API keys
  "re_[a-zA-Z0-9]{20,}"                    # Resend API keys
  "xox[baprs]-[a-zA-Z0-9-]+"               # Slack tokens
  "ghp_[a-zA-Z0-9]{36}"                    # GitHub personal access tokens
  "gho_[a-zA-Z0-9]{36}"                    # GitHub OAuth tokens
  "AIza[a-zA-Z0-9_-]{35}"                  # Google API keys
  "ya29\.[a-zA-Z0-9_-]+"                   # Google OAuth tokens
  "AKIA[A-Z0-9]{16}"                       # AWS access keys
  "[a-z0-9]{32}\.apps\.googleusercontent" # Google client IDs
  "-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----" # Private keys
  "password\s*[:=]\s*['\"][^'\"]{8,}['\"]" # Hardcoded passwords
)

# Files to exclude
EXCLUDE_PATTERNS=(
  "node_modules"
  "dist"
  ".git"
  ".cache"
  ".env.example"
  "secrets-scan.sh"
  "README.md"
  "*.md"
  "package-lock.json"
  "*.test.ts"
  "attached_assets"
)

# Build exclude arguments for grep
EXCLUDE_ARGS=""
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
  EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude=$pattern --exclude-dir=$pattern"
done

echo "Checking for common secret patterns..."
echo "----------------------------------------"

# Check each pattern
for pattern in "${PATTERNS[@]}"; do
  MATCHES=$(grep -rE "$pattern" . $EXCLUDE_ARGS 2>/dev/null || true)
  if [ -n "$MATCHES" ]; then
    echo "⚠️  POTENTIAL SECRET FOUND: $pattern"
    echo "$MATCHES" | head -5
    echo ""
    FOUND_SECRETS=1
  fi
done

# Check for common environment variable patterns with actual values
echo "Checking for hardcoded environment values..."
echo "---------------------------------------------"

# Check for API_KEY= with actual values (not placeholders)
API_KEY_MATCHES=$(grep -rE "(API_KEY|SECRET|PASSWORD|TOKEN)\s*[:=]\s*['\"][a-zA-Z0-9_-]{10,}['\"]" . $EXCLUDE_ARGS 2>/dev/null | grep -v "your-" | grep -v "placeholder" | grep -v "example" | grep -v ".env.example" || true)
if [ -n "$API_KEY_MATCHES" ]; then
  echo "⚠️  POTENTIAL HARDCODED CREDENTIALS:"
  echo "$API_KEY_MATCHES" | head -5
  echo ""
  FOUND_SECRETS=1
fi

# Check .env file exists (it shouldn't be committed)
if [ -f ".env" ]; then
  echo "⚠️  WARNING: .env file exists - ensure it's in .gitignore"
  FOUND_SECRETS=1
fi

echo ""
echo "=== SCAN COMPLETE ==="
if [ $FOUND_SECRETS -eq 0 ]; then
  echo "✅ No secrets detected"
  exit 0
else
  echo "❌ Potential secrets found - review above and remediate"
  exit 1
fi
