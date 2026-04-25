-- Lotview SaaS — Migration 0002: Carfax + Smart Merge + AI Fields
-- Adds columns for Carfax caching, field-level merge tracking, and AI metadata

-- Add Carfax intelligence columns to vehicles
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS carfax_confidence_score INTEGER DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS carfax_report_json TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS carfax_last_updated TIMESTAMP;

-- Add smart merge tracking
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS manual_edit_lock JSONB DEFAULT '{}';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS photo_count INTEGER DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMP;

-- Add field source tracking (scrape vs manual vs ai)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS description_source TEXT DEFAULT 'scrape';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS price_source TEXT DEFAULT 'scrape';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS photo_source TEXT DEFAULT 'scrape';

-- Add AI generation tracking
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ai_description_generated_at TIMESTAMP;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ai_description_version INTEGER DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS market_analysis_json TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS photo_score_overall INTEGER;

-- Add index for Carfax lookups
CREATE INDEX IF NOT EXISTS idx_vehicles_carfax_updated ON vehicles(carfax_last_updated) WHERE carfax_last_updated IS NOT NULL;

-- Add index for merge tracking
CREATE INDEX IF NOT EXISTS idx_vehicles_last_scraped ON vehicles(last_scraped_at DESC);

-- Table for field-level edit audit trail
CREATE TABLE IF NOT EXISTS vehicle_field_edits (
  id SERIAL PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  dealership_id INTEGER NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'scrape', 'ai', 'import'
  edited_by INTEGER NOT NULL,
  edited_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_vehicle_field_edits_vehicle ON vehicle_field_edits(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_field_edits_dealership ON vehicle_field_edits(dealership_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_field_edits_field ON vehicle_field_edits(field_name);

-- Table for Carfax cache (avoids re-scraping same VINs)
CREATE TABLE IF NOT EXISTS carfax_cache (
  id SERIAL PRIMARY KEY,
  vin TEXT NOT NULL UNIQUE,
  report_json TEXT NOT NULL,
  badges TEXT[] DEFAULT '{}',
  confidence_score INTEGER DEFAULT 0,
  selling_points TEXT[] DEFAULT '{}',
  scraped_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  dealership_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_carfax_cache_vin ON carfax_cache(vin);
CREATE INDEX IF NOT EXISTS idx_carfax_cache_expires ON carfax_cache(expires_at);

-- Table for AI-generated content versions
CREATE TABLE IF NOT EXISTS vehicle_ai_content (
  id SERIAL PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  dealership_id INTEGER NOT NULL,
  content_type TEXT NOT NULL, -- 'description', 'title', 'seo_keywords', 'selling_points'
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  ai_model TEXT, -- 'gpt-4', 'claude', etc.
  generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  used_at TIMESTAMP,
  approved_by INTEGER,
  approved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vehicle_ai_content_vehicle ON vehicle_ai_content(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_ai_content_type ON vehicle_ai_content(content_type);

-- Update existing vehicles to set photo_count from images array
UPDATE vehicles SET photo_count = COALESCE(array_length(images, 1), 0) WHERE photo_count = 0 AND images IS NOT NULL;
