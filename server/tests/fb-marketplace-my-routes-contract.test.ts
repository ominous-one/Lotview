import { readFileSync } from "fs";
import { resolve } from "path";

describe("FB Marketplace my-route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const myMarketplaceBlock = routesSource.match(
    /\/\/ ============ SALESPERSON FB MARKETPLACE ENDPOINTS ============[\s\S]*?\/\/ ====== CHROME EXTENSION API ROUTES ======/
  )?.[0];

  it("requires explicit permissions for account, stats, queue, and listing routes", () => {
    expect(myMarketplaceBlock).toBeDefined();

    for (const route of [
      'app.get("/api/fb-marketplace/my-accounts", authMiddleware, requirePermission("integrations.read"), requireDealership',
      'app.post("/api/fb-marketplace/my-accounts", authMiddleware, requirePermission("integrations.write"), requireDealership',
      'app.delete("/api/fb-marketplace/my-accounts/:accountId", authMiddleware, requirePermission("integrations.write"), requireDealership',
      'app.post("/api/fb-marketplace/my-accounts/:accountId/auth", authMiddleware, requirePermission("integrations.write"), requireDealership',
      'app.post("/api/fb-marketplace/my-accounts/:accountId/verify", authMiddleware, requirePermission("integrations.write"), requireDealership',
      'app.get("/api/fb-marketplace/my-stats", authMiddleware, requirePermission("messages.read"), requireDealership',
      'app.post("/api/fb-marketplace/my-queue", authMiddleware, requirePermission("messages.write"), requireDealership',
      'app.get("/api/fb-marketplace/my-queue", authMiddleware, requirePermission("messages.read"), requireDealership',
      'app.get("/api/fb-marketplace/my-listings", authMiddleware, requirePermission("messages.read"), requireDealership',
    ]) {
      expect(myMarketplaceBlock).toContain(route);
    }
  });

  it("scopes user-owned account checks to the resolved dealership before sensitive actions", () => {
    expect(myMarketplaceBlock).toBeDefined();
    expect(myMarketplaceBlock).toContain("const dealershipId = req.dealershipId!");

    const dealershipScopedAccountChecks = myMarketplaceBlock?.match(
      /eq\(fbMarketplaceAccounts\.dealershipId, dealershipId\)/g
    ) ?? [];

    expect(dealershipScopedAccountChecks.length).toBeGreaterThanOrEqual(7);
    expect(myMarketplaceBlock).toContain("service.createAccount(accountName, facebookEmail, userId, accountSlot)");
    expect(myMarketplaceBlock).toContain("service.initiateAuth(accountId)");
    expect(myMarketplaceBlock).toContain("service.verifyAndSaveSession(accountId)");
    expect(myMarketplaceBlock).toContain("service.queueVehicleForPosting(vehicleId, priority || 5, { userId, accountId })");
  });
});
