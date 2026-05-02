import { readFileSync } from "fs";
import { resolve } from "path";

describe("PBS parts tenant route contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const pbsPartsBlock = routesSource.match(
    /\/\/ ===== PBS PARTS MODULE[\s\S]*?\/\/ Get shops/
  )?.[0];

  it("requires dealership context before every authenticated PBS parts route", () => {
    for (const route of [
      'app.get("/api/pbs/parts/inventory/search", authMiddleware, requireRole("master", "service_manager", "parts_manager"), requireDealership',
      'app.get("/api/pbs/parts/inventory/:partNumber", authMiddleware, requireRole("master", "service_manager", "parts_manager"), requireDealership',
      'app.get("/api/pbs/parts/orders/:orderId", authMiddleware, requireRole("master", "parts_manager"), requireDealership',
      'app.get("/api/pbs/parts/purchase-orders/:purchaseOrderId", authMiddleware, requireRole("master", "parts_manager"), requireDealership',
      'app.get("/api/pbs/parts/tire-storage", authMiddleware, requireRole("master", "service_manager", "parts_manager"), requireDealership',
    ]) {
      expect(routesSource).toContain(route);
    }
  });

  it("uses the resolved dealership before constructing PBS parts calls", () => {
    expect(pbsPartsBlock).toBeDefined();
    expect(pbsPartsBlock).toContain("const dealershipId = req.dealershipId!");
    expect(pbsPartsBlock).toContain("createPbsApiService(dealershipId)");
    expect(pbsPartsBlock).toContain("pbsService.partsInventorySearch");
    expect(pbsPartsBlock).toContain("pbsService.partsInventoryGet");
    expect(pbsPartsBlock).toContain("pbsService.partsOrderGet");
    expect(pbsPartsBlock).toContain("pbsService.purchaseOrderGet");
    expect(pbsPartsBlock).toContain("pbsService.tireStorageGet");
  });
});
