ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'UNVERIFIED';

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS verification_checked_at timestamp;

UPDATE vehicles
SET
  verification_status = CASE
    WHEN deleted_at IS NOT NULL OR COALESCE(lifecycle_status, 'ACTIVE') <> 'ACTIVE' THEN 'ERROR'
    WHEN last_scraped_at IS NULL OR last_scraped_at < NOW() - INTERVAL '36 hours' THEN 'STALE'
    WHEN dealer_vdp_url IS NULL OR TRIM(dealer_vdp_url) = '' OR photo_status = 'no_vdp' THEN 'UNVERIFIED'
    WHEN vin IS NULL OR TRIM(vin) = '' OR UPPER(TRIM(vin)) LIKE 'PENDING%' OR UPPER(TRIM(vin)) = 'UNKNOWN' THEN 'UNVERIFIED'
    WHEN normalized_stock_number IS NULL OR TRIM(normalized_stock_number) = '' THEN 'UNVERIFIED'
    ELSE 'VERIFIED'
  END,
  verification_checked_at = COALESCE(verification_checked_at, last_scraped_at, NOW());
