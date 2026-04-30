import { readFileSync } from "fs";
import { resolve } from "path";

describe("active vehicle identity constraint migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0003_active_vehicle_identity_constraints.sql"),
    "utf8",
  );

  it("fails closed before adding active VIN and stock uniqueness constraints", () => {
    expect(migration).toContain("RAISE EXCEPTION 'Cannot create active vehicle VIN uniqueness constraint");
    expect(migration).toContain("RAISE EXCEPTION 'Cannot create active vehicle stock uniqueness constraint");
    expect(migration).toContain("GROUP BY dealership_id, UPPER(TRIM(vin))");
    expect(migration).toContain("GROUP BY dealership_id, normalized_stock_number");
    expect(migration).toContain("HAVING COUNT(*) > 1");
  });

  it("adds dealership-scoped partial unique indexes for active VIN and stock identity", () => {
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_active_dealership_vin_unique");
    expect(migration).toContain("ON vehicles (dealership_id, UPPER(TRIM(vin)))");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_active_dealership_stock_unique");
    expect(migration).toContain("ON vehicles (dealership_id, normalized_stock_number)");
    expect(migration).toContain("deleted_at IS NULL");
    expect(migration).toContain("COALESCE(lifecycle_status, 'ACTIVE') NOT IN");
  });
});
