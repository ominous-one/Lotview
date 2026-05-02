import { readFileSync } from "fs";
import { resolve } from "path";

describe("manager appraisal VIN validation contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const appraisalVinBlock = routesSource.match(
    /\/\/ Check if VIN has previous appraisal[\s\S]*?\/\/ Get single appraisal by ID/
  )?.[0];

  it("uses the shared VIN validator before appraisal lookup", () => {
    expect(routesSource).toContain('import { validateVIN } from "./vin-validation";');
    expect(appraisalVinBlock).toBeDefined();
    expect(appraisalVinBlock).toContain("const vinValidation = validateVIN(req.params.vin);");
    expect(appraisalVinBlock).toContain("if (!vinValidation.isValid)");
    expect(appraisalVinBlock).toContain("errorCode: vinValidation.errorCode");
    expect(appraisalVinBlock).not.toContain("vin.length < 11");
  });

  it("uses the normalized validated VIN with the resolved dealership", () => {
    expect(appraisalVinBlock).toBeDefined();
    expect(appraisalVinBlock).toContain("const vin = vinValidation.vin;");
    expect(appraisalVinBlock).toContain("storage.getVehicleAppraisalByVin(vin, dealershipId)");
  });
});
