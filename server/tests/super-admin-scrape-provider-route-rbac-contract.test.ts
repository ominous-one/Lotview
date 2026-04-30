import { readFileSync } from "fs";
import { resolve } from "path";

describe("super-admin scrape provider route RBAC contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const scrapeProviderBlock = routesSource.match(
    /\/\/ ===== BROWSERLESS SCRAPING ROUTES =====[\s\S]*?\/\/ Upload vehicle images to Object Storage/
  )?.[0];

  it("requires integration read permission for provider status and connection checks", () => {
    expect(scrapeProviderBlock).toBeDefined();

    expect(scrapeProviderBlock).toContain(
      'app.get("/api/super-admin/browserless/test", authMiddleware, requirePermission("integrations.read"), superAdminOnly'
    );
    expect(scrapeProviderBlock).toContain(
      'app.get("/api/super-admin/browserless/status", authMiddleware, requirePermission("integrations.read"), superAdminOnly'
    );
  });

  it("requires integration write permission for scrape-triggering provider operations", () => {
    expect(scrapeProviderBlock).toBeDefined();

    expect(scrapeProviderBlock).toContain(
      'app.post("/api/super-admin/browserless/scrape-inventory", authMiddleware, requirePermission("integrations.write"), superAdminOnly'
    );
    expect(scrapeProviderBlock).toContain(
      'app.post("/api/super-admin/browserless/scrape-market", authMiddleware, requirePermission("integrations.write"), superAdminOnly'
    );
    expect(scrapeProviderBlock).toContain(
      'app.post("/api/super-admin/robust-scrape", authMiddleware, requirePermission("integrations.write"), superAdminOnly'
    );
  });

  it("requires integration write permission before exercising external scrape providers", () => {
    expect(scrapeProviderBlock).toBeDefined();

    expect(scrapeProviderBlock).toContain(
      'app.post("/api/super-admin/zenrows/test", authMiddleware, requirePermission("integrations.write"), superAdminOnly'
    );
    expect(scrapeProviderBlock).toContain(
      'app.post("/api/super-admin/browserless/bql-test", authMiddleware, requirePermission("integrations.write"), superAdminOnly'
    );
    expect(scrapeProviderBlock).toContain(
      'app.post("/api/super-admin/zyte/test", authMiddleware, requirePermission("integrations.write"), superAdminOnly'
    );
  });
});
