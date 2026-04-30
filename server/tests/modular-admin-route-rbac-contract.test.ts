import { readFileSync } from "fs";
import { resolve } from "path";

describe("modular admin route RBAC contract", () => {
  const adminRoutesSource = readFileSync(resolve(process.cwd(), "server/routes/admin.ts"), "utf8");

  it("requires explicit permissions for sensitive system and secret routes", () => {
    expect(adminRoutesSource).toContain(
      'router.post("/restart-server", authMiddleware, requirePermission("admin.audit"), superAdminOnly, sensitiveLimiter'
    );
    expect(adminRoutesSource).toContain(
      'router.get("/secrets/password-status", authMiddleware, requirePermission("integrations.read"), superAdminOnly'
    );
    expect(adminRoutesSource).toContain(
      'router.post("/secrets/set-password", authMiddleware, requirePermission("integrations.write"), superAdminOnly, sensitiveLimiter'
    );
  });

  it("requires tenant and user permissions for dealership and user lifecycle routes", () => {
    for (const route of [
      'router.get("/dealerships", authMiddleware, requireCapability("tenant.manage"), superAdminOnly',
      'router.post("/dealerships", authMiddleware, requireCapability("tenant.manage"), requirePermission("users.invite"), superAdminOnly',
      'router.get("/dealerships/:dealershipId", authMiddleware, requireCapability("tenant.manage"), superAdminOnly',
      'router.patch("/dealerships/:dealershipId", authMiddleware, requireCapability("tenant.manage"), requirePermission("users.manage"), superAdminOnly',
      'router.get("/users", authMiddleware, requirePermission("users.manage"), superAdminOnly',
      'router.post("/users", authMiddleware, requirePermission("users.invite"), superAdminOnly',
    ]) {
      expect(adminRoutesSource).toContain(route);
    }
  });

  it("requires audit permission for dashboard, audit, log, and health surfaces", () => {
    for (const route of [
      'router.get("/global-settings", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/dashboard/health", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/dashboard/business-metrics", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/dashboard/dealership-activity", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/dashboard/ai-metrics", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/dashboard/scraping-metrics", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/dashboard/fb-marketplace-metrics", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/dashboard/alerts", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.post("/dashboard/alerts/:alertId/resolve", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/audit-logs", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/scraper-logs", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/system-health", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
    ]) {
      expect(adminRoutesSource).toContain(route);
    }
  });

  it("requires tenant settings capability before mutating global settings", () => {
    expect(adminRoutesSource).toContain(
      'router.put("/global-settings/:key", authMiddleware, requireCapability("tenant.settings.write"), superAdminOnly'
    );
  });

  it("does not leave modular admin routes guarded only by superAdminOnly", () => {
    const routeLines = adminRoutesSource
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /router\.(get|post|patch|put|delete)\("/.test(line));

    const routesWithoutExplicitMiddleware = routeLines.filter(
      (line) => !line.includes("requirePermission(") && !line.includes("requireCapability(")
    );

    expect(routeLines.length).toBeGreaterThanOrEqual(20);
    expect(routesWithoutExplicitMiddleware).toEqual([]);
  });
});
