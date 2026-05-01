import { readFileSync } from "fs";
import { resolve } from "path";

describe("legacy public vehicle route contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const publicVehicleBlock = routesSource.match(
    /\/\/ Get vehicles\. Public\/default path returns a slim paginated inventory DTO\.[\s\S]*?\/\/ Get full Carfax report for a vehicle/
  )?.[0];

  it("requires dealership context before legacy public vehicle detail and Carfax storage reads", () => {
    expect(routesSource).toContain('app.get("/api/vehicles/:id", requireDealership, async');
    expect(routesSource).toContain('app.get("/api/vehicles/:id/carfax", requireDealership, async');
    expect(routesSource).toContain('app.get("/api/vehicles/:id/carfax/summary", requireDealership, async');
  });

  it("keeps legacy full inventory view behind authenticated inventory read permission", () => {
    expect(publicVehicleBlock).toBeDefined();
    expect(publicVehicleBlock).toContain('return res.status(401).json({ error: "Authentication required for full inventory view" });');
    expect(publicVehicleBlock).toContain('hasPermission(req.user.role, "inventory.read")');
    expect(publicVehicleBlock).toContain('return res.status(403).json({ error: "Insufficient permissions" });');
  });

  it("uses tenant-scoped stored vehicle view counts instead of fabricated social proof", () => {
    expect(publicVehicleBlock).toBeDefined();
    expect(publicVehicleBlock).toContain("storage.getVehicleViews(vehicle.id, dealershipId, 24)");
    expect(publicVehicleBlock).toContain("storage.getVehicleViews(id, dealershipId, 24)");
    expect(publicVehicleBlock).not.toContain("Math.floor(Math.random()");
    expect(publicVehicleBlock).not.toContain("randomized for engagement");
    expect(publicVehicleBlock).not.toContain("social proof");
  });
});
