#!/usr/bin/env bash
# Spin up a local Postgres for integration tests and load the full schema from
# shared/schema.ts. Idempotent. Prints the DATABASE_URL to use.
#
#   bash scripts/setup-test-db.sh
#   DATABASE_URL="$(...)" npm run test:integration
set -euo pipefail

CONTAINER="${TEST_DB_CONTAINER:-lvtest}"
PORT="${TEST_DB_PORT:-55432}"
DB_URL="postgres://lotview:lotview@127.0.0.1:${PORT}/lotview"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER" \
    -p "127.0.0.1:${PORT}:5432" \
    -e POSTGRES_USER=lotview -e POSTGRES_PASSWORD=lotview -e POSTGRES_DB=lotview \
    postgres:16-alpine >/dev/null
fi

# Wait for readiness (bounded).
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U lotview >/dev/null 2>&1; then break; fi
  sleep 1
done

# Load the full current schema (drizzle-kit push needs a TTY, so generate + apply).
TMP="$(mktemp -d)"
npx drizzle-kit generate --schema=./shared/schema.ts --dialect=postgresql --out="$TMP" --name=init < /dev/null >/dev/null
cat "$TMP"/*.sql | docker exec -i "$CONTAINER" psql -U lotview -d lotview -v ON_ERROR_STOP=1 -q

echo "Test DB ready."
echo "DATABASE_URL=${DB_URL}"
