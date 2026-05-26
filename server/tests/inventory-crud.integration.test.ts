/**
 * Inventory CRUD lifecycle — STORAGE-LAYER integration proof (real Postgres).
 *
 * Proves the full create → read → list → update → VIN-lookup → soft-delete
 * lifecycle for vehicles (inventory) against a real database, including:
 *   - immutable identity protection (dealershipId cannot be changed via update)
 *   - VIN normalization (case/whitespace-insensitive lookup)
 *   - soft-delete semantics (deleted rows excluded from reads)
 *
 * Runs only when DATABASE_URL points at a real database (see `npm run test:integration`
 * and `npm run db:test:setup`). Skipped in the default unit run.
 */
import { storage } from "../storage";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIf = hasDb ? describe : describe.skip;

const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

function buildVehicle(dealershipId: number, vin: string) {
  return {
    dealershipId,
    year: 2022,
    make: "Test",
    model: "Model",
    trim: "Base",
    type: "SUV",
    price: 25000,
    odometer: 10000,
    images: ["https://example.com/a.jpg"],
    badges: ["Certified"],
    location: "Vancouver",
    dealership: "Test Dealer",
    description: "A test vehicle.",
    vin,
  } as any;
}

describeIf("Inventory CRUD lifecycle (storage layer, real Postgres)", () => {
  let dealerA: any;
  let dealerB: any;
  // A canonical VIN we control. 17 chars, uppercase, no whitespace.
  const canonicalVin = `1HGCM82633A${uniq().replace(/\D/g, "").slice(0, 6).padEnd(6, "0")}`.slice(0, 17);
  let vehicle: any;

  beforeAll(async () => {
    const tag = uniq();
    dealerA = await storage.createDealership({ name: `Dealer A ${tag}`, slug: `dealer-a-${tag}` } as any);
    dealerB = await storage.createDealership({ name: `Dealer B ${tag}`, slug: `dealer-b-${tag}` } as any);
  });

  afterAll(async () => {
    // FK cascade on dealership delete cleans up all child rows for both tenants.
    if (dealerA?.id) await storage.deleteDealership(dealerA.id);
    if (dealerB?.id) await storage.deleteDealership(dealerB.id);
  });

  test("two distinct dealerships were created", () => {
    expect(dealerA.id).toBeGreaterThan(0);
    expect(dealerB.id).toBeGreaterThan(0);
    expect(dealerA.id).not.toBe(dealerB.id);
  });

  test("create → getVehicleById returns it with the right fields", async () => {
    vehicle = await storage.createVehicle(buildVehicle(dealerA.id, canonicalVin));
    expect(vehicle.id).toBeGreaterThan(0);

    const read = await storage.getVehicleById(vehicle.id, dealerA.id);
    expect(read).toBeTruthy();
    expect(read!.id).toBe(vehicle.id);
    expect(read!.dealershipId).toBe(dealerA.id);
    expect(read!.make).toBe("Test");
    expect(read!.model).toBe("Model");
    expect(read!.year).toBe(2022);
    expect(read!.price).toBe(25000);
    expect(read!.vin).toBe(canonicalVin);
  });

  test("getVehicles for the dealership includes it and total >= 1", async () => {
    const { vehicles, total } = await storage.getVehicles(dealerA.id);
    expect(total).toBeGreaterThanOrEqual(1);
    expect(vehicles.map((v: any) => v.id)).toContain(vehicle.id);
  });

  test("updateVehicle changes a mutable field (price) and it persists", async () => {
    const updated = await storage.updateVehicle(vehicle.id, { price: 31999 } as any, dealerA.id);
    expect(updated).toBeTruthy();
    expect(updated!.price).toBe(31999);

    // Re-read confirms persistence.
    const reread = await storage.getVehicleById(vehicle.id, dealerA.id);
    expect(reread!.price).toBe(31999);
  });

  test("updateVehicle CANNOT change immutable identity (dealershipId is stripped)", async () => {
    // Include a real mutable change alongside the illegal dealershipId switch so the
    // update actually executes (an update with only stripped fields is a no-op).
    const updated = await storage.updateVehicle(
      vehicle.id,
      { dealershipId: dealerB.id, price: 42000 } as any,
      dealerA.id,
    );
    expect(updated).toBeTruthy();
    // Mutable field changed...
    expect(updated!.price).toBe(42000);
    // ...but the tenant identity was NOT moved to dealer B.
    expect(updated!.dealershipId).toBe(dealerA.id);

    // And dealer B still cannot see the vehicle.
    expect(await storage.getVehicleById(vehicle.id, dealerB.id)).toBeUndefined();
    const reread = await storage.getVehicleById(vehicle.id, dealerA.id);
    expect(reread!.dealershipId).toBe(dealerA.id);
  });

  test("getVehicleByVin finds the vehicle by a case/whitespace VIN variant", async () => {
    const messyVin = `   ${canonicalVin.toLowerCase()}   `;
    const found = await storage.getVehicleByVin(messyVin, dealerA.id);
    expect(found).toBeTruthy();
    expect(found!.id).toBe(vehicle.id);
    expect(found!.vin).toBe(canonicalVin);
  });

  test("deleteVehicle soft-deletes; afterward getVehicleById returns undefined", async () => {
    const ok = await storage.deleteVehicle(vehicle.id, dealerA.id);
    expect(ok).toBe(true);

    // Soft-deleted rows are excluded from reads.
    expect(await storage.getVehicleById(vehicle.id, dealerA.id)).toBeUndefined();
    // ...and from VIN lookup.
    expect(await storage.getVehicleByVin(canonicalVin, dealerA.id)).toBeUndefined();
  });
});
