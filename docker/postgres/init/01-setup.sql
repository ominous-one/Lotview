-- Lotview SaaS — Initial Database Setup
-- This script runs on first container startup via docker-entrypoint-initdb.d

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Optional: Create read-only analytics user for reporting tools
-- CREATE USER lotview_analytics WITH PASSWORD 'analytics_password';
-- GRANT CONNECT ON DATABASE lotview TO lotview_analytics;
-- GRANT USAGE ON SCHEMA public TO lotview_analytics;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO lotview_analytics;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO lotview_analytics;

-- Set proper timezone
ALTER DATABASE lotview SET timezone = 'UTC';

-- Performance tuning for SaaS workloads
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '768MB';
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';

-- Logging for debugging (adjust in production)
ALTER SYSTEM SET log_min_duration_statement = 1000; -- Log slow queries (>1s)
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
