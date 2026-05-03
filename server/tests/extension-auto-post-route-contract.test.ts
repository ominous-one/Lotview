import { readFileSync } from "fs";
import { resolve } from "path";

describe("extension auto-post fail-closed tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const autoPostBlock = routesSource.match(
    /\/\/ Extension: Automated Facebook Marketplace posting via Puppeteer\/Browserless[\s\S]*?\/\/ ===== AI SETTINGS/
  )?.[0];

  it("requires authenticated dealership context for extension auto-posting", () => {
    expect(routesSource).toContain(
      'app.post("/api/extension/auto-post", extensionHmacMiddleware, authMiddleware, requireDealership'
    );
  });

  it("keeps extension auto-posting disabled unless the safety gate is explicitly enabled", () => {
    expect(autoPostBlock).toBeDefined();
    expect(autoPostBlock).toContain('process.env.ENABLE_AUTOPOST_QUEUE === "true" || process.env.ENABLE_AUTOPOST_QUEUE === "1"');
    expect(autoPostBlock).toContain('return res.status(403).json({ error: "Facebook Marketplace auto-posting disabled pending certification" });');
  });

  it("requires scoped vehicle proof before automated posting and listing writes", () => {
    expect(autoPostBlock).toBeDefined();
    expect(autoPostBlock).toContain('const parsedVehicleId = parseOptionalPositiveIntegerBodyValue(vehicleId, res, "vehicleId");');
    expect(autoPostBlock).toContain("if (parsedVehicleId === null) return;");
    expect(autoPostBlock).toContain("const scopedVehicle = await storage.getVehicleById(parsedVehicleId, dealershipId);");
    expect(autoPostBlock).toContain("const v = scopedVehicle;");
    expect(autoPostBlock).toContain("vehicleId: parsedVehicleId");
    expect(autoPostBlock).toContain("target: [fbMarketplaceListings.vehicleId, fbMarketplaceListings.accountId]");
    expect(autoPostBlock).not.toContain("if (!vehicleId)");
    expect(autoPostBlock).not.toContain("eq(vehicles.id, vehicleId)");
    expect(autoPostBlock).not.toContain(".from(vehicles)");
  });
});
