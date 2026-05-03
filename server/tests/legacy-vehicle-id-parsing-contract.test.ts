import { readFileSync } from "fs";
import { resolve } from "path";

describe("legacy vehicle id parsing contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

  function routeBlock(routeLiteral: string): string {
    const start = routesSource.indexOf(routeLiteral);
    expect(start).toBeGreaterThanOrEqual(0);

    const end = routesSource.indexOf("\n  });", start);
    expect(end).toBeGreaterThan(start);

    return routesSource.slice(start, end);
  }

  const vehicleIdRoutes = [
    'app.get("/api/vehicles/:id", requireDealership',
    'app.get("/api/vehicles/:id/carfax", requireDealership',
    'app.get("/api/vehicles/:id/carfax/summary", requireDealership',
    'app.delete("/api/import/vehicles/:id", externalApiAuth',
    'app.patch("/api/vehicles/:id", authMiddleware',
    'app.post("/api/vehicles/:id/soft-delete", authMiddleware',
    'app.patch("/api/vehicles/:id/vdp-content", authMiddleware',
    'app.delete("/api/vehicles/:id", authMiddleware',
    'app.post("/api/vehicles/:id/generate-video", authMiddleware',
    'app.post("/api/vehicles/:id/generate-description", authMiddleware',
    'app.post("/api/vehicles/:id/force-rescrape", authMiddleware',
    'app.post("/api/vehicles/:id/view", requireDealership',
    'app.get("/api/vehicles/:id/views", requireDealership',
    'app.get("/api/extension/vehicles/:id", extensionHmacMiddleware',
    'app.post("/api/extension/vehicles/:id/posted", extensionHmacMiddleware',
  ];

  it("uses a shared strict positive integer parser for legacy vehicle route ids", () => {
    expect(routesSource).toContain("function requireVehicleIdParam(req: Request, res: Response): number | null");
    expect(routesSource).toContain("const vehicleId = parsePositiveIntegerId(req.params.id);");
    expect(routesSource).toContain('res.status(400).json({ error: "Vehicle id must be a positive integer" });');
  });

  it("does not partially parse legacy vehicle id route parameters", () => {
    for (const routeLiteral of vehicleIdRoutes) {
      const block = routeBlock(routeLiteral);

      expect(block).toContain("requireVehicleIdParam(req, res)");
      expect(block).not.toContain("parseInt(req.params.id)");
      expect(block).not.toContain("Number.parseInt(req.params.id");
    }
  });
});
