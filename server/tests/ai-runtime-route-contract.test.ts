import { readFileSync } from "fs";
import { resolve } from "path";

describe("AI runtime route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

  it("requires dealership context for public chat generation", () => {
    expect(routesSource).toContain('app.post("/api/chat", requireDealership');
  });

  it("requires AI use permission and dealership context for AI generation actions", () => {
    expect(routesSource).toContain(
      'app.post("/api/ai/suggest-reply", authMiddleware, requirePermission("ai.use"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/ai/respond", authMiddleware, requirePermission("ai.use"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/ai/follow-up", authMiddleware, requirePermission("ai.use"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/ai/payments/:vehicleId", authMiddleware, requirePermission("ai.use"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/ai/conversations", authMiddleware, requirePermission("ai.use"), requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership'
    );
  });

  it("requires AI configure permission and dealership context for AI settings", () => {
    expect(routesSource).toContain(
      'app.get("/api/ai-settings", authMiddleware, requirePermission("ai.configure"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.put("/api/ai-settings", authMiddleware, requirePermission("ai.configure"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/ai-settings/test", authMiddleware, requirePermission("ai.configure"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
  });
});
