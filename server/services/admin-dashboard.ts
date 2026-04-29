/**
 * Admin Dashboard API Service
 * Provides aggregated metrics and real-time data for the super admin dashboard.
 * Powers the V2 admin dashboard with system health, business metrics, and alerts.
 */

import { logInfo, logError } from "../error-utils";
import { storage } from "../storage";
import { db } from "../db";
import { getRedisClient } from "./redis";
import { getDailyUsage as getAIDailyUsage, getTopSpenders } from "./ai-cost-tracker";
import { getQueueHealth } from "./queue";

// ---- Types ----

export interface SystemHealth {
  status: "healthy" | "degraded" | "critical";
  services: Array<{
    name: string;
    status: "up" | "down" | "degraded";
    latencyMs: number;
    lastChecked: Date;
  }>;
  database: { connections: number; activeQueries: number; poolUtilization: number };
  redis: { connected: boolean; latencyMs: number; memoryUsage: string };
  queues: Record<string, { waiting: number; active: number; completed: number; failed: number }>;
}

export interface BusinessMetrics {
  totalDealerships: number;
  activeDealerships: number; // Logged in within 7 days
  totalVehicles: number;
  totalConversations: number;
  conversationsToday: number;
  mrr: number; // Monthly recurring revenue
  newDealershipsThisMonth: number;
  churnedThisMonth: number;
}

export interface DealershipActivity {
  id: number;
  name: string;
  lastLoginAt: Date | null;
  vehicleCount: number;
  conversationCount: number;
  lastScrapeAt: Date | null;
  facebookConnected: boolean;
  ghlConnected: boolean;
  aiDailyCost: number;
  status: "active" | "idle" | "at_risk";
}

export interface AIMetrics {
  totalCallsToday: number;
  totalCostToday: number;
  avgResponseTimeMs: number;
  topSpenders: Array<{ dealershipId: number; name: string; calls: number; costUsd: number }>;
  modelDistribution: Record<string, number>;
}

export interface ScrapingMetrics {
  scrapesToday: number;
  successRate: number;
  totalVehiclesScraped: number;
  avgVehiclesPerScrape: number;
  failuresToday: number;
  staleDealerships: number; // No scrape in 48h
}

export interface FBMarketplaceMetrics {
  postsToday: number;
  successRate: number;
  activeAccounts: number;
  restrictedAccounts: number;
  avgEngagementRate: number;
  bansToday: number;
}

export interface SystemAlert {
  id: string;
  dealershipId: number;
  dealershipName: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  message: string;
  createdAt: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

// ---- System Health ----

/**
 * Get real-time system health status.
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const redis = getRedisClient();
  const health: SystemHealth = {
    status: "healthy",
    services: [],
    database: { connections: 0, activeQueries: 0, poolUtilization: 0 },
    redis: { connected: false, latencyMs: 0, memoryUsage: "" },
    queues: {},
  };

  // Check Redis
  const redisStart = Date.now();
  try {
    await redis.ping();
    health.redis.connected = true;
    health.redis.latencyMs = Date.now() - redisStart;
    const info = await redis.info("memory");
    const usedMatch = info.match(/used_memory_human:(.+)/);
    health.redis.memoryUsage = usedMatch ? usedMatch[1].trim() : "unknown";
  } catch {
    health.redis.connected = false;
    health.status = "degraded";
  }

  health.services.push({
    name: "Redis",
    status: health.redis.connected ? "up" : "down",
    latencyMs: health.redis.latencyMs,
    lastChecked: new Date(),
  });

  // Check DB
  try {
    const { pool } = await import("../db");
    health.database.connections = (pool as any).totalCount || 0;
    health.database.poolUtilization = health.database.connections / 50; // Assuming max 50
    health.services.push({
      name: "PostgreSQL",
      status: "up",
      latencyMs: 0,
      lastChecked: new Date(),
    });
  } catch {
    health.database.connections = -1;
    health.status = "critical";
    health.services.push({
      name: "PostgreSQL",
      status: "down",
      latencyMs: 0,
      lastChecked: new Date(),
    });
  }

  // Check queues
  try {
    health.queues = await getQueueHealth();
    for (const [, counts] of Object.entries(health.queues)) {
      if (counts.failed > 100) {
        health.status = health.status === "healthy" ? "degraded" : health.status;
      }
    }
  } catch {
    health.status = "degraded";
  }

  return health;
}

// ---- Business Metrics ----

/**
 * Get aggregated business metrics.
 */
export async function getBusinessMetrics(): Promise<BusinessMetrics> {
  try {
    const dealerships = await storage.getAllDealerships?.() || [];
    const vehicles = await storage.getAllVehiclesCount?.() || 0;
    const conversations = await storage.getAllConversationsCount?.() || 0;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const activeDealerships = dealerships.filter(
      (d: any) => d.lastLoginAt && new Date(d.lastLoginAt) > sevenDaysAgo
    ).length;

    // Conversations today
    const today = now.toISOString().split("T")[0];
    const todayStart = new Date(today + "T00:00:00Z");
    const conversationsToday = await storage.getConversationCountSince?.(todayStart) || 0;

    // This month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const newDealershipsThisMonth = dealerships.filter(
      (d: any) => d.createdAt && new Date(d.createdAt) > monthStart
    ).length;

    // Approximate MRR (at $300/dealership)
    const mrr = dealerships.length * 300;

    return {
      totalDealerships: dealerships.length,
      activeDealerships,
      totalVehicles: vehicles,
      totalConversations: conversations,
      conversationsToday,
      mrr,
      newDealershipsThisMonth,
      churnedThisMonth: 0, // TODO: Track churn
    };
  } catch (error) {
    logError(`[AdminDashboard] Business metrics error: ${error}`, error);
    return {
      totalDealerships: 0, activeDealerships: 0, totalVehicles: 0,
      totalConversations: 0, conversationsToday: 0, mrr: 0,
      newDealershipsThisMonth: 0, churnedThisMonth: 0,
    };
  }
}

