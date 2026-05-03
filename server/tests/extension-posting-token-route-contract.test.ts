import { readFileSync } from "fs";
import { resolve } from "path";

describe("extension posting token tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const postingTokenBlock = routesSource.match(
    /\/\/ Extension: Request posting token[\s\S]*?\/\/ Extension: Log posting event/
  )?.[0];

  it("requires authenticated dealership context for extension posting token creation", () => {
    expect(routesSource).toContain(
      'app.post("/api/extension/posting-token", extensionHmacMiddleware, authMiddleware, requireDealership'
    );
  });

  it("requires scoped vehicle proof before creating extension posting tokens", () => {
    expect(postingTokenBlock).toBeDefined();
    expect(postingTokenBlock).toContain('const parsedVehicleId = parseOptionalPositiveIntegerBodyValue(vehicleId, res, "vehicleId");');
    expect(postingTokenBlock).toContain("if (parsedVehicleId === null) return;");
    expect(postingTokenBlock).toContain('return res.status(400).json({ error: "vehicleId and platform required" });');
    expect(postingTokenBlock).toContain("const scopedVehicle = await storage.getVehicleById(parsedVehicleId, dealershipId);");
    expect(postingTokenBlock).toContain('return res.status(404).json({ error: "Vehicle not found" });');
    expect(postingTokenBlock).toContain("const postingToken = await generatePostingToken(userId, parsedVehicleId, platform);");
    expect(postingTokenBlock).not.toContain("if (!vehicleId || !platform)");
    expect(postingTokenBlock).not.toContain("eq(vehicles.id, vehicleId)");
    expect(postingTokenBlock).not.toContain("generatePostingToken(userId, vehicleId, platform)");
  });
});
