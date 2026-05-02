import { readFileSync } from "fs";
import { resolve } from "path";

describe("manager inventory analysis tenant route contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const inventoryAnalysisBlock = routesSource.match(
    /\/\/ Inventory Analysis - Get all vehicles with market comparison data[\s\S]*?\/\/ Lookup colors for a vehicle from CarGurus/
  )?.[0];
  const apifyMarketPricingBlock = routesSource.match(
    /\/\/ Get Apify market pricing for a specific vehicle[\s\S]*?\/\/ ===== VEHICLE APPRAISAL ROUTES/
  )?.[0];

  it("requires dealership context before manager inventory analysis reads or refreshes", () => {
    for (const route of [
      'app.get("/api/manager/inventory-analysis", authMiddleware, requireRole("manager"), requireDealership',
      'app.post("/api/manager/inventory-analysis/refresh", authMiddleware, requireRole("manager"), requireDealership',
    ]) {
      expect(routesSource).toContain(route);
    }
  });

  it("requires dealership context before APIFY market-pricing access", () => {
    expect(routesSource).toContain(
      'app.post("/api/manager/apify-market-pricing", authMiddleware, requireRole("manager"), requireDealership'
    );
  });

  it("uses the resolved dealership for inventory analysis storage and aggregation calls", () => {
    expect(inventoryAnalysisBlock).toBeDefined();
    expect(inventoryAnalysisBlock).toContain("const dealershipId = req.dealershipId!");
    expect(inventoryAnalysisBlock).toContain("storage.getVehicles(dealershipId");
    expect(inventoryAnalysisBlock).toContain("storage.getManagerSettings(authReq.user.id, dealershipId)");
    expect(inventoryAnalysisBlock).toContain("storage.getLatestMarketSnapshotDate(dealershipId)");
    expect(inventoryAnalysisBlock).toContain("storage.getMarketListings(dealershipId");
    expect(inventoryAnalysisBlock).toContain("dealershipId");
  });

  it("uses the resolved dealership for APIFY service selection and pricing requests", () => {
    expect(apifyMarketPricingBlock).toBeDefined();
    expect(apifyMarketPricingBlock).toContain("const dealershipId = req.dealershipId!");
    expect(apifyMarketPricingBlock).toContain("getApifyServiceForDealership(dealershipId)");
    expect(apifyMarketPricingBlock).toContain("dealershipId");
  });
});
