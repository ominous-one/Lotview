/**
 * Health Check & Observability Routes
 * Production-ready endpoints for monitoring, alerting, and diagnostics.
 */

import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { checkRedisHealth } from "../services/redis";
import { getQueueHealth } from "../services/queue";

const router = Router();

type ReadinessCheck = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  details?: unknown;
};

function getActiveHandleCount(): number {
  const runtimeProcess = process as NodeJS.Process & {
    _getActiveHandles?: () => unknown[];
  };
  return runtimeProcess._getActiveHandles?.().length ?? 0;
}

function getActiveRequestCount(): number {
  const runtimeProcess = process as NodeJS.Process & {
    _getActiveRequests?: () => unknown[];
  };
  return runtimeProcess._getActiveRequests?.().length ?? 0;
}

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
 * Used by orchestrators before routing traffic.
 */
router.get("/api/ready", async (_req, res) => {
  const checks: Record<string, ReadinessCheck> = {};
  let allHealthy = true;

  const dbStart = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (err) {
    checks.database = { ok: false, latencyMs: Date.now() - dbStart, error: err instanceof Error ? err.message : String(err) };
    allHealthy = false;
  }

  const redisStart = Date.now();
  try {
    const redisHealth = await checkRedisHealth();
    checks.redis = {
      ok: redisHealth.healthy,
      latencyMs: redisHealth.latencyMs,
      error: redisHealth.error,
    };
    if (!redisHealth.healthy) allHealthy = false;
  } catch (err) {
    checks.redis = { ok: false, latencyMs: Date.now() - redisStart, error: err instanceof Error ? err.message : String(err) };
    allHealthy = false;
  }

  const queueStart = Date.now();
  try {
    const queueCounts = await getQueueHealth();
    checks.queues = {
      ok: true,
      latencyMs: Date.now() - queueStart,
      details: queueCounts,
    };
  } catch (err) {
    checks.queues = { ok: false, latencyMs: Date.now() - queueStart, error: err instanceof Error ? err.message : String(err) };
    allHealthy = false;
  }

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? "ready" : "not_ready",
    checks,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/metrics
 * Basic runtime metrics for monitoring systems.
 */
router.get("/api/metrics", (_req, res) => {
  const memUsage = process.memoryUsage();
  const metrics = [
    "# Lotview Runtime Metrics",
    `lotview_uptime_seconds ${process.uptime()}`,
    `lotview_memory_rss_bytes ${memUsage.rss}`,
    `lotview_memory_heap_total_bytes ${memUsage.heapTotal}`,
    `lotview_memory_heap_used_bytes ${memUsage.heapUsed}`,
    `lotview_memory_external_bytes ${memUsage.external || 0}`,
    `lotview_active_handles ${getActiveHandleCount()}`,
    `lotview_active_requests ${getActiveRequestCount()}`,
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
    commit: process.env.GIT_COMMIT || process.env.RELEASE_SHA || "unknown",
    buildTime: process.env.BUILD_TIME || "unknown",
  });
});

export default router;
