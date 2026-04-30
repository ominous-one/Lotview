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

  it("requires dealership context before selecting a single vehicle", () => {
    expect(imageUploadBlock).toBeDefined();

    expect(imageUploadBlock).toContain("const targetDealershipId = dealershipId || req.dealershipId");
    expect(imageUploadBlock).toContain('return res.status(400).json({ error: "Dealership context required" })');
    expect(imageUploadBlock).toContain(
      "and(eq(vehicles.id, vehicleId), eq(vehicles.dealershipId, targetDealershipId))"
    );
  });

  it("keeps background local image updates scoped to the selected vehicle dealership", () => {
    expect(imageUploadBlock).toBeDefined();

    expect(imageUploadBlock).toContain(
      "and(eq(vehicles.id, vehicle.id), eq(vehicles.dealershipId, vehicle.dealershipId))"
    );
  });
});