// ---- Dealership Activity ----

/**
 * Get per-dealership activity data.
 */
export async function getDealershipActivity(
  limit: number = 50,
  offset: number = 0
): Promise<DealershipActivity[]> {
  try {
    const dealerships = await storage.getAllDealerships?.() || [];
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 3600000);

    const activities: DealershipActivity[] = [];

    for (const d of dealerships.slice(offset, offset + limit)) {
      try {
        const vehicles = await storage.getVehiclesByDealership(d.id);
        const conversations = await storage.getConversationsByDealership?.(d.id) || [];
        const fbAccount = await storage.getFacebookAccountByDealership?.(d.id);
        const ghlAccount = await storage.getGhlAccountByDealership(d.id);

        // AI cost
        const aiUsage = await getAIDailyUsage(d.id);

        // Status
        let status: "active" | "idle" | "at_risk" = "idle";
        if (d.lastLoginAt && new Date(d.lastLoginAt) > sevenDaysAgo) {
          status = "active";
        }
        // At risk if no scrape in 48h
        const lastScrape = await storage.getLastSuccessfulScrape?.(d.id);
        if (lastScrape?.completedAt && new Date(lastScrape.completedAt) < fortyEightHoursAgo) {
          status = "at_risk";
        }

        activities.push({
          id: d.id,
          name: d.name,
          lastLoginAt: d.lastLoginAt ? new Date(d.lastLoginAt) : null,
          vehicleCount: vehicles.length,
          conversationCount: conversations.length,
          lastScrapeAt: lastScrape?.completedAt ? new Date(lastScrape.completedAt) : null,
          facebookConnected: !!fbAccount,
          ghlConnected: !!ghlAccount,
          aiDailyCost: aiUsage.costUsd,
          status,
        });
      } catch {
        // Skip problematic dealerships
      }
    }

    return activities;
  } catch (error) {
    logError(`[AdminDashboard] Dealership activity error: ${error}`, error);
    return [];
  }
}

// ---- AI Metrics ----

/**
 * Get AI usage metrics for admin dashboard.
 */
export async function getAIMetrics(): Promise<AIMetrics> {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Get top spenders
    const spenders = await getTopSpenders(undefined, 10);

    // Resolve dealership names
    const topSpendersWithNames = [];
    for (const s of spenders) {
      const dealership = await storage.getDealershipById(s.dealershipId);
      topSpendersWithNames.push({
        dealershipId: s.dealershipId,
        name: dealership?.name || `Dealership ${s.dealershipId}`,
        calls: s.calls,
        costUsd: s.costUsd,
      });
    }

    // Aggregate today's usage
    const dealerships = await storage.getAllDealerships?.() || [];
    let totalCalls = 0;
    let totalCost = 0;
    for (const d of dealerships) {
      const usage = await getAIDailyUsage(d.id, today);
      totalCalls += usage.calls;
      totalCost += usage.costUsd;
    }

    return {
      totalCallsToday: totalCalls,
      totalCostToday: Math.round(totalCost * 100) / 100,
      avgResponseTimeMs: 0, // TODO: Track from queue
      topSpenders: topSpendersWithNames,
      modelDistribution: { "claude-3-haiku": 80, "claude-3.5-sonnet": 20 }, // TODO: Track from usage
    };
  } catch (error) {
    logError(`[AdminDashboard] AI metrics error: ${error}`, error);
    return {
      totalCallsToday: 0, totalCostToday: 0, avgResponseTimeMs: 0,
      topSpenders: [], modelDistribution: {},
    };
  }
}

// ---- Scraping Metrics ----

/**
 * Get scraping performance metrics.
 */
