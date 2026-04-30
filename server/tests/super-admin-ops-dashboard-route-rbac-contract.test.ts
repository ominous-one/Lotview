import { readFileSync } from "fs";
import { resolve } from "path";

describe("super-admin ops dashboard route RBAC contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const opsDashboardBlock = routesSource.match(
    /\/\/ Get audit logs \(super admin only\)[\s\S]*?\/\/ Get all users across all dealerships/
  )?.[0];

  it("requires admin audit permission for audit, scraper log, and system health reads", () => {
    expect(opsDashboardBlock).toBeDefined();

    [
      "/api/super-admin/audit-logs",
      "/api/super-admin/scraper-logs",
      "/api/super-admin/system-health",
    ].forEach((route) => {
      expect(opsDashboardBlock).toContain(
        `app.get("${route}", authMiddleware, requirePermission("admin.audit"), superAdminOnly`
      );
    });
  });

  it("requires admin audit permission for dashboard metric and alert reads", () => {
    expect(opsDashboardBlock).toBeDefined();

    [
      "/api/super-admin/dashboard/health",
      "/api/super-admin/dashboard/business-metrics",
      "/api/super-admin/dashboard/dealership-activity",
      "/api/super-admin/dashboard/ai-metrics",
      "/api/super-admin/dashboard/scraping-metrics",
      "/api/super-admin/dashboard/fb-marketplace-metrics",
      "/api/super-admin/dashboard/alerts",
    ].forEach((route) => {
      expect(opsDashboardBlock).toContain(
        `app.get("${route}", authMiddleware, requirePermission("admin.audit"), superAdminOnly`
      );
    });
  });

  it("requires admin audit permission before resolving system alerts", () => {
    expect(opsDashboardBlock).toBeDefined();

    expect(opsDashboardBlock).toContain(
      'app.post("/api/super-admin/dashboard/alerts/:alertId/resolve", authMiddleware, requirePermission("admin.audit"), superAdminOnly'
    );
    expect(opsDashboardBlock).toContain("resolveAlert(req.params.alertId, req.user!.id)");
  });
});
