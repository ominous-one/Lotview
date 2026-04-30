import { readFileSync } from "fs";
import { resolve } from "path";

describe("legacy vehicle route RBAC contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const legacyVehicleBlock = routesSource.match(
    /\/\/ Create vehicle \(master only\)[\s\S]*?\/\/ Force re-scrape a specific vehicle/
  )?.[0];
  const externalVehicleImportBlock = routesSource.match(
    /\/\/ Import vehicles from external sources \(n8n\)[\s\S]*?\/\/ Get vehicles via external API/
  )?.[0];
  const legacyVehicleActionBlock = routesSource.match(
    /\/\/ Generate video for vehicle using Gemini Veo[\s\S]*?\/\/ ===== VIEW TRACKING ROUTES =====/
  )?.[0];

  it("requires explicit inventory write permission for legacy vehicle mutations", () => {
    expect(legacyVehicleBlock).toBeDefined();

    for (const route of [
      'app.post("/api/vehicles", authMiddleware, requirePermission("inventory.write"), requireRole("master"), requireDealership',
      'app.patch("/api/vehicles/:id", authMiddleware, requirePermission("inventory.write"), requireRole("master"), requireDealership',
      'app.post("/api/vehicles/:id/soft-delete", authMiddleware, requirePermission("inventory.write"), requireRole("manager", "admin", "master", "super_admin"), requireDealership',
      'app.patch("/api/vehicles/:id/vdp-content", authMiddleware, requirePermission("inventory.write"), requireRole("manager", "admin", "master", "super_admin"), requireDealership',
      'app.delete("/api/vehicles/:id", authMiddleware, requirePermission("inventory.write"), requireRole("master"), requireDealership',
    ]) {
      expect(legacyVehicleBlock).toContain(route);
    }
  });

  it("uses the resolved dealership context for legacy vehicle mutation storage access", () => {
    expect(legacyVehicleBlock).toBeDefined();
    expect(legacyVehicleBlock).toContain("const dealershipId = req.dealershipId!");
    expect(legacyVehicleBlock).toContain("vehicleCreateRequestSchema.safeParse(req.body)");
    expect(legacyVehicleBlock).toContain("vehicleUpdateRequestSchema.safeParse(req.body)");
    expect(legacyVehicleBlock).toContain("normalizeVehicleWriteVIN(parsed.data)");
    expect(legacyVehicleBlock).toContain("withNormalizedStockNumber(vinGuard.data)");
    expect(legacyVehicleBlock).toContain("findActiveStockNumberConflict(existingVehicles, vehicleInput.normalizedStockNumber)");
    expect(legacyVehicleBlock).toContain("findActiveStockNumberConflict(");
    expect(legacyVehicleBlock).toContain("updateData.normalizedStockNumber");
    expect(legacyVehicleBlock).toContain("storage.createVehicle(withResolvedVehicleDealership(vehicleInput, dealershipId))");
    expect(legacyVehicleBlock).not.toContain("parsedUpdateData");
    expect(legacyVehicleBlock).toContain("storage.updateVehicle(id, updateData, dealershipId)");
    expect(legacyVehicleBlock).toContain("storage.deleteVehicle(id, dealershipId)");
    expect(legacyVehicleBlock).toContain("eq(vehicles.dealershipId, dealershipId)");
  });

  it("requires external imports to store only through deduplication", () => {
    expect(externalVehicleImportBlock).toBeDefined();
    expect(externalVehicleImportBlock).toContain("normalizeVehicleWriteVIN({ vin: v.vin })");
    expect(externalVehicleImportBlock).toContain("if (hasVehicleVINWriteError(vinGuard))");
    expect(externalVehicleImportBlock).toContain("const normalizedVin = vinGuard.data.vin");
    expect(externalVehicleImportBlock).toContain("storeExternalVehicleImport({");
    expect(externalVehicleImportBlock).toContain('isDedupEnabled: (id) => isEnabled("vehicle_deduplication", id)');
    expect(externalVehicleImportBlock).toContain("deduplicate: deduplicateAndStore");
    expect(externalVehicleImportBlock).not.toContain("storage.createVehicle(vehiclePayload)");
    expect(externalVehicleImportBlock).not.toContain("storage.updateVehicle(existingVehicle.id, vehiclePayload, dealershipId)");
    expect(externalVehicleImportBlock).not.toContain("falling back");
  });

  it("requires explicit permissions for legacy vehicle AI, scraper, and Carfax action routes", () => {
    expect(legacyVehicleActionBlock).toBeDefined();

    for (const route of [
      'app.post("/api/vehicles/:id/generate-video", authMiddleware, requirePermission("ai.use"), requireRole("master"), requireDealership',
      'app.post("/api/vehicles/:id/generate-description", authMiddleware, requirePermission("ai.use"), requirePermission("inventory.write"), requireRole("master"), requireDealership',
      'app.post("/api/vehicles/generate-descriptions", authMiddleware, requirePermission("ai.use"), requirePermission("inventory.write"), requireRole("master"), requireDealership',
      'app.post("/api/vehicles/:id/force-rescrape", authMiddleware, requirePermission("integrations.write"), requireRole("manager"), requireDealership',
      'app.post("/api/vehicles/batch-carfax-update", authMiddleware, requirePermission("integrations.write"), requirePermission("inventory.write"), requireRole("manager"), requireDealership',
    ]) {
      expect(legacyVehicleActionBlock).toContain(route);
    }
  });
});
