/**
 * Admin API — HTTP-layer guard certification (real Postgres + live server).
 *
 * Proves the super-admin boundary on /api/admin: every endpoint requires
 * authentication (401), a normal dealer role (even dealer_owner) is refused by
 * superAdminOnly (403), and a super_admin is admitted past the guard chain.
 *
 * Runs only when DATABASE_URL points at a real database (see `npm run test:integration`).
 */
import express from "express";
import type { Server } from "http";
import { storage } from "../storage";
import { generateToken } from "../auth";
import { tenantMiddleware } from "../tenant-middleware";
import adminRouter from "../routes/admin";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIf = hasDb ? describe : describe.skip;

describeIf("Admin API (super-admin boundary, real Postgres)", () => {
  let server: Server;
  let baseUrl = "";
  let dealer: any;
  let ownerToken = "";
  let superAdminToken = "";

  beforeAll(async () => {
    const tag = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    dealer = await storage.createDealership({ name: `Admin Dealer ${tag}`, slug: `admin-dealer-${tag}` } as any);
    const owner = await storage.createUser({ email: `owner-${tag}@example.com`, name: "Owner", passwordHash: "x", role: "dealer_owner", dealershipId: dealer.id, isActive: true } as any);
    const superAdmin = await storage.createUser({ email: `super-${tag}@example.com`, name: "Super", passwordHash: "x", role: "super_admin", dealershipId: null, isActive: true } as any);
    ownerToken = generateToken(owner as any);
    superAdminToken = generateToken(superAdmin as any);

    const app = express();
    app.use(express.json());
    app.use(tenantMiddleware(storage));
    app.use("/api/admin", adminRouter);
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
    if (dealer?.id) await storage.deleteDealership(dealer.id);
  });

  const req = (method: string, path: string, token?: string, body?: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

  test("GET /api/admin/dealerships without a token is rejected (401)", async () => {
    expect((await req("GET", "/api/admin/dealerships")).status).toBe(401);
  });

  test("POST /api/admin/restart-server without a token is rejected (401)", async () => {
    expect((await req("POST", "/api/admin/restart-server", undefined, {})).status).toBe(401);
  });

  test("a dealer_owner (not super_admin) is refused admin endpoints (403)", async () => {
    expect((await req("GET", "/api/admin/users", ownerToken)).status).toBe(403);
    expect((await req("GET", "/api/admin/dashboard/health", ownerToken)).status).toBe(403);
  });

  test("a super_admin is admitted past the guard chain (not 401/403)", async () => {
    const status = (await req("GET", "/api/admin/dashboard/health", superAdminToken)).status;
    expect([401, 403]).not.toContain(status);
  });
});
