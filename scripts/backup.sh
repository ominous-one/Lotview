#!/bin/bash
# Lotview SaaS — Database Backup Script
# Backs up PostgreSQL database to GCS or local storage.
#
# Usage:
#   ./scripts/backup.sh                    # Backup to local file
#   GCS_BUCKET=lotview-backups ./scripts/backup.sh  # Backup to GCS
#   ./scripts/backup.sh daily              # Daily backup with retention

set -euo pipefail

# Configuration
DB_URL="${DATABASE_URL:-postgres://lotview:lotview@localhost:5432/lotview}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
GCS_BUCKET="${GCS_BUCKET:-}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
BACKUP_TYPE="${1:-manual}"

# Parse database connection
DB_HOST=$(echo "$DB_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo "$DB_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo "$DB_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
DB_USER=$(echo "$DB_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo "$DB_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="lotview_${BACKUP_TYPE}_${TIMESTAMP}.sql"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_FILE"

mkdir -p "$BACKUP_DIR"

echo "═══════════════════════════════════════════"
echo "  Lotview Database Backup"
echo "═══════════════════════════════════════════"
echo "  Database: $DB_NAME"
echo "  Host:     $DB_HOST:$DB_PORT"
echo "  Type:     $BACKUP_TYPE"
echo "  File:     $BACKUP_FILE"
echo "═══════════════════════════════════════════"

# Export password for pg_dump
export PGPASSWORD="$DB_PASS"

# Run backup
echo "📦 Running pg_dump..."
pg_dump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --verbose \
  --format=plain \
  --file="$BACKUP_PATH" \
  2>&1 | tee "$BACKUP_DIR/${BACKUP_FILE}.log"

# Compress backup
echo "🗜️  Compressing backup..."
gzip -f "$BACKUP_PATH"
BACKUP_PATH="${BACKUP_PATH}.gz"
BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)

echo "✅ Backup complete: $BACKUP_SIZE"

# Upload to GCS if bucket is configured
if [ -n "$GCS_BUCKET" ]; then
  echo "☁️  Uploading to GCS: gs://$GCS_BUCKET/backups/"
  gsutil cp "$BACKUP_PATH" "gs://$GCS_BUCKET/backups/$BACKUP_FILE.gz"
  echo "✅ Uploaded to GCS"
fi

# Clean up old backups
if [ "$BACKUP_TYPE" != "manual" ]; then
  echo "🧹 Cleaning up old backups (>$RETENTION_DAYS days)..."
  find "$BACKUP_DIR" -name "lotview_${BACKUP_TYPE}_*.sql.gz" -mtime +$RETENTION_DAYS -delete
fi

# Clean up local backup if uploaded to GCS
if [ -n "$GCS_BUCKET" ]; then
  rm -f "$BACKUP_PATH"
  echo "🗑️  Local backup removed (stored in GCS)"
fi

echo "═══════════════════════════════════════════"
echo "  Backup Complete"
echo "═══════════════════════════════════════════"
