import { readFileSync } from "fs";
import { resolve } from "path";

describe("public tenant endpoint route contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const vehicleImageBlock = routesSource.match(
    /\/\/ Serve cached vehicle images from PostgreSQL[\s\S]*?\/\/ Image proxy to bypass CDN hotlink protection/
  )?.[0];

  it("requires dealership context before public tenant configuration reads", () => {
    for (const route of [
      'app.get("/api/public/financing-rules", requireDealership, async',
      'app.get("/api/public/filter-groups", requireDealership, async',
      'app.get("/api/public/tracking-config", requireDealership, async',
    ]) {
      expect(routesSource).toContain(route);
    }
  });

  it("requires dealership context before serving cached vehicle images", () => {
    expect(routesSource).toContain(
      'app.get("/api/public/vehicle-image/:vehicleId/:index", requireDealership, async'
    );
  });

  it("scopes cached vehicle image reads to the resolved dealership", () => {
    expect(vehicleImageBlock).toBeDefined();
    expect(vehicleImageBlock).toContain("const dealershipId = req.dealershipId!");
    expect(vehicleImageBlock).toContain("eq(vehicleImages.vehicleId, vehicleId)");
    expect(vehicleImageBlock).toContain("eq(vehicleImages.dealershipId, dealershipId)");
    expect(vehicleImageBlock).toContain("eq(vehicleImages.imageIndex, imageIndex)");
  });

  it("fails closed on malformed cached vehicle image identifiers before the database read", () => {
    expect(vehicleImageBlock).toBeDefined();
    expect(routesSource).toContain("function requirePublicVehicleImageParams(req: Request, res: Response): { vehicleId: number; imageIndex: number } | null");
    expect(routesSource).toContain("vehicleId must be a positive integer and image index must be a non-negative integer");
    expect(vehicleImageBlock).toContain("const imageParams = requirePublicVehicleImageParams(req, res)");
    expect(vehicleImageBlock).not.toContain("const vehicleId = parseInt(req.params.vehicleId)");
    expect(vehicleImageBlock).not.toContain("const imageIndex = parseInt(req.params.index)");
    expect(vehicleImageBlock).not.toContain("isNaN(vehicleId) || isNaN(imageIndex)");
  });
});
