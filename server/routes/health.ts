/**
 * Health Check & Observability Routes
 * Production-ready endpoints for monitoring, alerting, and diagnostics.
 */

import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { checkRedisHealth } from "../services/redis";
import { getQueueHealth } from "../services/queue";
import { log } from "../app";

const router = Router();

/**
 * GET /api/health
 * Lightweight health check for load balancers.
 * Returns 200 if the process is alive.
 */
router.get("/api/health", (_req, res) => {
  res.json({
    status: "healthy",
    service: "lotview-api",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || "1.0.0",
  });
});

/**
 * GET /api/ready
 * Deep readiness check — verifies database, Redis, and critical services.
 * Used by orchestrators (Kubernetes, Docker Compose) before routing traffic.
 */
router.get("/api/ready", async (_req, res) => {
  const checks: Record<string, { ok: boolean; latencyMs: number; error?: string }> = {};
  let allHealthy = true;

  // Database check
  const dbStart = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = { ok: false, latencyMs: Date.now() - dbStart, error: (err as Error).message };
    allHealthy = false;
  }

  // Redis check
  const redisStart = Date.now();
  try {
    const redisHealth = await checkRedisHealth();
    checks.redis = { ok: redisHealth.status === "connected", latencyMs: Date.now() - redisStart };
    if (!checks.redis.ok) {
      checks.redis.error = redisHealth.error || "Redis not connected";
      allHealthy = false;
    }
  } catch (err) {
    checks.redis = { ok: false, latencyMs: Date.now() - redisStart, error: (err as Error).message };
    allHealthy = false;
  }

  // Queue check
  const queueStart = Date.now();
  try {
    const queueHealth = await getQueueHealth();
    checks.queues = { ok: queueHealth.status === "healthy", latencyMs: Date.now() - queueStart };
    if (!checks.queues.ok) {
      checks.queues.error = queueHealth.error || "Queue unhealthy";
      allHealthy = false;
    }
  } catch (err) {
    checks.queues = { ok: false, latencyMs: Date.now() - queueStart, error: (err as Error).message };
    allHealthy = false;
  }

  const statusCode = allHealthy ? 200 : 503;
  res.status(statusCode).json({
    status: allHealthy ? "ready" : "not_ready",
    checks,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/metrics
 * Basic runtime metrics for monitoring systems (Prometheus-compatible).
 */
router.get("/api/metrics", (_req, res) => {
  const memUsage = process.memoryUsage();
  const metrics = [
    `# Lotview Runtime Metrics`,
    `lotview_uptime_seconds ${process.uptime()}`,
    `lotview_memory_rss_bytes ${memUsage.rss}`,
    `lotview_memory_heap_total_bytes ${memUsage.heapTotal}`,
    `lotview_memory_heap_used_bytes ${memUsage.heapUsed}`,
    `lotview_memory_external_bytes ${memUsage.external || 0}`,
    `lotview_event_loop_lag_seconds ${(process.hrtime()[1] / 1e9).toFixed(6)}`,
    `lotview_active_handles ${process._getActiveHandles?.().length || 0}`,
    `lotview_active_requests ${process._getActiveRequests?.().length || 0}`,
  ].join("\n");

  res.set("Content-Type", "text/plain");
  res.send(metrics);
});

/**
 * GET /api/version
 * Service version and build info.
 */
router.get("/api/version", (_req, res) => {
  res.json({
    service: "lotview-api",
    version: process.env.npm_package_version || "1.0.0",
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    env: process.env.NODE_ENV,
    commit: process.env.GIT_COMMIT || "unknown",
    buildTime: process.env.BUILD_TIME || "unknown",
  });
});

export default router;
