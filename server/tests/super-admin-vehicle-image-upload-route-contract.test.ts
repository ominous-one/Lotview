import { readFileSync } from "fs";
import { resolve } from "path";

describe("super-admin vehicle image upload route contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const imageUploadBlock = routesSource.match(
    /\/\/ Upload vehicle images to Object Storage[\s\S]*?\/\/ ===== SUPER ADMIN ONBOARDING ROUTES =====/
  )?.[0];

  it("requires inventory write permission before uploading vehicle images", () => {
    expect(imageUploadBlock).toBeDefined();

    expect(imageUploadBlock).toContain(
      'app.post("/api/super-admin/upload-vehicle-images", authMiddleware, requirePermission("inventory.write"), superAdminOnly'
    );
  });

  it("strictly parses body dealership and vehicle identifiers before selecting inventory", () => {
    expect(imageUploadBlock).toBeDefined();

    expect(imageUploadBlock).toContain(
      'const parsedDealershipId = parseOptionalPositiveIntegerBodyValue(dealershipId, res, "dealershipId");'
    );
    expect(imageUploadBlock).toContain("if (parsedDealershipId === null) return;");
    expect(imageUploadBlock).toContain(
      'const parsedVehicleId = parseOptionalPositiveIntegerBodyValue(vehicleId, res, "vehicleId");'
    );
    expect(imageUploadBlock).toContain("if (parsedVehicleId === null) return;");
    expect(imageUploadBlock).toContain("const targetDealershipId = parsedDealershipId ?? req.dealershipId");
    expect(imageUploadBlock).toContain("const uploadAll = all === true");
    expect(imageUploadBlock).toContain('return res.status(400).json({ error: "Dealership context required" })');
    expect(imageUploadBlock).toContain("await storage.getVehicles(targetDealershipId, 500, 0)");
    expect(imageUploadBlock).toContain("const vehicle = await storage.getVehicleById(parsedVehicleId, targetDealershipId);");
    expect(imageUploadBlock).not.toContain("const targetDealershipId = dealershipId || req.dealershipId");
    expect(imageUploadBlock).not.toContain("eq(vehicles.id, vehicleId)");
  });

  it("keeps background local image updates scoped to the selected vehicle dealership", () => {
    expect(imageUploadBlock).toBeDefined();

    expect(imageUploadBlock).toContain(
      "and(eq(vehicles.id, vehicle.id), eq(vehicles.dealershipId, vehicle.dealershipId))"
    );
  });
});
