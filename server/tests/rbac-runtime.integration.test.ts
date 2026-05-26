/**
 * RBAC enforcement — RUNTIME integration proof (real Postgres + live server).
 *
 * The repo's RBAC contract tests assert that guards are DECLARED on routes (source
 * strings). This proves the permission matrix actually ENFORCES at runtime: a
 * low-privilege role is refused a permission it lacks, and a high-privilege role
 * is allowed, with fresh role loaded from the database by authMiddleware.
 *
 * Runs only when DATABASE_URL points at a real database (see `npm run test:integration`).
 */
import express from "express";
import type { Server } from "http";
import { storage } from "../storage";
import { authMiddleware, requirePermission, generateToken } from "../auth";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIf = hasDb ? describe : describe.skip;

describeIf("RBAC enforcement (runtime, real Postgres)", () => {
  let server: Server;
  let baseUrl = "";
  let dealer: any;
  let salesToken = "";
  let ownerToken = "";
  const tag = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

  beforeAll(async () => {
    dealer = await storage.createDealership({ name: `RBAC Dealer ${tag}`, slug: `rbac-dealer-${tag}` } as any);
    const salesUser = await storage.createUser({ email: `sales-${tag}@example.com`, name: "Sales Rep", passwordHash: "unused", role: "sales_rep", dealershipId: dealer.id, isActive: true } as any);
    const ownerUser = await storage.createUser({ email: `owner-${tag}@example.com`, name: "Owner", passwordHash: "unused", role: "dealer_owner", dealershipId: dealer.id, isActive: true } as any);
    salesToken = generateToken(salesUser as any);
    ownerToken = generateToken(ownerUser as any);

    const app = express();
    app.use(express.json());
    app.get("/rbac/inventory-read", authMiddleware, requirePermission("inventory.read"), (_req, res) => res.json({ ok: true }));
    app.get("/rbac/users-manage", authMiddleware, requirePermission("users.manage"), (_req, res) => res.json({ ok: true }));
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

  const get = (path: string, token?: string) =>
    fetch(`${baseUrl}${path}`, token ? { headers: { authorization: `Bearer ${token}` } } : undefined);

  test("unauthenticated request is rejected (401)", async () => {
    expect((await get("/rbac/inventory-read")).status).toBe(401);
  });

  test("sales_rep IS allowed a permission it has (inventory.read)", async () => {
    expect((await get("/rbac/inventory-read", salesToken)).status).toBe(200);
  });

  test("sales_rep is DENIED a permission it lacks (users.manage → 403)", async () => {
    expect((await get("/rbac/users-manage", salesToken)).status).toBe(403);
  });

  test("dealer_owner IS allowed the elevated permission (users.manage)", async () => {
    expect((await get("/rbac/users-manage", ownerToken)).status).toBe(200);
  });
});
