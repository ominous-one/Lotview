import { readFileSync } from "fs";
import { resolve } from "path";

describe("super-admin FB Marketplace route RBAC contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const superAdminMarketplaceBlock = routesSource.match(
    /\/\/ ============ FACEBOOK MARKETPLACE AUTOMATION ============[\s\S]*?\/\/ ============ SALESPERSON FB MARKETPLACE ENDPOINTS ============/
  )?.[0];

  it("requires integration permissions before reading or changing marketplace settings and accounts", () => {
    expect(superAdminMarketplaceBlock).toBeDefined();

    for (const route of [
      'app.get("/api/super-admin/fb-marketplace/settings/:dealershipId", authMiddleware, requirePermission("integrations.read"), superAdminOnly',
      'app.put("/api/super-admin/fb-marketplace/settings/:dealershipId", authMiddleware, requirePermission("integrations.write"), superAdminOnly',
      'app.get("/api/super-admin/fb-marketplace/accounts/:dealershipId", authMiddleware, requirePermission("integrations.read"), superAdminOnly',
      'app.post("/api/super-admin/fb-marketplace/accounts/:dealershipId", authMiddleware, requirePermission("integrations.write"), superAdminOnly',
      'app.delete("/api/super-admin/fb-marketplace/accounts/:accountId", authMiddleware, requirePermission("integrations.write"), superAdminOnly',
      'app.post("/api/super-admin/fb-marketplace/accounts/:accountId/auth", authMiddleware, requirePermission("integrations.write"), superAdminOnly',
      'app.post("/api/super-admin/fb-marketplace/accounts/:accountId/verify", authMiddleware, requirePermission("integrations.write"), superAdminOnly',
    ]) {
      expect(superAdminMarketplaceBlock).toContain(route);
    }
  });

  it("requires message permissions before reading or mutating marketplace posting surfaces", () => {
    expect(superAdminMarketplaceBlock).toBeDefined();

    for (const route of [
      'app.get("/api/super-admin/fb-marketplace/stats/:dealershipId", authMiddleware, requirePermission("messages.read"), superAdminOnly',
      'app.get("/api/super-admin/fb-marketplace/listings/:dealershipId", authMiddleware, requirePermission("messages.read"), superAdminOnly',
      'app.post("/api/super-admin/fb-marketplace/queue/:dealershipId", authMiddleware, requirePermission("messages.write"), superAdminOnly',
      'app.get("/api/super-admin/fb-marketplace/queue/:dealershipId", authMiddleware, requirePermission("messages.read"), superAdminOnly',
      'app.get("/api/super-admin/fb-marketplace/activity/:dealershipId", authMiddleware, requirePermission("messages.read"), superAdminOnly',
      'app.post("/api/super-admin/fb-marketplace/process-queue/:dealershipId", authMiddleware, requirePermission("messages.write"), superAdminOnly',
    ]) {
      expect(superAdminMarketplaceBlock).toContain(route);
    }
  });

  it("rate-limits sensitive auth and queue execution routes", () => {
    expect(superAdminMarketplaceBlock).toBeDefined();

    expect(superAdminMarketplaceBlock).toContain(
      'app.post("/api/super-admin/fb-marketplace/accounts/:accountId/auth", authMiddleware, requirePermission("integrations.write"), superAdminOnly, sensitiveLimiter'
    );
    expect(superAdminMarketplaceBlock).toContain(
      'app.post("/api/super-admin/fb-marketplace/accounts/:accountId/verify", authMiddleware, requirePermission("integrations.write"), superAdminOnly, sensitiveLimiter'
    );
    expect(superAdminMarketplaceBlock).toContain(
      'app.post("/api/super-admin/fb-marketplace/process-queue/:dealershipId", authMiddleware, requirePermission("messages.write"), superAdminOnly, sensitiveLimiter'
    );
  });

  it("does not leave super-admin marketplace routes guarded only by superAdminOnly", () => {
    expect(superAdminMarketplaceBlock).toBeDefined();

    const routeCount = superAdminMarketplaceBlock?.match(
      /app\.(get|post|put|delete)\("\/api\/super-admin\/fb-marketplace/g
    )?.length ?? 0;

    expect(routeCount).toBe(13);
    expect(superAdminMarketplaceBlock).not.toContain("authMiddleware, superAdminOnly");
  });

  it("strips client-supplied ownership fields from marketplace settings writes", () => {
    expect(superAdminMarketplaceBlock).toBeDefined();

    [
      "const settingsData = req.body",
      "dealershipId,\n          ...settingsData",
    ].forEach((unsafePattern) => expect(superAdminMarketplaceBlock).not.toContain(unsafePattern));

    [
      "const settingsData = stripTenantOwnershipFields((req.body ?? {}) as Record<string, unknown>)",
      ".set({ ...settingsData, updatedAt: new Date() })",
    ].forEach((safePattern) => expect(superAdminMarketplaceBlock).toContain(safePattern));

    expect(superAdminMarketplaceBlock).toMatch(/\.\.\.settingsData,\s+dealershipId/);
  });

  it("scopes listing and queue joins to the requested dealership", () => {
    expect(superAdminMarketplaceBlock).toBeDefined();

    [
      ".leftJoin(vehicles, eq(fbMarketplaceListings.vehicleId, vehicles.id))",
      ".leftJoin(fbMarketplaceAccounts, eq(fbMarketplaceListings.accountId, fbMarketplaceAccounts.id))",
      ".leftJoin(vehicles, eq(fbMarketplaceQueue.vehicleId, vehicles.id))",
      ".leftJoin(fbMarketplaceAccounts, eq(fbMarketplaceQueue.accountId, fbMarketplaceAccounts.id))",
    ].forEach((unsafePattern) => expect(superAdminMarketplaceBlock).not.toContain(unsafePattern));

    [
      ".leftJoin(vehicles, and(eq(fbMarketplaceListings.vehicleId, vehicles.id), eq(vehicles.dealershipId, dealershipId)))",
      ".leftJoin(fbMarketplaceAccounts, and(eq(fbMarketplaceListings.accountId, fbMarketplaceAccounts.id), eq(fbMarketplaceAccounts.dealershipId, dealershipId)))",
      ".leftJoin(vehicles, and(eq(fbMarketplaceQueue.vehicleId, vehicles.id), eq(vehicles.dealershipId, dealershipId)))",
      ".leftJoin(fbMarketplaceAccounts, and(eq(fbMarketplaceQueue.accountId, fbMarketplaceAccounts.id), eq(fbMarketplaceAccounts.dealershipId, dealershipId)))",
    ].forEach((safePattern) => expect(superAdminMarketplaceBlock).toContain(safePattern));
  });
});
