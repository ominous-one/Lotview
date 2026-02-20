#!/bin/bash

# Setup PostgreSQL database for Replit
PGDATA="/home/runner/workspace/.postgres"
POSTGRES_LOG="/tmp/postgres.log"

# Check if PostgreSQL is already running
if pg_isready -h /tmp -p 5432 > /dev/null 2>&1; then
  echo "PostgreSQL is already running"
  exit 0
fi

# Initialize database if not already initialized
if [ ! -d "$PGDATA" ]; then
  echo "Initializing PostgreSQL database..."
  PGPORT=5432 PGHOST=localhost PGUSER=runner PGDATABASE=workspace pg_ctl init -D "$PGDATA"
fi

# Start PostgreSQL
echo "Starting PostgreSQL..."
postgres -D "$PGDATA" -p 5432 -k /tmp > "$POSTGRES_LOG" 2>&1 &
POSTGRES_PID=$!

# Wait for PostgreSQL to be ready
for i in {1..30}; do
  if pg_isready -h /tmp -p 5432 > /dev/null 2>&1; then
    echo "PostgreSQL is ready!"
    
    # Create database if it doesn't exist
    psql -h /tmp -U runner -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'workspace'" | grep -q 1 || \
      psql -h /tmp -U runner -d postgres -c "CREATE DATABASE workspace;"
    
    echo "Database setup complete!"
    exit 0
  fi
  sleep 1
done

echo "PostgreSQL failed to start in time"
exit 1
