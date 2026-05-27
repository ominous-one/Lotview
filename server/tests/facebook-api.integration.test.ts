/**
 * Facebook API — HTTP-layer guard certification (real Postgres + live server).
 *
 * Facebook Marketplace posting needs live credentials to EXECUTE, but its routes are
 * guarded by auth + permission + role + tenant middleware that reject BEFORE any live
 * Facebook call. This proves that wiring: the endpoints (including the post action)
 * require authentication and the right permissions — no Facebook credentials needed,
 * because the guards fire first.
 *
 * Runs only when DATABASE_URL points at a real database (see `npm run test:integration`).
 */
import express from "express";
import type { Server } from "http";
import { storage } from "../storage";
import { generateToken } from "../auth";
import { tenantMiddleware } from "../tenant-middleware";
import facebookRouter from "../routes/facebook";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIf = hasDb ? describe : describe.skip;

describeIf("Facebook API (HTTP guards, real Postgres)", () => {
  let server: Server;
  let baseUrl = "";
  let dealer: any;
  let readOnlyToken = "";

  beforeAll(async () => {
    const tag = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    dealer = await storage.createDealership({ name: `FB Dealer ${tag}`, slug: `fb-dealer-${tag}` } as any);
    // read_only role has messages.read but NOT messages.write / integrations.write.
    const readOnly = await storage.createUser({ email: `ro-${tag}@example.com`, name: "Read Only", passwordHash: "x", role: "read_only", dealershipId: dealer.id, isActive: true } as any);
    readOnlyToken = generateToken(readOnly as any);

    const app = express();
    app.use(express.json());
    app.use(tenantMiddleware(storage));
    app.use("/api/facebook", facebookRouter);
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

  test("GET /api/facebook/pages without a token is rejected (401)", async () => {
    expect((await req("GET", "/api/facebook/pages")).status).toBe(401);
  });

  test("POST /api/facebook/post/:queueId (the live-post action) without a token is rejected (401)", async () => {
    expect((await req("POST", "/api/facebook/post/1", undefined, {})).status).toBe(401);
  });

  test("POST /api/facebook/accounts with a role lacking messages.write is forbidden (403)", async () => {
    expect((await req("POST", "/api/facebook/accounts", readOnlyToken, {})).status).toBe(403);
  });

  test("POST /api/facebook/pages with a role lacking integrations.write is forbidden (403)", async () => {
    expect((await req("POST", "/api/facebook/pages", readOnlyToken, {})).status).toBe(403);
  });
});
