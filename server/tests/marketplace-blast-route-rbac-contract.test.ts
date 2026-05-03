import { readFileSync } from "fs";
import { resolve } from "path";

describe("legacy Marketplace Blast route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const marketplaceBlastBlock = routesSource.match(
    /\/\/ ==================== FACEBOOK ACCOUNTS FOR MARKETPLACE BLAST ====================[\s\S]*?\/\/ ============ FACEBOOK MARKETPLACE AUTOMATION ============/
  )?.[0];

  it("requires explicit permissions for Marketplace Blast accounts and templates", () => {
    expect(marketplaceBlastBlock).toBeDefined();

    for (const route of [
      'app.get("/api/facebook-accounts", authMiddleware, requirePermission("integrations.read"), requireRole',
      'app.post("/api/facebook-accounts", authMiddleware, requirePermission("integrations.write"), requireRole',
      'app.get("/api/ad-templates", authMiddleware, requirePermission("messages.read"), requireRole',
      'app.get("/api/ad-templates/shared", authMiddleware, requirePermission("messages.read"), requireRole',
      'app.post("/api/ad-templates", authMiddleware, requirePermission("messages.write"), requireRole',
      'app.post("/api/ad-templates/shared", authMiddleware, requirePermission("messages.write"), requireRole',
      'app.post("/api/ad-templates/:id/fork", authMiddleware, requirePermission("messages.write"), requireRole',
      'app.patch("/api/ad-templates/:id", authMiddleware, requirePermission("messages.write"), requireRole',
      'app.patch("/api/ad-templates/shared/:id", authMiddleware, requirePermission("messages.write"), requireRole',
      'app.delete("/api/ad-templates/:id", authMiddleware, requirePermission("messages.write"), requireRole',
      'app.delete("/api/ad-templates/shared/:id", authMiddleware, requirePermission("messages.write"), requireRole',
    ]) {
      expect(marketplaceBlastBlock).toContain(route);
    }
  });

  it("requires explicit permissions for Marketplace Blast queue, AI generation, and image routes", () => {
    expect(marketplaceBlastBlock).toBeDefined();

    for (const route of [
      'app.get("/api/marketplace-blast/queue", authMiddleware, requirePermission("messages.read"), requireRole',
      'app.get("/api/marketplace-blast/vehicle/:vehicleId", authMiddleware, requirePermission("messages.read"), requireRole',
      'app.post("/api/marketplace-blast/enhance-description", sensitiveLimiter, authMiddleware, requirePermission("ai.use"), requirePermission("messages.write"), requireRole',
      'app.post("/api/marketplace-blast/generate/:vehicleId", authMiddleware, requirePermission("ai.use"), requirePermission("messages.write"), requireRole',
      'app.post("/api/marketplace-blast/generate-bulk", authMiddleware, requirePermission("ai.use"), requirePermission("messages.write"), requireRole',
      'app.post("/api/marketplace-blast/mark-posted/:vehicleId", authMiddleware, requirePermission("messages.write"), requireRole',
      'app.get("/api/marketplace-blast/photos/:vehicleId", authMiddleware, requirePermission("messages.read"), requireRole',
      'app.get("/api/inventory/download-images/:vehicleId", authMiddleware, requirePermission("inventory.read"), requireRole',
      'app.get("/api/inventory/download-all-images", authMiddleware, requirePermission("inventory.read"), requireRole',
    ]) {
      expect(marketplaceBlastBlock).toContain(route);
    }
  });

  it("keeps dealership context before dealership-scoped storage access", () => {
    expect(marketplaceBlastBlock).toBeDefined();

    const dealershipGuards = marketplaceBlastBlock?.match(/requireDealership/g) ?? [];
    expect(dealershipGuards.length).toBeGreaterThanOrEqual(20);
    expect(marketplaceBlastBlock).toContain("const dealershipId = req.dealershipId!");
    expect(marketplaceBlastBlock).toContain("storage.getFacebookAccountsByUser(userId, dealershipId)");
    expect(marketplaceBlastBlock).toContain("storage.createFacebookAccount({");
    expect(marketplaceBlastBlock).toContain("dealershipId,");
    expect(marketplaceBlastBlock).toContain("storage.getAdTemplatesForUser(userId, dealershipId)");
    expect(marketplaceBlastBlock).toContain("storage.getSharedAdTemplates(dealershipId)");
    expect(marketplaceBlastBlock).toContain("storage.getVehicles(dealershipId, 1000, 0)");
    expect(marketplaceBlastBlock).toContain("storage.getVehicleById(vehicleId, dealershipId)");
    expect(marketplaceBlastBlock).toContain("storage.updateVehicle(vehicleId, {");
  });

  it("fails closed on malformed ad-template identifiers and queue limits before storage access", () => {
    expect(marketplaceBlastBlock).toBeDefined();

    for (const guard of [
      "function requireMarketplaceAdTemplateIdParam(req: Request, res: Response): number | null",
      "Marketplace ad template id must be a positive integer",
      "const templateId = requireMarketplaceAdTemplateIdParam(req, res)",
      'const parsedLimit = parseOptionalPositiveIntegerQueryParam(req.query.limit, res, "limit")',
    ]) {
      expect(routesSource).toContain(guard);
    }

    for (const unsafeParse of [
      "const templateId = parseInt(req.params.id)",
      "const limit = parseInt(req.query.limit as string) || 50",
    ]) {
      expect(marketplaceBlastBlock).not.toContain(unsafeParse);
    }
  });

  it("fails closed on malformed Marketplace vehicle identifiers and photo limits before storage access", () => {
    expect(marketplaceBlastBlock).toBeDefined();

    for (const guard of [
      "function requireMarketplaceVehicleIdParam(req: Request, res: Response): number | null",
      "Marketplace vehicle id must be a positive integer",
      "const vehicleId = requireMarketplaceVehicleIdParam(req, res)",
      'const parsedLimit = parseOptionalPositiveIntegerQueryParam(req.query.limit, res, "limit")',
      "const imagesPerVehicle = Math.min(parsedLimit ?? 5, 10)",
    ]) {
      expect(routesSource).toContain(guard);
    }

    for (const unsafeParse of [
      "const vehicleId = parseInt(req.params.vehicleId)",
      "const limit = parseInt(req.query.limit as string) || 10",
      "const imagesPerVehicle = Math.min(parseInt(req.query.limit as string) || 5, 10)",
    ]) {
      expect(marketplaceBlastBlock).not.toContain(unsafeParse);
    }
  });
});
