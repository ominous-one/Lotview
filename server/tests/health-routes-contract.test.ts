import express, { type Express } from "express";
import request from "supertest";
import { beforeAll, describe, expect, it, jest } from "@jest/globals";

let app: Express;

beforeAll(async () => {
  await (jest as any).unstable_mockModule("../db", () => ({
    db: {
      execute: jest.fn().mockResolvedValue([{ ok: 1 }]),
    },
  }));

  await (jest as any).unstable_mockModule("../services/redis", () => ({
    checkRedisHealth: jest.fn().mockResolvedValue({ healthy: true, latencyMs: 1 }),
  }));

  await (jest as any).unstable_mockModule("../services/queue", () => ({
    getQueueHealth: jest.fn().mockResolvedValue({ waiting: 0, active: 0, failed: 0 }),
  }));

  const { default: healthRouter } = await import("../routes/health");
  app = express();
  app.use(healthRouter);
});

describe("health and observability routes", () => {
  it("returns lightweight health status", async () => {
    const response = await request(app).get("/api/health").expect(200);

    expect(response.body.status).toBe("healthy");
    expect(response.body.service).toBe("lotview-api");
    expect(response.body.timestamp).toEqual(expect.any(String));
  });

  it("returns readiness with database, redis, and queue checks", async () => {
    const response = await request(app).get("/api/ready").expect(200);

    expect(response.body.status).toBe("ready");
    expect(response.body.checks.database.ok).toBe(true);
    expect(response.body.checks.redis.ok).toBe(true);
    expect(response.body.checks.queues.ok).toBe(true);
    expect(response.body.checks.queues.details).toEqual({ waiting: 0, active: 0, failed: 0 });
  });

  it("returns text metrics", async () => {
    const response = await request(app).get("/api/metrics").expect(200);

    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.text).toContain("lotview_uptime_seconds");
    expect(response.text).toContain("lotview_memory_heap_used_bytes");
  });

  it("returns version metadata", async () => {
    const response = await request(app).get("/api/version").expect(200);

    expect(response.body.service).toBe("lotview-api");
    expect(response.body.node).toEqual(expect.any(String));
    expect(response.body.commit).toEqual(expect.any(String));
  });
});
