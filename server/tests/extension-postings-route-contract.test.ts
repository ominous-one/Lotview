import { readFileSync } from "fs";
import { resolve } from "path";

describe("extension posting event tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const postingBlock = routesSource.match(
    /\/\/ Extension: Log posting event[\s\S]*?\/\/ Extension: Get vehicles for posting/
  )?.[0];

  it("requires authenticated dealership context for extension posting event writes", () => {
    expect(routesSource).toContain(
      'app.post("/api/extension/postings", extensionHmacMiddleware, authMiddleware, requireDealership'
    );
  });

  it("requires scoped vehicle proof before writing posting events or listings", () => {
    expect(postingBlock).toBeDefined();
    expect(postingBlock).toContain('const parsedVehicleId = parseOptionalPositiveIntegerBodyValue(vehicleId, res, "vehicleId");');
    expect(postingBlock).toContain("if (parsedVehicleId === null) return;");
    expect(postingBlock).toContain('return res.status(400).json({ error: "vehicleId, platform, status required" });');
    expect(postingBlock).toContain("const scopedVehicle = await storage.getVehicleById(parsedVehicleId, dealershipId);");
    expect(postingBlock).toContain('return res.status(404).json({ error: "Vehicle not found" });');
    expect(postingBlock).toContain("validatePostingToken(\n          postingToken,\n          userId,\n          parsedVehicleId,\n          platform\n        )");
    expect(postingBlock).toContain("vehicleId: parsedVehicleId");
    expect(postingBlock).toContain("eq(fbMarketplaceListings.vehicleId, parsedVehicleId)");
    expect(postingBlock).toContain("postedPrice: scopedVehicle.price");
    expect(postingBlock).not.toContain("if (!vehicleId || !platform || !status)");
    expect(postingBlock).not.toContain("validatePostingToken(\n          postingToken,\n          userId,\n          vehicleId,\n          platform\n        )");
  });
});
