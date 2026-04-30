import { readFileSync } from "fs";
import { resolve } from "path";

describe("super-admin Facebook catalog route RBAC contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const facebookCatalogBlock = routesSource.match(
    /\/\/ Run Apify market scrape for a dealership[\s\S]*?\/\/ ===== SUPER ADMIN FILTER GROUPS ROUTES =====/
  )?.[0];

  it("requires integration permissions for super-admin integration overview and Apify scrape routes", () => {
    expect(facebookCatalogBlock).toBeDefined();

    expect(facebookCatalogBlock).toContain(
      'app.post("/api/super-admin/dealerships/:dealershipId/apify-scrape", authMiddleware, requirePermission("integrations.write"), superAdminOnly'
    );
    expect(facebookCatalogBlock).toContain(
      'app.get("/api/super-admin/dealerships-with-integrations", authMiddleware, requirePermission("integrations.read"), superAdminOnly'
    );
  });

  it("requires integration read permission before exposing Facebook catalog configuration", () => {
    expect(facebookCatalogBlock).toBeDefined();

    expect(facebookCatalogBlock).toContain(
      'app.get("/api/super-admin/facebook-catalogs", authMiddleware, requirePermission("integrations.read"), superAdminOnly'
    );
    expect(facebookCatalogBlock).toContain(
      'app.get("/api/super-admin/dealerships/:dealershipId/facebook-catalog", authMiddleware, requirePermission("integrations.read"), superAdminOnly'
    );
  });

  it("requires integration write permission before changing or exercising Facebook catalog credentials", () => {
    expect(facebookCatalogBlock).toBeDefined();

    expect(facebookCatalogBlock).toContain(
      'app.post("/api/super-admin/dealerships/:dealershipId/facebook-catalog", authMiddleware, requirePermission("integrations.write"), superAdminOnly'
    );
    expect(facebookCatalogBlock).toContain(
      'app.delete("/api/super-admin/dealerships/:dealershipId/facebook-catalog", authMiddleware, requirePermission("integrations.write"), superAdminOnly'
    );
    expect(facebookCatalogBlock).toContain(
      'app.post("/api/super-admin/dealerships/:dealershipId/test-facebook-catalog", authMiddleware, requirePermission("integrations.write"), superAdminOnly'
    );
    expect(facebookCatalogBlock).toContain(
      'app.post("/api/super-admin/dealerships/:dealershipId/sync-facebook-catalog", authMiddleware, requirePermission("integrations.write"), superAdminOnly'
    );
  });

  it("keeps audit coverage for catalog config changes and syncs", () => {
    expect(facebookCatalogBlock).toBeDefined();

    expect(facebookCatalogBlock).toContain('action: "UPDATE_FACEBOOK_CATALOG_CONFIG"');
    expect(facebookCatalogBlock).toContain('action: "DELETE_FACEBOOK_CATALOG_CONFIG"');
    expect(facebookCatalogBlock).toContain('action: "SYNC_FACEBOOK_CATALOG"');
    expect(facebookCatalogBlock).toContain('action: "APIFY_MARKET_SCRAPE"');
  });
});
