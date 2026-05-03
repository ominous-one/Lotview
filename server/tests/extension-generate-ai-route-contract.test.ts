import { readFileSync } from "fs";
import { resolve } from "path";

describe("extension AI generation tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const generateAiBlock = routesSource.match(
    /\/\/ Extension: Generate AI content for vehicle descriptions[\s\S]*?\/\/ Extension: Request posting token/
  )?.[0];

  it("requires authenticated dealership context for extension AI generation", () => {
    expect(routesSource).toContain(
      'app.post("/api/extension/generate-ai", extensionHmacMiddleware, authMiddleware, requireDealership'
    );
  });

  it("requires scoped vehicle proof before generating extension AI content", () => {
    expect(generateAiBlock).toBeDefined();
    expect(generateAiBlock).toContain('const parsedVehicleId = parseOptionalPositiveIntegerBodyValue(vehicleId, res, "vehicleId");');
    expect(generateAiBlock).toContain("if (parsedVehicleId === null) return;");
    expect(generateAiBlock).toContain('return res.status(400).json({ error: "vehicleId and prompt required" });');
    expect(generateAiBlock).toContain("const vehicle = await storage.getVehicleById(parsedVehicleId, dealershipId);");
    expect(generateAiBlock).toContain('return res.status(404).json({ error: "Vehicle not found" });');
    expect(generateAiBlock).not.toContain("if (!vehicleId || !prompt)");
    expect(generateAiBlock).not.toContain("eq(vehicles.id, vehicleId)");
    expect(generateAiBlock).not.toContain(".from(vehicles)");
  });
});
