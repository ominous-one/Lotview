/**
 * Inventory API — HTTP-layer guard certification (real Postgres + live server).
 *
 * Storage-layer inventory CRUD is certified separately; this proves the /api/vehicles
 * ROUTER is wired properly: writes require auth + inventory.write permission + tenant
 * context, and cross-tenant reads are blocked. Focuses on the guard layer (does not
 * exercise the create-body schema).
 *
 * Runs only when DATABASE_URL points at a real database (see `npm run test:integration`).
 */
import express from "express";
import type { Server } from "http";
import { storage } from "../storage";
import { generateToken } from "../auth";
import { tenantMiddleware } from "../tenant-middleware";
import vehiclesRouter from "../routes/vehicles";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIf = hasDb ? describe : describe.skip;

function buildVehicle(dealershipId: number, vin: string) {
  return {
    dealershipId, year: 2022, make: "Test", model: "Model", trim: "Base", type: "SUV",
    price: 25000, odometer: 10000, images: ["https://example.com/a.jpg"], badges: ["Certified"],
    location: "Vancouver", dealership: "Test Dealer", description: "A test vehicle.", vin,
  } as any;
}

describeIf("Inventory API (HTTP guards, real Postgres)", () => {
  let server: Server;
  let baseUrl = "";
  let dealerA: any;
  let dealerB: any;
  let ownerAToken = "";
  let salesAToken = "";
  let vehicleB: any;

  beforeAll(async () => {
    const tag = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    dealerA = await storage.createDealership({ name: `Inv A ${tag}`, slug: `inv-a-${tag}` } as any);
    dealerB = await storage.createDealership({ name: `Inv B ${tag}`, slug: `inv-b-${tag}` } as any);
    const ownerA = await storage.createUser({ email: `owner-${tag}@example.com`, name: "Owner A", passwordHash: "x", role: "dealer_owner", dealershipId: dealerA.id, isActive: true } as any);
    const salesA = await storage.createUser({ email: `sales-${tag}@example.com`, name: "Sales A", passwordHash: "x", role: "sales_rep", dealershipId: dealerA.id, isActive: true } as any);
    ownerAToken = generateToken(ownerA as any);
    salesAToken = generateToken(salesA as any);
    vehicleB = await storage.createVehicle(buildVehicle(dealerB.id, `VB${tag}`.slice(0, 17)));

    const app = express();
    app.use(express.json());
    app.use(tenantMiddleware(storage));
    app.use("/api/vehicles", vehiclesRouter);
    await new Promise<void>((done) => {
      server = app.listen(0, () => {
        const a = server.address();
        baseUrl = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
        done();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
    if (dealerA?.id) await storage.deleteDealership(dealerA.id);
    if (dealerB?.id) await storage.deleteDealership(dealerB.id);
  });

  const req = (method: string, path: string, token?: string, body?: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  test("POST /api/vehicles without a token is rejected (401)", async () => {
    expect((await req("POST", "/api/vehicles", undefined, { make: "X" })).status).toBe(401);
  });

  test("PATCH /api/vehicles/:id without a token is rejected (401)", async () => {
    expect((await req("PATCH", "/api/vehicles/1", undefined, { price: 1 })).status).toBe(401);
  });

  test("DELETE /api/vehicles/:id without a token is rejected (401)", async () => {
    expect((await req("DELETE", "/api/vehicles/1")).status).toBe(401);
  });

  test("POST /api/vehicles with a role lacking inventory.write is forbidden (403)", async () => {
    const res = await req("POST", "/api/vehicles", salesAToken, { make: "X" });
    expect(res.status).toBe(403);
  });

  test("GET /api/vehicles/:id cannot read another dealership's vehicle (404)", async () => {
    const res = await req("GET", `/api/vehicles/${vehicleB.id}`, ownerAToken);
    expect(res.status).toBe(404);
  });
});
