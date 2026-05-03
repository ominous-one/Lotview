import { readFileSync } from "fs";
import { resolve } from "path";

describe("scrape source route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const storageSource = readFileSync(resolve(process.cwd(), "server/storage.ts"), "utf8");

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

  it("does not partially parse super-admin scrape source ids", () => {
    const scrapeSourceBlock = routesSource.match(
      /\/\/ ===== SUPER ADMIN SCRAPE SOURCES ROUTES =====[\s\S]*?\/\/ ===== BROWSERLESS SCRAPING ROUTES =====/
    )?.[0];

    expect(scrapeSourceBlock).toBeDefined();
    expect(routesSource).toContain("function requireScrapeSourceIdParam(req: Request, res: Response): number | null");
    expect(routesSource).toContain('res.status(400).json({ error: "Scrape source id must be a positive integer" });');
    expect(scrapeSourceBlock).toContain("const id = requireScrapeSourceIdParam(req, res)");
    expect(scrapeSourceBlock).toContain("const parsedFilterGroupId =");
    expect(scrapeSourceBlock).toContain("parsePositiveIntegerId(filterGroupId)");
    expect(scrapeSourceBlock).toContain('return res.status(400).json({ error: "filterGroupId must be a positive integer" });');
    expect(scrapeSourceBlock).not.toContain("parseInt(req.params.id)");
    expect(scrapeSourceBlock).not.toContain("Number.parseInt(req.params.id");
    expect(scrapeSourceBlock).not.toContain("filterGroupId ? parseInt(filterGroupId) : null");
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

  it("requires auth, integration permissions, and dealership context for manual scraper diagnostics", () => {
    const scraperRoutesBlock = routesSource.match(
      /\/\/ ===== SCRAPER ROUTES =====[\s\S]*?\/\/ ===== CHAT ROUTES =====/
    )?.[0];

    expect(scraperRoutesBlock).toBeDefined();
    expect(scraperRoutesBlock).toContain(
      'app.post("/api/scraper/test-single-vehicle", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership, sensitiveLimiter'
    );
    expect(scraperRoutesBlock).toContain(
      'app.post("/api/scraper/sync", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership, sensitiveLimiter'
    );
    expect(scraperRoutesBlock).toContain(
      'app.get("/api/scraper/test-badges", authMiddleware, requirePermission("integrations.read"), requireRole("master"), requireDealership'
    );
    expect(scraperRoutesBlock).toContain("const dealershipId = req.dealershipId!;");
    expect(scraperRoutesBlock).toContain("triggerManualSync(dealershipId)");
    expect(scraperRoutesBlock).not.toContain("req.body?.dealershipId");
  });

  it("strips immutable tenant ownership fields before dealership scrape source updates", () => {
    expect(routesSource).not.toContain("storage.updateScrapeSource(id, dealershipId, req.body)");
    expect(routesSource).toContain("storage.updateScrapeSource(id, dealershipId, updates)");
    expect(storageSource).toContain(".set({ ...stripTenantOwnershipFields(source), updatedAt: new Date() })");
  });
});
