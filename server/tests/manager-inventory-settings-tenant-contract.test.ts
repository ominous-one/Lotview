import { readFileSync } from "fs";
import { resolve } from "path";

describe("manager inventory and settings tenant route contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const managerSettingsBlock = routesSource.match(
    /\/\/ Get unique makes from market listings[\s\S]*?\/\/ Trigger market data aggregation from all sources/
  )?.[0];

  it("requires dealership context before manager inventory autocomplete reads", () => {
    for (const route of [
      'app.get("/api/inventory/makes", authMiddleware, requireRole("manager"), requireDealership',
      'app.get("/api/inventory/models", authMiddleware, requireRole("manager"), requireDealership',
      'app.get("/api/inventory/trims", authMiddleware, requireRole("manager"), requireDealership',
    ]) {
      expect(routesSource).toContain(route);
    }
  });

  it("requires dealership context before manager settings and branding reads or writes", () => {
    for (const route of [
      'app.get("/api/manager/settings", authMiddleware, requireRole("manager"), requireDealership',
      'app.post("/api/manager/settings", authMiddleware, requireRole("manager"), requireDealership',
      'app.get("/api/manager/branding", authMiddleware, requireRole("manager"), requireDealership',
      'app.post("/api/manager/branding", authMiddleware, requireRole("manager"), requireDealership',
    ]) {
      expect(routesSource).toContain(route);
    }
  });

  it("uses the resolved dealership for inventory/settings/branding storage calls", () => {
    expect(managerSettingsBlock).toBeDefined();
    expect(managerSettingsBlock).toContain("const dealershipId = req.dealershipId!");
    expect(managerSettingsBlock).toContain("storage.getMarketListings(dealershipId");
    expect(managerSettingsBlock).toContain("storage.getManagerSettings(userId, dealershipId)");
    expect(managerSettingsBlock).toContain("storage.updateManagerSettings(userId, dealershipId");
    expect(managerSettingsBlock).toContain("storage.getDealershipBranding(dealershipId)");
    expect(managerSettingsBlock).toContain("storage.upsertDealershipBranding");
  });
});
