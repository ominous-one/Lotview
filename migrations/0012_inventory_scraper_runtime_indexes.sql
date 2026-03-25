-- Production hardening indexes for inventory and scraper hot paths
CREATE INDEX IF NOT EXISTS vehicles_dealership_active_created_idx
  ON vehicles (dealership_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vehicles_dealership_active_vin_idx
  ON vehicles (dealership_id, vin)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vehicles_dealership_active_stock_idx
  ON vehicles (dealership_id, normalized_stock_number)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vehicles_dealership_active_vdp_idx
  ON vehicles (dealership_id, dealer_vdp_url)
  WHERE deleted_at IS NULL AND dealer_vdp_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS scrape_runs_dealership_status_started_idx
  ON scrape_runs (dealership_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS scrape_queue_run_status_position_idx
  ON scrape_queue (scrape_run_id, status, position ASC);

CREATE INDEX IF NOT EXISTS scrape_queue_dealership_status_created_idx
  ON scrape_queue (dealership_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS vehicle_views_vehicle_viewed_at_idx
  ON vehicle_views (vehicle_id, viewed_at DESC);