export async function getScrapingMetrics(): Promise<ScrapingMetrics> {
  try {
    const redis = getRedisClient();
    const today = new Date().toISOString().split("T")[0];

    const scrapes = await redis.hgetall(`scrape:stats:${today}`) || {};
    const totalScrapes = parseInt(scrapes.total || "0", 10);
    const successes = parseInt(scrapes.success || "0", 10);
    const failures = parseInt(scrapes.failure || "0", 10);
    const totalVehicles = parseInt(scrapes.vehicles || "0", 10);

    const successRate = totalScrapes > 0 ? successes / totalScrapes : 0;

    // Count stale dealerships
    const dealerships = await storage.getAllDealerships?.() || [];
    let staleDealerships = 0;
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 3600000);
    for (const d of dealerships) {
      const lastScrape = await storage.getLastSuccessfulScrape?.(d.id);
      if (!lastScrape?.completedAt || new Date(lastScrape.completedAt) < fortyEightHoursAgo) {
        staleDealerships++;
      }
    }

    return {
      scrapesToday: totalScrapes,
      successRate: Math.round(successRate * 100) / 100,
      totalVehiclesScraped: totalVehicles,
      avgVehiclesPerScrape: totalScrapes > 0 ? Math.round(totalVehicles / totalScrapes) : 0,
      failuresToday: failures,
      staleDealerships,
    };
  } catch (error) {
    logError(`[AdminDashboard] Scraping metrics error: ${error}`, error);
    return { scrapesToday: 0, successRate: 0, totalVehiclesScraped: 0, avgVehiclesPerScrape: 0, failuresToday: 0, staleDealerships: 0 };
  }
}

// ---- FB Marketplace Metrics ----

/**
 * Get Facebook Marketplace performance metrics.
 */
export async function getFBMarketplaceMetrics(): Promise<FBMarketplaceMetrics> {
  try {
    const redis = getRedisClient();
    const today = new Date().toISOString().split("T")[0];

    const posts = await redis.hgetall(`fb:post_stats:${today}`) || {};
    const totalPosts = parseInt(posts.total || "0", 10);
    const successPosts = parseInt(posts.success || "0", 10);
    const bans = parseInt(posts.bans || "0", 10);

    // Count account statuses
    const accounts = await storage.getAllFacebookAccounts?.() || [];
    const restricted = accounts.filter((a: any) => a.status === "restricted" || a.status === "suspected_restricted").length;

    return {
      postsToday: totalPosts,
      successRate: totalPosts > 0 ? Math.round((successPosts / totalPosts) * 100) / 100 : 0,
      activeAccounts: accounts.length - restricted,
      restrictedAccounts: restricted,
      avgEngagementRate: 0, // TODO: Track engagement
      bansToday: bans,
    };
  } catch (error) {
    logError(`[AdminDashboard] FB metrics error: ${error}`, error);
    return { postsToday: 0, successRate: 0, activeAccounts: 0, restrictedAccounts: 0, avgEngagementRate: 0, bansToday: 0 };
  }
}

// ---- System Alerts ----

/**
 * Get active system alerts.
 */
export async function getSystemAlerts(
  resolved: boolean | string = false,
  limit: number = 50
): Promise<SystemAlert[]> {
  try {
    const filters = typeof resolved === "string"
      ? { minSeverity: resolved, limit }
      : { resolved, limit };
    const alerts = await storage.getSystemAlerts?.(filters) || [];

    return alerts.map((a: any) => ({
      id: String(a.id),
      dealershipId: a.dealershipId,
      dealershipName: a.dealership?.name || `Dealership ${a.dealershipId}`,
      type: a.type,
      severity: a.severity,
      title: a.title,
      message: a.message,
      createdAt: new Date(a.createdAt),
      resolved: a.resolved,
      resolvedAt: a.resolvedAt ? new Date(a.resolvedAt) : undefined,
    }));
  } catch (error) {
    logError(`[AdminDashboard] Alerts error: ${error}`, error);
    return [];
  }
}

/**
 * Resolve a system alert.
 */
export async function resolveAlert(alertId: string, resolvedBy: number): Promise<boolean> {
  try {
    await storage.resolveSystemAlert?.(parseInt(alertId), resolvedBy);
    return true;
  } catch (error) {
    logError(`[AdminDashboard] Failed to resolve alert ${alertId}: ${error}`, error);
    return false;
  }
}

// ---- Revenue Metrics ----

/**
 * Get revenue metrics for admin dashboard.
 */
export async function getRevenueMetrics(): Promise<{
  mrr: number;
  arr: number;
  thisMonthRevenue: number;
  lastMonthRevenue: number;
  growthRate: number;
  topDealerships: Array<{ name: string; revenue: number }>;
}> {
  try {
    const dealerships = await storage.getAllDealerships?.() || [];
    const mrr = dealerships.length * 300;
    const arr = mrr * 12;

    // TODO: Implement proper revenue tracking
    // For now, use approximation
    return {
      mrr,
      arr,
      thisMonthRevenue: mrr,
      lastMonthRevenue: mrr * 0.95, // Approximate
      growthRate: dealerships.length > 0 ? 0.05 : 0,
      topDealerships: dealerships.slice(0, 5).map((d: any) => ({
        name: d.name,
        revenue: 300,
      })),
    };
  } catch (error) {
    logError(`[AdminDashboard] Revenue error: ${error}`, error);
    return { mrr: 0, arr: 0, thisMonthRevenue: 0, lastMonthRevenue: 0, growthRate: 0, topDealerships: [] };
  }
}
