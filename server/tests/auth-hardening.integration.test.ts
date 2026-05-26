/**
 * Auth hardening — RUNTIME integration proof (real Postgres + live server).
 *
 * The repo's other auth/RBAC contract tests assert route wiring via source strings.
 * This exercises the real login/session behavior end-to-end: success, failed login,
 * unknown user, missing fields, deactivated account, protected-route rejection,
 * invalid token, and login rate-limiting.
 *
 * Runs only when DATABASE_URL points at a real database (see `npm run test:integration`).
 */
import express from "express";
import type { Server } from "http";
import { storage } from "../storage";
import { hashPassword } from "../auth";
import authRouter from "../routes/auth";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIf = hasDb ? describe : describe.skip;

describeIf("Auth hardening (integration, real Postgres)", () => {
  let server: Server;
  let baseUrl = "";
  let dealer: any;
  const tag = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const activeEmail = `active-${tag}@example.com`;
  const inactiveEmail = `inactive-${tag}@example.com`;
  const password = "CorrectHorse12!"; // >= 12 chars

  beforeAll(async () => {
    dealer = await storage.createDealership({ name: `Auth Dealer ${tag}`, slug: `auth-dealer-${tag}` } as any);
    const passwordHash = await hashPassword(password);
    await storage.createUser({ email: activeEmail, name: "Active User", passwordHash, role: "dealer_owner", dealershipId: dealer.id, isActive: true } as any);
    await storage.createUser({ email: inactiveEmail, name: "Inactive User", passwordHash, role: "dealer_owner", dealershipId: dealer.id, isActive: false } as any);

    const app = express();
    app.use(express.json());
    app.use("/api/auth", authRouter);
    await new Promise<void>((done) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        done();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
    if (dealer?.id) await storage.deleteDealership(dealer.id);
  });

  const login = (body: unknown) =>
    fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  test("valid credentials return a token and never the password hash", async () => {
    const res = await login({ email: activeEmail, password });
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(typeof json.token).toBe("string");
    expect(json.user.email).toBe(activeEmail);
    expect(json.user.passwordHash).toBeUndefined();
  });

  test("wrong password is rejected with 401 and no token", async () => {
    const res = await login({ email: activeEmail, password: "totally-wrong-pw" });
    expect(res.status).toBe(401);
    const json: any = await res.json();
    expect(json.token).toBeUndefined();
  });

  test("unknown email is rejected with 401", async () => {
    const res = await login({ email: `nobody-${tag}@example.com`, password });
    expect(res.status).toBe(401);
  });

  test("missing fields return 400", async () => {
    const res = await login({ email: activeEmail });
    expect(res.status).toBe(400);
  });

  test("a deactivated account is refused with 403", async () => {
    const res = await login({ email: inactiveEmail, password });
    expect(res.status).toBe(403);
  });

  test("protected route /me requires a token", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    expect(res.status).toBe(401);
  });

  test("protected route /me rejects an invalid token", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(res.status).toBe(401);
  });

  test("protected route /me accepts a token issued by login", async () => {
    const loginRes = await login({ email: activeEmail, password });
    const { token }: any = await loginRes.json();
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.user.email).toBe(activeEmail);
  });

  test("repeated login attempts are rate-limited (429)", async () => {
    let saw429 = false;
    for (let i = 0; i < 15; i++) {
      const res = await login({ email: `nobody-${tag}@example.com`, password: "x" });
      if (res.status === 429) {
        saw429 = true;
        break;
      }
    }
    expect(saw429).toBe(true);
  });
});
