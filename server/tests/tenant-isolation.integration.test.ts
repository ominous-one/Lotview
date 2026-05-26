/**
 * Tenant isolation — STORAGE-LAYER integration proof (real Postgres).
 *
 * Route-contract tests prove routes PASS dealershipId to storage. This proves the
 * storage layer itself enforces the boundary: Dealer A can never read, update, or
 * delete Dealer B's rows.
 *
 * Runs only when DATABASE_URL points at a real database (see `npm run test:integration`
 * and `npm run db:test:setup`). Skipped in the default unit run.
 */
import { storage } from "../storage";
import { pool } from "../db";

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

describeIf("Tenant isolation (storage layer, real Postgres)", () => {
  let dealerA: any;
  let dealerB: any;
  let vehicleA: any;
  let vehicleB: any;

  beforeAll(async () => {
    const tag = uniq();
    dealerA = await storage.createDealership({ name: `Dealer A ${tag}`, slug: `dealer-a-${tag}` } as any);
    dealerB = await storage.createDealership({ name: `Dealer B ${tag}`, slug: `dealer-b-${tag}` } as any);
    vehicleA = await storage.createVehicle(buildVehicle(dealerA.id, `VA${tag}`.slice(0, 17)));
    vehicleB = await storage.createVehicle(buildVehicle(dealerB.id, `VB${tag}`.slice(0, 17)));
  });

  afterAll(async () => {
    if (dealerA?.id) await storage.deleteDealership(dealerA.id);
    if (dealerB?.id) await storage.deleteDealership(dealerB.id);
    await pool.end();
  });

  test("setup created two distinct dealerships and vehicles", () => {
    expect(dealerA.id).toBeGreaterThan(0);
    expect(dealerB.id).toBeGreaterThan(0);
    expect(dealerA.id).not.toBe(dealerB.id);
    expect(vehicleA.id).not.toBe(vehicleB.id);
  });

  test("getVehicles returns ONLY the requesting dealership's vehicles", async () => {
    const a = await storage.getVehicles(dealerA.id);
    const aIds = a.vehicles.map((v: any) => v.id);
    expect(aIds).toContain(vehicleA.id);
    expect(aIds).not.toContain(vehicleB.id);

    const b = await storage.getVehicles(dealerB.id);
    const bIds = b.vehicles.map((v: any) => v.id);
    expect(bIds).toContain(vehicleB.id);
    expect(bIds).not.toContain(vehicleA.id);
  });

  test("getVehicleById cannot read another dealership's vehicle", async () => {
    expect(await storage.getVehicleById(vehicleB.id, dealerA.id)).toBeUndefined();
    expect(await storage.getVehicleById(vehicleA.id, dealerA.id)).toBeTruthy();
  });

  test("getVehicleByVin is tenant-scoped", async () => {
    expect(await storage.getVehicleByVin(vehicleB.vin, dealerA.id)).toBeUndefined();
    expect(await storage.getVehicleByVin(vehicleB.vin, dealerB.id)).toBeTruthy();
  });

  test("updateVehicle cannot modify another dealership's vehicle", async () => {
    const res = await storage.updateVehicle(vehicleB.id, { price: 999999 }, dealerA.id);
    expect(res).toBeUndefined();
    const stillB = await storage.getVehicleById(vehicleB.id, dealerB.id);
    expect(stillB?.price).toBe(25000);
  });

  test("deleteVehicle cannot delete another dealership's vehicle", async () => {
    const ok = await storage.deleteVehicle(vehicleB.id, dealerA.id);
    expect(ok).toBe(false);
    const stillB = await storage.getVehicleById(vehicleB.id, dealerB.id);
    expect(stillB).toBeTruthy();
  });
});
