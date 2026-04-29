import { readFileSync } from "fs";
import { resolve } from "path";

describe("dealership branding route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

  it("requires tenant settings capability and dealership context for branding reads", () => {
    expect(routesSource).toContain(
      'app.get("/api/dealership/branding", authMiddleware, requireCapability("tenant.settings.write"), requireRole("master"), requireDealership'
    );
  });

  it("requires tenant settings capability and dealership context for logo mutations", () => {
    expect(routesSource).toContain(
      'app.post("/api/dealership/branding/logo", authMiddleware, requireCapability("tenant.settings.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.delete("/api/dealership/branding/logo", authMiddleware, requireCapability("tenant.settings.write"), requireRole("master"), requireDealership'
    );
  });
});
