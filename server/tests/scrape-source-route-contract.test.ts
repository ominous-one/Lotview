import { readFileSync } from "fs";
import { resolve } from "path";

describe("scrape source route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

  it("requires explicit integration permissions for super-admin scrape source management", () => {
    expect(routesSource).toContain(
      'app.get("/api/super-admin/scrape-sources", authMiddleware, requirePermission("integrations.read"), superAdminOnly'
    );
    expect(routesSource).toContain(
      'app.post("/api/super-admin/scrape-sources", authMiddleware, requirePermission("integrations.write"), superAdminOnly'
    );
    expect(routesSource).toContain(
      'app.patch("/api/super-admin/scrape-sources/:id", authMiddleware, requirePermission("integrations.write"), superAdminOnly'
    );
    expect(routesSource).toContain(
      'app.delete("/api/super-admin/scrape-sources/:id", authMiddleware, requirePermission("integrations.write"), superAdminOnly'
    );
    expect(routesSource).toContain(
      'app.post("/api/super-admin/scrape-sources/:id/scrape", authMiddleware, requirePermission("integrations.write"), superAdminOnly'
    );
  });

  it("requires integration permissions and dealership context for dealership scrape source management", () => {
    expect(routesSource).toContain(
      'app.get("/api/scrape-sources", authMiddleware, requirePermission("integrations.read"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/scrape-sources", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.patch("/api/scrape-sources/:id", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.delete("/api/scrape-sources/:id", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/scrape-sources/:id/scrape", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership'
    );
  });
});
