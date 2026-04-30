-- Lotview SaaS - Migration 0003: active vehicle identity constraints
-- Fails closed if duplicate active VIN or stock identities already exist.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM vehicles
    WHERE vin IS NOT NULL
      AND TRIM(vin) <> ''
      AND deleted_at IS NULL
      AND COALESCE(lifecycle_status, 'ACTIVE') NOT IN ('DELETED', 'REMOVED', 'REMOVED_BY_SYNC', 'ARCHIVED', 'SOLD')
    GROUP BY dealership_id, UPPER(TRIM(vin))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create active vehicle VIN uniqueness constraint: duplicate active VINs exist per dealership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM vehicles
    WHERE normalized_stock_number IS NOT NULL
      AND TRIM(normalized_stock_number) <> ''
      AND deleted_at IS NULL
      AND COALESCE(lifecycle_status, 'ACTIVE') NOT IN ('DELETED', 'REMOVED', 'REMOVED_BY_SYNC', 'ARCHIVED', 'SOLD')
    GROUP BY dealership_id, normalized_stock_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create active vehicle stock uniqueness constraint: duplicate active stock numbers exist per dealership';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_active_dealership_vin_unique
  ON vehicles (dealership_id, UPPER(TRIM(vin)))
  WHERE vin IS NOT NULL
    AND TRIM(vin) <> ''
    AND deleted_at IS NULL
    AND COALESCE(lifecycle_status, 'ACTIVE') NOT IN ('DELETED', 'REMOVED', 'REMOVED_BY_SYNC', 'ARCHIVED', 'SOLD');

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_active_dealership_stock_unique
  ON vehicles (dealership_id, normalized_stock_number)
  WHERE normalized_stock_number IS NOT NULL
    AND TRIM(normalized_stock_number) <> ''
    AND deleted_at IS NULL
    AND COALESCE(lifecycle_status, 'ACTIVE') NOT IN ('DELETED', 'REMOVED', 'REMOVED_BY_SYNC', 'ARCHIVED', 'SOLD');
