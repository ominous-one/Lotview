import { readFileSync } from "fs";
import { resolve } from "path";

describe("financing and fee settings route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

  it("requires billing read permission and dealership context for financing setting reads", () => {
    expect(routesSource).toContain(
      'app.get("/api/financing/credit-tiers", authMiddleware, requirePermission("billing.read"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/financing/model-year-terms", authMiddleware, requirePermission("billing.read"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/dealership-fees", authMiddleware, requirePermission("billing.read"), requireRole("master"), requireDealership'
    );
  });

  it("requires billing write permission and dealership context for financing setting mutations", () => {
    expect(routesSource).toContain(
      'app.post("/api/financing/credit-tiers", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.patch("/api/financing/credit-tiers/:id", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.delete("/api/financing/credit-tiers/:id", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/financing/model-year-terms", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.patch("/api/financing/model-year-terms/:id", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.delete("/api/financing/model-year-terms/:id", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/dealership-fees", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.patch("/api/dealership-fees/:id", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.delete("/api/dealership-fees/:id", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
  });
});
