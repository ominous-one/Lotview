import { readFileSync } from "fs";
import { resolve } from "path";

describe("external vehicle import VIN sync contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const deleteByVinBlock = routesSource.match(
    /\/\/ Delete vehicle by VIN via external API[\s\S]*?\/\/ Bulk sync - delete vehicles not in provided VIN list/
  )?.[0];
  const syncBlock = routesSource.match(
    /\/\/ Bulk sync - delete vehicles not in provided VIN list[\s\S]*?\/\/ Create vehicle \(master only\)/
  )?.[0];

  it("uses the full VIN validator for external delete-by-VIN requests", () => {
    expect(routesSource).toContain('import { validateVIN } from "./vin-validation";');
    expect(deleteByVinBlock).toBeDefined();
    expect(deleteByVinBlock).toContain("const vinValidation = validateVIN(vin);");
    expect(deleteByVinBlock).toContain("if (!vinValidation.isValid)");
    expect(deleteByVinBlock).toContain("errorCode: vinValidation.errorCode");
    expect(deleteByVinBlock).toContain("const normalizedVin = vinValidation.vin;");
    expect(deleteByVinBlock).not.toContain("normalizedVin.length < 5");
  });

  it("rejects bulk sync when any provided VIN fails validation", () => {
    expect(syncBlock).toBeDefined();
    expect(syncBlock).toContain("const vinValidations = vins.map((vin: unknown) => validateVIN(");
    expect(syncBlock).toContain("const invalidVins = vinValidations.filter((validation) => !validation.isValid);");
    expect(syncBlock).toContain("All VINs must pass full VIN validation before inventory sync");
    expect(syncBlock).toContain("invalidVins: invalidVins.slice(0, 10).map");
    expect(syncBlock).not.toContain(".filter((v: string) => v.length >= 5)");
  });

  it("uses only normalized validated VINs for destructive sync decisions", () => {
    expect(syncBlock).toContain("const normalizedVins = Array.from(new Set(vinValidations.map((validation) => validation.vin)));");
    expect(syncBlock).toContain("storage.deleteVehiclesByVinNotIn(normalizedVins, dealershipId)");
  });
});
