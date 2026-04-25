-- Lotview SaaS — Performance Indexes Migration
-- Run after initial schema setup to optimize query performance for 100+ dealerships

-- Core tenant indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_dealership_id ON vehicles(dealership_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_vin ON vehicles(vin) WHERE vin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_lifecycle ON vehicles(lifecycle_status) WHERE lifecycle_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_deleted_at ON vehicles(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_dealership_status ON vehicles(dealership_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_created_at ON vehicles(created_at DESC);

-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_dealership_id ON users(dealership_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Facebook indexes
CREATE INDEX IF NOT EXISTS idx_facebook_pages_dealership ON facebook_pages(dealership_id);
CREATE INDEX IF NOT EXISTS idx_facebook_accounts_dealership ON facebook_accounts(dealership_id);
CREATE INDEX IF NOT EXISTS idx_posting_queue_dealership ON posting_queue(dealership_id);
CREATE INDEX IF NOT EXISTS idx_posting_queue_status ON posting_queue(status);

-- GHL indexes
CREATE INDEX IF NOT EXISTS idx_ghl_webhook_config_dealership ON ghl_webhook_config(dealership_id);
CREATE INDEX IF NOT EXISTS idx_ghl_accounts_dealership ON ghl_accounts(dealership_id);
CREATE INDEX IF NOT EXISTS idx_ghl_accounts_location ON ghl_accounts(location_id);

-- Chat/Conversation indexes
CREATE INDEX IF NOT EXISTS idx_chat_conversations_dealership ON chat_conversations(dealership_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messenger_conversations_dealership ON messenger_conversations(dealership_id);

-- View tracking indexes
CREATE INDEX IF NOT EXISTS idx_vehicle_views_vehicle ON vehicle_views(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_views_dealership ON vehicle_views(dealership_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_views_created ON vehicle_views(created_at DESC);

-- Audit indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_dealership ON audit_logs(dealership_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_audit_events_vehicle ON vehicle_audit_events(vehicle_id);

-- Scraper indexes
CREATE INDEX IF NOT EXISTS idx_scrape_sources_dealership ON scrape_sources(dealership_id);
CREATE INDEX IF NOT EXISTS idx_scrape_runs_dealership ON scrape_runs(dealership_id);
CREATE INDEX IF NOT EXISTS idx_scrape_runs_status ON scrape_runs(status);

-- API key indexes
CREATE INDEX IF NOT EXISTS idx_external_api_tokens_dealership ON external_api_tokens(dealership_id);
CREATE INDEX IF NOT EXISTS idx_external_api_tokens_prefix ON external_api_tokens(token_prefix);

-- Password reset indexes
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_email ON password_reset_tokens(email);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- Carfax indexes
CREATE INDEX IF NOT EXISTS idx_carfax_reports_vehicle ON carfax_reports(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_carfax_reports_vin ON carfax_reports(vin);

-- Update table statistics for query planner
ANALYZE vehicles;
ANALYZE users;
ANALYZE chat_conversations;
ANALYZE vehicle_views;
