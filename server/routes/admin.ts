/**
 * Admin Routes — Modular Router
 * Super-admin only: Dashboard, dealerships, users, settings, system health
 * Base: /api/super-admin
 */

import { Router } from "express";
import { storage } from "../storage";
import { sensitiveLimiter } from "../middleware/http-rate-limiters";
import { authMiddleware, requireCapability, requirePermission, type AuthRequest } from "../auth";
import { hashPassword } from "../auth";
import { normalizeRole } from "@shared/authz";
import { superAdminOnly } from "../tenant-middleware";
import { logError } from "../error-utils";
import { getSystemHealth, getBusinessMetrics, getDealershipActivity, getAIMetrics, getScrapingMetrics, getFBMarketplaceMetrics, getSystemAlerts, resolveAlert } from "../services/admin-dashboard";

const router = Router();

function parsePositiveInteger(value: unknown): number | null {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^[1-9]\d*$/.test(raw)) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/* ─── System Control ─── */

router.post("/restart-server", authMiddleware, requirePermission("admin.audit"), superAdminOnly, sensitiveLimiter, async (req: any, res) => {
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

router.get("/secrets/password-status", authMiddleware, requirePermission("integrations.read"), superAdminOnly, async (req: any, res) => {
  try {
    const config = await storage.getAdminConfig();
    res.json({ hasPassword: !!config?.secretsPasswordHash });
  } catch (error) {
    logError("Password status error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-secrets-password-status" });
    res.status(500).json({ error: "Failed to check status" });
  }
});

router.post("/secrets/set-password", authMiddleware, requirePermission("integrations.write"), superAdminOnly, sensitiveLimiter, async (req: any, res) => {
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

router.get("/dealerships", authMiddleware, requireCapability("tenant.manage"), superAdminOnly, async (req, res) => {
  try {
    const dealerships = await storage.getAllDealerships();
    res.json(dealerships);
  } catch (error) {
    logError("Error fetching dealerships:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dealerships" });
    res.status(500).json({ error: "Failed to fetch dealerships" });
  }
});

router.post("/dealerships", authMiddleware, requireCapability("tenant.manage"), requirePermission("users.invite"), superAdminOnly, async (req, res) => {
  try {
    const { name, slug, subdomain, masterAdminEmail, masterAdminName, masterAdminPassword } = req.body;
    if (!name || !slug || !subdomain || !masterAdminEmail || !masterAdminName || !masterAdminPassword) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const existingUser = await storage.getUserByEmail(masterAdminEmail);
    if (existingUser) return res.status(400).json({ error: "Email already exists" });

    const dealership = await storage.createDealership({ name, slug, subdomain });
    const passwordHash = await hashPassword(masterAdminPassword);
    const masterUser = await storage.createUser({
      email: masterAdminEmail, name: masterAdminName, passwordHash,
      role: "master", dealershipId: dealership.id
    });
    res.status(201).json({ dealership, masterUser });
  } catch (error) {
    logError("Error creating dealership:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dealerships" });
    res.status(500).json({ error: "Failed to create dealership" });
  }
});

router.get("/dealerships/:dealershipId", authMiddleware, requireCapability("tenant.manage"), superAdminOnly, async (req, res) => {
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

router.patch("/dealerships/:dealershipId", authMiddleware, requireCapability("tenant.manage"), requirePermission("users.manage"), superAdminOnly, async (req, res) => {
  try {
    const dealership = await storage.updateDealership(parseInt(req.params.dealershipId), req.body);
    res.json(dealership);
  } catch (error) {
    logError("Error updating dealership:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dealerships-id" });
    res.status(500).json({ error: "Failed to update dealership" });
  }
});

/* ─── Users ─── */

router.get("/users", authMiddleware, requirePermission("users.manage"), superAdminOnly, async (req, res) => {
  try {
    const dealershipId = req.query.dealershipId ? parsePositiveInteger(req.query.dealershipId) : undefined;
    const role = req.query.role as string | undefined;
    const search = req.query.search as string | undefined;

    if (req.query.dealershipId && dealershipId === null) {
      return res.status(400).json({ error: "dealershipId must be a positive integer" });
    }

    const users = await storage.getAllUsersForSuperAdmin({ dealershipId, role, search });
    res.json(users);
  } catch (error) {
    logError("Error fetching users:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-users" });
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/users", authMiddleware, requirePermission("users.invite"), superAdminOnly, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const { email, name, password, role, dealershipId } = req.body;
    const normalizedRole = normalizeRole(role);
    const parsedDealershipId = parsePositiveInteger(dealershipId);

    if (
      typeof email !== "string" ||
      typeof name !== "string" ||
      typeof password !== "string" ||
      typeof role !== "string" ||
      dealershipId === undefined ||
      dealershipId === null
    ) {
      return res.status(400).json({ error: "Email, name, password, role, and dealershipId are required" });
    }

    if (password.length < 12) {
      return res.status(400).json({ error: "Password must be at least 12 characters" });
    }

    if (!normalizedRole || normalizedRole === "super_admin") {
      return res.status(400).json({ error: "Invalid role" });
    }

    if (parsedDealershipId === null) {
      return res.status(400).json({ error: "dealershipId must be a positive integer" });
    }

    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: "A user with this email already exists" });
    }

    const dealership = await storage.getDealershipById(parsedDealershipId);
    if (!dealership) {
      return res.status(400).json({ error: "Dealership not found" });
    }

    const passwordHash = await hashPassword(password);
    const user = await storage.createUser({
      email,
      name,
      passwordHash,
      role: normalizedRole,
      dealershipId: parsedDealershipId,
      isActive: true,
      createdBy: authReq.user!.id,
    });

    await storage.logAuditAction({
      userId: authReq.user!.id,
      userEmail: authReq.user!.email,
      action: "user_created",
      resource: "user",
      resourceId: String(user.id),
      details: JSON.stringify({ email, name, role: normalizedRole, dealershipId: parsedDealershipId, requestedRole: role }),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const { passwordHash: _, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    logError("Error creating user:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-users" });
    res.status(500).json({ error: "Failed to create user" });
  }
});

