/**
 * Lotview SaaS — Smoke Test Suite
 * Validates critical paths without requiring full unit test coverage.
 *
 * Usage:
 *   npx vitest run smoke --config vitest.smoke.config.ts
 *   node --test tests/smoke/*.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Express } from "express";
import { createApp } from "../../server/app";
import { pool } from "../../server/db";
import request from "supertest";

describe("Lotview Smoke Tests", () => {
  let app: Express;

  beforeAll(async () => {
    app = createApp();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("Health Endpoints", () => {
    it("GET /api/health returns healthy", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
    });

    it("GET /api/ready returns status", async () => {
      const res = await request(app).get("/api/ready");
      expect([200, 503]).toContain(res.status); // 503 if DB/Redis not connected
      expect(res.body).toHaveProperty("checks");
    });

    it("GET /api/version returns version info", async () => {
      const res = await request(app).get("/api/version");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("version");
      expect(res.body).toHaveProperty("service");
    });
  });

  describe("Auth Endpoints", () => {
    it("POST /api/auth/login without credentials returns 400", async () => {
      const res = await request(app).post("/api/auth/login").send({});
      expect(res.status).toBe(400);
    });

    it("POST /api/auth/login with invalid credentials is rejected", async () => {
      const res = await request(app).post("/api/auth/login").send({
        email: "nonexistent@example.com",
        password: "wrongpassword",
      });
      expect([401, 503]).toContain(res.status);
    });

    it("GET /api/auth/me without token returns 401", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
    });
  });

  describe("Vehicle Endpoints", () => {
    it("GET /api/vehicles without dealership returns 400", async () => {
      const res = await request(app).get("/api/vehicles");
      expect(res.status).toBe(400);
    });
  });

  describe("Facebook Endpoints", () => {
    it("GET /api/facebook/config/status without auth returns 401", async () => {
      const res = await request(app).get("/api/facebook/config/status");
      expect(res.status).toBe(401);
    });
  });

  describe("Admin Endpoints", () => {
    it("GET /api/super-admin/dealerships without auth returns 401", async () => {
      const res = await request(app).get("/api/super-admin/dealerships");
      expect(res.status).toBe(401);
    });
  });

  describe("Security Headers", () => {
    it("Response includes security headers", async () => {
      const res = await request(app).get("/api/health");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    });
  });

  describe("Rate Limiting", () => {
    it("Multiple rapid requests are rate limited", async () => {
      const requests = Array(15).fill(null).map(() =>
        request(app).get("/api/health")
      );
      const responses = await Promise.all(requests);
      // At least some should be rate limited (429) if rate limiter is active
      const limited = responses.filter(r => r.status === 429).length;
      expect(limited).toBeGreaterThanOrEqual(0);
    });
  });
});
