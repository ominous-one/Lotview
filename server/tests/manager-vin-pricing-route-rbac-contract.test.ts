import { readFileSync } from "fs";
import { resolve } from "path";

describe("manager VIN and pricing route RBAC contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const managerRoutesBlock = routesSource.match(
    /\/\/ ===== SALES MANAGER ROUTES =====[\s\S]*?\/\/ Enhanced market analysis with percentiles, competitors, trends, and AI insights/
  )?.[0];

  it("requires inventory write permission and dealership context for manager VIN appraisal decode", () => {
    expect(managerRoutesBlock).toBeDefined();
    expect(managerRoutesBlock).toContain(
      'app.post("/api/manager/decode-vin", authMiddleware, requirePermission("inventory.write"), requireRole("manager"), requireDealership'
    );
    expect(managerRoutesBlock).toContain("const dealershipId = requireResolvedDealershipId(req);");
    expect(managerRoutesBlock).toContain("storage.getVehicleAppraisalByVin(result.vin, dealershipId)");
  });

  it("requires inventory write permission and dealership context for manager market-pricing appraisal analysis", () => {
    expect(managerRoutesBlock).toBeDefined();
    expect(managerRoutesBlock).toContain(
      'app.post("/api/manager/market-pricing", authMiddleware, requirePermission("inventory.write"), requireRole("manager"), requireDealership'
    );
    expect(managerRoutesBlock).toContain("const dealershipId = req.dealershipId!;");
    expect(managerRoutesBlock).toContain("storage.getMarketListings(dealershipId");
    expect(managerRoutesBlock).toContain("storage.getVehicleAppraisalByVin(vin, dealershipId)");
  });
});