/* ─── Global Settings ─── */

router.get("/global-settings", authMiddleware, requirePermission("admin.audit"), superAdminOnly, async (req, res) => {
  try {
    const settings = await storage.getAllGlobalSettings();
    res.json(settings);
  } catch (error) {
    logError("Error fetching settings:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-global-settings" });
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.put("/global-settings/:key", authMiddleware, requireCapability("tenant.settings.write"), superAdminOnly, async (req, res) => {
  try {
    await (storage as any).setGlobalSetting(req.params.key, req.body.value);
    res.json({ success: true });
  } catch (error) {
    logError("Error setting global setting:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-global-settings-key" });
    res.status(500).json({ error: "Failed to set setting" });
  }
});

/* ─── Dashboard Metrics ─── */

router.get("/dashboard/health", authMiddleware, requirePermission("admin.audit"), superAdminOnly, async (req, res) => {
  try {
    const health = await getSystemHealth();
    res.json(health);
  } catch (error) {
    logError("Dashboard health error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dashboard-health" });
    res.status(500).json({ error: "Failed to fetch health" });
  }
});

router.get("/dashboard/business-metrics", authMiddleware, requirePermission("admin.audit"), superAdminOnly, async (req, res) => {
  try {
    const metrics = await getBusinessMetrics();
    res.json(metrics);
  } catch (error) {
    logError("Business metrics error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dashboard-business-metrics" });
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

router.get("/dashboard/dealership-activity", authMiddleware, requirePermission("admin.audit"), superAdminOnly, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const activity = await getDealershipActivity(limit);
    res.json(activity);
  } catch (error) {
    logError("Dealership activity error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dashboard-dealership-activity" });
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

router.get("/dashboard/ai-metrics", authMiddleware, requirePermission("admin.audit"), superAdminOnly, async (req, res) => {
  try {
    const metrics = await getAIMetrics();
    res.json(metrics);
  } catch (error) {
    logError("AI metrics error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dashboard-ai-metrics" });
    res.status(500).json({ error: "Failed to fetch AI metrics" });
  }
});

router.get("/dashboard/scraping-metrics", authMiddleware, requirePermission("admin.audit"), superAdminOnly, async (req, res) => {
  try {
    const metrics = await getScrapingMetrics();
    res.json(metrics);
  } catch (error) {
    logError("Scraping metrics error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dashboard-scraping-metrics" });
    res.status(500).json({ error: "Failed to fetch scraping metrics" });
  }
});

router.get("/dashboard/fb-marketplace-metrics", authMiddleware, requirePermission("admin.audit"), superAdminOnly, async (req, res) => {
  try {
    const metrics = await getFBMarketplaceMetrics();
    res.json(metrics);
  } catch (error) {
    logError("FB metrics error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dashboard-fb-marketplace-metrics" });
    res.status(500).json({ error: "Failed to fetch FB metrics" });
  }
});

router.get("/dashboard/alerts", authMiddleware, requirePermission("admin.audit"), superAdminOnly, async (req, res) => {
  try {
    const minSeverity = (req.query.minSeverity as "low" | "medium" | "high" | "critical") || "low";
    const alerts = await getSystemAlerts(minSeverity);
    res.json(alerts);
  } catch (error) {
    logError("Alerts error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dashboard-alerts" });
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

router.post("/dashboard/alerts/:alertId/resolve", authMiddleware, requirePermission("admin.audit"), superAdminOnly, async (req: any, res) => {
  try {
    const resolved = await resolveAlert(req.params.alertId, req.user!.id);
    res.json({ success: resolved });
  } catch (error) {
    logError("Resolve alert error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-dashboard-alerts-resolve" });
    res.status(500).json({ error: "Failed to resolve alert" });
  }
});

/* ─── Audit & Logs ─── */

router.get("/audit-logs", authMiddleware, requirePermission("admin.audit"), superAdminOnly, async (req, res) => {
  try {
    const logs = await storage.getAuditLogs();
    res.json(logs);
  } catch (error) {
    logError("Audit logs error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-audit-logs" });
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

router.get("/scraper-logs", authMiddleware, requirePermission("admin.audit"), superAdminOnly, async (req, res) => {
  try {
    const logs = await storage.getScraperLogs();
    res.json(logs);
  } catch (error) {
    logError("Scraper logs error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-scraper-logs" });
    res.status(500).json({ error: "Failed to fetch scraper logs" });
  }
});

router.get("/system-health", authMiddleware, requirePermission("admin.audit"), superAdminOnly, async (req, res) => {
  try {
    const health = await getSystemHealth();
    res.json(health);
  } catch (error) {
    logError("System health error:", error instanceof Error ? error : new Error(String(error)), { route: "api-super-admin-system-health" });
    res.status(500).json({ error: "Failed to fetch system health" });
  }
});

export default router;
