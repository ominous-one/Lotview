import { readFileSync } from "fs";
import { resolve } from "path";

describe("extension FB replies tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const mappingBlock = routesSource.match(
    /\/\/ Extension: Upsert mapping fbThreadId[\s\S]*?\/\/ Extension: Decide whether an auto-send attempt is allowed/
  )?.[0];

  it("requires authenticated dealership context for extension FB reply mapping writes", () => {
    expect(routesSource).toContain(
      'app.post("/api/extension/fb-replies/mapping", extensionHmacMiddleware, authMiddleware, requireDealership'
    );
  });

  it("requires scoped vehicle proof before writing extension FB reply mappings", () => {
    expect(mappingBlock).toBeDefined();
    expect(mappingBlock).toContain('const parsedVehicleId = parseOptionalPositiveIntegerBodyValue(vehicleId, res, "vehicleId");');
    expect(mappingBlock).toContain("if (parsedVehicleId === null) return;");
    expect(mappingBlock).toContain('if (parsedVehicleId === undefined) return res.status(400).json({ error: "vehicleId required" });');
    expect(mappingBlock).toContain("const scopedVehicle = await storage.getVehicleById(parsedVehicleId, dealershipId);");
    expect(mappingBlock).toContain('return res.status(404).json({ error: "Vehicle not found" });');
    expect(mappingBlock).toContain("vehicleId: parsedVehicleId");
    expect(mappingBlock).not.toContain('if (!vehicleId || typeof vehicleId !== "number") return res.status(400).json({ error: "vehicleId required" });');
  });
});
