import { readFileSync } from "fs";
import { resolve } from "path";

describe("AI prompt route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

  it("requires AI configuration permission and dealership context for dealer prompt routes", () => {
    expect(routesSource).toContain(
      'app.get("/api/chat-prompts", authMiddleware, requirePermission("ai.configure"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/chat-prompts/:scenario", authMiddleware, requirePermission("ai.configure"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/chat-prompts", authMiddleware, requirePermission("ai.configure"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.patch("/api/chat-prompts/:id", authMiddleware, requirePermission("ai.configure"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
  });

  it("requires dealership context before exposing active prompt greetings", () => {
    expect(routesSource).toContain('app.get("/api/chat-prompts/:scenario/active", requireDealership');
  });

  it("requires AI configuration permission for training and enhancement routes", () => {
    expect(routesSource).toContain(
      'app.post("/api/chat/training-feedback", authMiddleware, requirePermission("ai.configure"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/admin/enhance-prompt", authMiddleware, requirePermission("ai.configure"), requireRole("manager", "admin", "master", "super_admin")'
    );
    expect(routesSource).toContain(
      'app.post("/api/chat-insights", authMiddleware, requirePermission("ai.configure"), requireRole("master"), requireDealership'
    );
  });

  it("requires AI configuration permission for admin prompt management", () => {
    expect(routesSource).toContain(
      'app.get("/api/admin/prompts", authMiddleware, requirePermission("ai.configure"), requireRole("master", "super_admin")'
    );
    expect(routesSource).toContain(
      'app.get("/api/admin/prompts/:id", authMiddleware, requirePermission("ai.configure"), requireRole("master", "super_admin")'
    );
    expect(routesSource).toContain(
      'app.post("/api/admin/prompts", authMiddleware, requirePermission("ai.configure"), requireRole("master", "super_admin")'
    );
    expect(routesSource).toContain(
      'app.put("/api/admin/prompts/:id", authMiddleware, requirePermission("ai.configure"), requireRole("master", "super_admin")'
    );
    expect(routesSource).toContain(
      'app.delete("/api/admin/prompts/:id", authMiddleware, requirePermission("ai.configure"), requireRole("master", "super_admin")'
    );
    expect(routesSource).toContain(
      'app.post("/api/admin/prompts/:id/sync-ghl", authMiddleware, requirePermission("ai.configure"), requireRole("master", "super_admin")'
    );
  });
});
