import { readFileSync } from "fs";
import { resolve } from "path";

describe("remarketing tenant route contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const remarketingBlock = routesSource.match(
    /\/\/ ===== REMARKETING ROUTES[\s\S]*?\/\/ ===== PBS DMS INTEGRATION ROUTES/
  )?.[0];
  const storageSource = readFileSync(resolve(process.cwd(), "server/storage.ts"), "utf8");
  const remarketingStorageBlock = storageSource.match(
    /\/\/ ====== REMARKETING VEHICLES[\s\S]*?\/\/ ====== PBS DMS INTEGRATION/
  )?.[0];

  it("requires dealership context before every remarketing route", () => {
    for (const route of [
      'app.get("/api/remarketing/vehicles", authMiddleware, requireRole("master"), requireDealership',
      'app.post("/api/remarketing/vehicles", authMiddleware, requireRole("master"), requireDealership',
      'app.patch("/api/remarketing/vehicles/:id", authMiddleware, requireRole("master"), requireDealership',
      'app.delete("/api/remarketing/vehicles/:id", authMiddleware, requireRole("master"), requireDealership',
    ]) {
      expect(routesSource).toContain(route);
    }
  });

  it("uses the resolved dealership for remarketing route reads and writes", () => {
    expect(remarketingBlock).toBeDefined();
    expect(remarketingBlock).toContain("const dealershipId = req.dealershipId!");
    expect(remarketingBlock).toContain("storage.getRemarketingVehicles(dealershipId)");
    expect(remarketingBlock).toContain("storage.getVehicleById(vehicleId, dealershipId)");
    expect(remarketingBlock).toContain("storage.getRemarketingVehicleCount(dealershipId)");
    expect(remarketingBlock).toContain("storage.addRemarketingVehicle({ dealershipId, vehicleId, budgetPriority, isActive: true })");
    expect(remarketingBlock).toContain("storage.updateRemarketingVehicle(id, dealershipId");
    expect(remarketingBlock).toContain("storage.removeRemarketingVehicle(id, dealershipId)");
  });

  it("rejects malformed remarketing vehicle ids before scoped mutations", () => {
    expect(remarketingBlock).toBeDefined();
    expect(routesSource).toContain("function requireRemarketingVehicleIdParam(req: Request, res: Response): number | null");
    expect(routesSource).toContain('res.status(400).json({ error: "Remarketing vehicle id must be a positive integer" })');
    expect(remarketingBlock?.match(/requireRemarketingVehicleIdParam\(req, res\)/g)).toHaveLength(2);
    expect(remarketingBlock).not.toContain("parseInt(req.params.id");
  });

  it("keeps remarketing storage scoped to dealership boundaries", () => {
    expect(remarketingStorageBlock).toBeDefined();
    expect(remarketingStorageBlock).toContain("eq(remarketingVehicles.dealershipId, dealershipId)");
    expect(remarketingStorageBlock).toContain("eq(remarketingVehicles.isActive, true)");
    expect(remarketingStorageBlock).toContain("dealershipId is required when adding a remarketing vehicle");
  });
});
