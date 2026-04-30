import { readFileSync } from "fs";
import { resolve } from "path";

describe("super-admin filter group route RBAC contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const filterGroupBlock = routesSource.match(
    /\/\/ ===== SUPER ADMIN FILTER GROUPS ROUTES =====[\s\S]*?\/\/ ===== SUPER ADMIN SCRAPE SOURCES ROUTES =====/
  )?.[0];

  it("requires inventory read permission before reading cross-dealership filter groups", () => {
    expect(filterGroupBlock).toBeDefined();

    expect(filterGroupBlock).toContain(
      'app.get("/api/super-admin/filter-groups", authMiddleware, requirePermission("inventory.read"), superAdminOnly'
    );
    expect(filterGroupBlock).toContain(
      'app.get("/api/super-admin/filter-groups/dealership/:dealershipId", authMiddleware, requirePermission("inventory.read"), superAdminOnly'
    );
  });

  it("requires inventory write permission before mutating filter groups", () => {
    expect(filterGroupBlock).toBeDefined();

    expect(filterGroupBlock).toContain(
      'app.post("/api/super-admin/filter-groups", authMiddleware, requirePermission("inventory.write"), superAdminOnly'
    );
    expect(filterGroupBlock).toContain(
      'app.patch("/api/super-admin/filter-groups/:id", authMiddleware, requirePermission("inventory.write"), superAdminOnly'
    );
    expect(filterGroupBlock).toContain(
      'app.delete("/api/super-admin/filter-groups/:id", authMiddleware, requirePermission("inventory.write"), superAdminOnly'
    );
  });

  it("keeps dealership identity explicit for targeted filter group mutations", () => {
    expect(filterGroupBlock).toBeDefined();

    expect(filterGroupBlock).toContain("const { dealershipId, groupName, groupSlug");
    expect(filterGroupBlock).toContain("const { dealershipId, ...updates } = req.body");
    expect(filterGroupBlock).toContain("const dealershipId = parseInt(req.query.dealershipId as string)");
  });
});
