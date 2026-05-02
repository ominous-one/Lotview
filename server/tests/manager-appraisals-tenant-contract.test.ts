import { readFileSync } from "fs";
import { resolve } from "path";

describe("manager appraisal tenant route contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const appraisalsBlock = routesSource.match(
    /\/\/ ===== VEHICLE APPRAISAL ROUTES[\s\S]*?\/\/ ===== REMARKETING ROUTES/
  )?.[0];

  it("requires dealership context before every manager appraisal route", () => {
    for (const route of [
      'app.get("/api/manager/appraisals", authMiddleware, requireRole("manager"), requireDealership',
      'app.get("/api/manager/appraisals/stats", authMiddleware, requireRole("manager"), requireDealership',
      'app.get("/api/manager/appraisals/missed-stats", authMiddleware, requireRole("manager"), requireDealership',
      'app.get("/api/manager/appraisals/accuracy-report", authMiddleware, requireRole("manager"), requireDealership',
      'app.get("/api/manager/appraisals/vin/:vin", authMiddleware, requireRole("manager"), requireDealership',
      'app.get("/api/manager/appraisals/:id", authMiddleware, requireRole("manager"), requireDealership',
      'app.post("/api/manager/appraisals", authMiddleware, requireRole("manager"), requireDealership',
      'app.patch("/api/manager/appraisals/:id", authMiddleware, requireRole("manager"), requireDealership',
      'app.delete("/api/manager/appraisals/:id", authMiddleware, requireRole("manager"), requireDealership',
    ]) {
      expect(routesSource).toContain(route);
    }
  });

  it("uses the resolved dealership for appraisal reads and reports", () => {
    expect(appraisalsBlock).toBeDefined();
    expect(appraisalsBlock).toContain("const dealershipId = req.dealershipId!");
    expect(appraisalsBlock).toContain("storage.getVehicleAppraisals(dealershipId");
    expect(appraisalsBlock).toContain("storage.getAppraisalStats(dealershipId)");
    expect(appraisalsBlock).toContain("storage.getMissedTradesStats(dealershipId)");
    expect(appraisalsBlock).toContain("storage.getAppraisalAccuracyReport(dealershipId)");
    expect(appraisalsBlock).toContain("storage.getVehicleAppraisalByVin(vin, dealershipId)");
    expect(appraisalsBlock).toContain("storage.getVehicleAppraisalById(id, dealershipId)");
  });

  it("uses the resolved dealership for appraisal writes and strips request-owned identity fields", () => {
    expect(appraisalsBlock).toBeDefined();
    expect(appraisalsBlock).toContain("dealershipId,");
    expect(appraisalsBlock).toContain("createdBy: userId");
    expect(appraisalsBlock).toContain("const { dealershipId: _, id: __, ...updates } = req.body");
    expect(appraisalsBlock).toContain("storage.updateVehicleAppraisal(id, dealershipId, updates)");
    expect(appraisalsBlock).toContain("storage.deleteVehicleAppraisal(id, dealershipId)");
  });
});
