/**
 * Admin Routes — Modular Router
 * Super-admin only: Dashboard, dealerships, users, settings, system health
 * Base: /api/super-admin
 */

import { Router } from "express";
import { storage } from "../storage";
import { authMiddleware, superAdminOnly } from "../tenant-middleware";
import { logError } from "../error-utils";
import { getSystemHealth, getBusinessMetrics, getDealershipActivity, getAIMetrics, getScrapingMetrics, getFBMarketplaceMetrics, getSystemAlerts, resolveAlert } from "../services/admin-dashboard";

const router = Router();

/* ─── System Control ─── */

router.post("/restart-server", authMiddleware, superAdminOnly, async (req: any, res) => {
  try {
    console.log("Server restart requested by super admin");
    res.json({ success: true, message: "Restart initiated" });
    setTimeout(() => process.exit(0), 1000);
  } catch (error) {
    logError("Restart error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-restart" });
    res.status(500).json({ error: "Failed to restart" });
  }
});

/* ─── Secrets Management ─── */

router.get("/secrets/password-status", authMiddleware, superAdminOnly, async (req: any, res) => {
  try {
    const config = await storage.getAdminConfig();
    res.json({ hasPassword: !!config?.secretsPasswordHash });
  } catch (error) {
    logError("Password status error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-secrets-password-status" });
    res.status(500).json({ error: "Failed to check status" });
  }
});

router.post("/secrets/set-password", authMiddleware, superAdminOnly, async (req: any, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 12) {
      return res.status(400).json({ error: "Password must be at least 12 characters" });
    }
    await storage.setSecretsPassword(password);
    res.json({ success: true });
  } catch (error) {
    logError("Set password error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-secrets-set-password" });
    res.status(500).json({ error: "Failed to set password" });
  }
});

/* ─── Dealerships ─── */

router.get("/dealerships", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const dealerships = await storage.getAllDealerships();
    res.json(dealerships);
  } catch (error) {
    logError("Error fetching dealerships:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dealerships" });
    res.status(500).json({ error: "Failed to fetch dealerships" });
  }
});

router.post("/dealerships", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const { name, slug, subdomain, masterAdminEmail, masterAdminName, masterAdminPassword } = req.body;
    if (!name || !slug || !subdomain || !masterAdminEmail || !masterAdminName || !masterAdminPassword) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const existingUser = await storage.getUserByEmail(masterAdminEmail);
    if (existingUser) return res.status(400).json({ error: "Email already exists" });

    const dealership = await storage.createDealership({ name, slug, subdomain });
    const masterUser = await storage.createUser({
      email: masterAdminEmail, name: masterAdminName, password: masterAdminPassword,
      role: "master", dealershipId: dealership.id
    });
    res.status(201).json({ dealership, masterUser });
  } catch (error) {
    logError("Error creating dealership:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dealerships" });
    res.status(500).json({ error: "Failed to create dealership" });
  }
});

router.get("/dealerships/:dealershipId", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const dealership = await storage.getDealershipById(parseInt(req.params.dealershipId));
    if (!dealership) return res.status(404).json({ error: "Dealership not found" });
    const users = await storage.getUsersByDealership(dealership.id);
    const masterUser = users.find((u: any) => u.role === "master");
    res.json({ ...dealership, masterUser });
  } catch (error) {
    logError("Error fetching dealership:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dealerships-id" });
    res.status(500).json({ error: "Failed to fetch dealership" });
  }
});

router.patch("/dealerships/:dealershipId", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const dealership = await storage.updateDealership(parseInt(req.params.dealershipId), req.body);
    res.json(dealership);
  } catch (error) {
    logError("Error updating dealership:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dealerships-id" });
    res.status(500).json({ error: "Failed to update dealership" });
  }
});

/* ─── Users ─── */

router.get("/users", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const users = await storage.getAllUsers();
    res.json(users);
  } catch (error) {
    logError("Error fetching users:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-users" });
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/users", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const user = await storage.createUser(req.body);
    res.status(201).json(user);
  } catch (error) {
    logError("Error creating user:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-users" });
    res.status(500).json({ error: "Failed to create user" });
  }
});

/* ─── Global Settings ─── */

router.get("/global-settings", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const settings = await storage.getAllGlobalSettings();
    res.json(settings);
  } catch (error) {
    logError("Error fetching settings:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-global-settings" });
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.put("/global-settings/:key", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    await storage.setGlobalSetting(req.params.key, req.body.value);
    res.json({ success: true });
  } catch (error) {
    logError("Error setting global setting:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-global-settings-key" });
    res.status(500).json({ error: "Failed to set setting" });
  }
});

/* ─── Dashboard Metrics ─── */

router.get("/dashboard/health", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const health = await getSystemHealth();
    res.json(health);
  } catch (error) {
    logError("Dashboard health error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dashboard-health" });
    res.status(500).json({ error: "Failed to fetch health" });
  }
});

router.get("/dashboard/business-metrics", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const metrics = await getBusinessMetrics();
    res.json(metrics);
  } catch (error) {
    logError("Business metrics error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dashboard-business-metrics" });
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

router.get("/dashboard/dealership-activity", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const activity = await getDealershipActivity(limit);
    res.json(activity);
  } catch (error) {
    logError("Dealership activity error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dashboard-dealership-activity" });
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

router.get("/dashboard/ai-metrics", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const metrics = await getAIMetrics();
    res.json(metrics);
  } catch (error) {
    logError("AI metrics error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dashboard-ai-metrics" });
    res.status(500).json({ error: "Failed to fetch AI metrics" });
  }
});

router.get("/dashboard/scraping-metrics", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const metrics = await getScrapingMetrics();
    res.json(metrics);
  } catch (error) {
    logError("Scraping metrics error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dashboard-scraping-metrics" });
    res.status(500).json({ error: "Failed to fetch scraping metrics" });
  }
});

router.get("/dashboard/fb-marketplace-metrics", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const metrics = await getFBMarketplaceMetrics();
    res.json(metrics);
  } catch (error) {
    logError("FB metrics error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dashboard-fb-marketplace-metrics" });
    res.status(500).json({ error: "Failed to fetch FB metrics" });
  }
});

router.get("/dashboard/alerts", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const minSeverity = (req.query.minSeverity as "low" | "medium" | "high" | "critical") || "low";
    const alerts = await getSystemAlerts(minSeverity);
    res.json(alerts);
  } catch (error) {
    logError("Alerts error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dashboard-alerts" });
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

router.post("/dashboard/alerts/:alertId/resolve", authMiddleware, superAdminOnly, async (req: any, res) => {
  try {
    const resolved = await resolveAlert(req.params.alertId, req.user!.id);
    res.json({ success: resolved });
  } catch (error) {
    logError("Resolve alert error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dashboard-alerts-resolve" });
    res.status(500).json({ error: "Failed to resolve alert" });
  }
});

/* ─── Audit & Logs ─── */

router.get("/audit-logs", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const logs = await storage.getAuditLogs();
    res.json(logs);
  } catch (error) {
    logError("Audit logs error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-audit-logs" });
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

router.get("/scraper-logs", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const logs = await storage.getScraperLogs();
    res.json(logs);
  } catch (error) {
    logError("Scraper logs error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-scraper-logs" });
    res.status(500).json({ error: "Failed to fetch scraper logs" });
  }
});

router.get("/system-health", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const health = await getSystemHealth();
    res.json(health);
  } catch (error) {
    logError("System health error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-system-health" });
    res.status(500).json({ error: "Failed to fetch system health" });
  }
});

export default router;
