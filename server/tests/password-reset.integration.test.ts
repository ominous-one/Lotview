/**
 * Password reset — integration proof (real Postgres + live server).
 *
 * Covers the reset flow: a valid token actually changes the password (verified by
 * hash comparison), forgot-password is anti-enumeration (success for unknown email),
 * and reset-password rejects unknown tokens and too-short passwords. Avoids /login
 * (and its shared rate-limiter) by verifying the new password via the hash directly.
 *
 * Runs only when DATABASE_URL points at a real database (see `npm run test:integration`).
 */
import express from "express";
import type { Server } from "http";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { storage } from "../storage";
import { hashPassword, comparePassword } from "../auth";
import authRouter from "../routes/auth";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeIf = hasDb ? describe : describe.skip;

describeIf("Password reset (integration, real Postgres)", () => {
  let server: Server;
  let baseUrl = "";
  let dealer: any;
  let user: any;
  const tag = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const email = `reset-${tag}@example.com`;

  beforeAll(async () => {
    dealer = await storage.createDealership({ name: `Reset Dealer ${tag}`, slug: `reset-dealer-${tag}` } as any);
    user = await storage.createUser({ email, name: "Reset User", passwordHash: await hashPassword("OriginalPass123!"), role: "dealer_owner", dealershipId: dealer.id, isActive: true } as any);
    const app = express();
    app.use(express.json());
    app.use("/api/auth", authRouter);
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

  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  test("a valid reset token actually changes the password", async () => {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const lookupHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const tokenHash = await bcrypt.hash(rawToken, 12);
    await storage.createPasswordResetToken(user.id, tokenHash, new Date(Date.now() + 3_600_000), lookupHash);

    const res = await post("/api/auth/reset-password", { token: rawToken, newPassword: "BrandNewPass123!" });
    expect(res.status).toBe(200);

    const fresh = await storage.getUserById(user.id);
    expect(await comparePassword("BrandNewPass123!", fresh!.passwordHash)).toBe(true);
    expect(await comparePassword("OriginalPass123!", fresh!.passwordHash)).toBe(false);
  });

  test("forgot-password returns success for an unknown email (anti-enumeration)", async () => {
    const res = await post("/api/auth/forgot-password", { email: `nobody-${tag}@example.com` });
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
  });

  test("reset-password rejects an unknown token (400)", async () => {
    const res = await post("/api/auth/reset-password", { token: crypto.randomBytes(32).toString("hex"), newPassword: "AnotherPass123!" });
    expect(res.status).toBe(400);
  });

  test("reset-password rejects a too-short password (400)", async () => {
    const res = await post("/api/auth/reset-password", { token: crypto.randomBytes(32).toString("hex"), newPassword: "short" });
    expect(res.status).toBe(400);
  });
});
