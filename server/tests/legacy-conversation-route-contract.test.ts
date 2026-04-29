import { readFileSync } from "fs";
import { resolve } from "path";

describe("legacy conversation route tenant and RBAC contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

  it("requires dealership context before saving public conversations", () => {
    expect(routesSource).toContain('app.post("/api/conversations", requireDealership');
  });

  it("requires message read permission, role floor, and dealership context for conversation reads", () => {
    expect(routesSource).toContain(
      'app.get("/api/conversations", authMiddleware, requirePermission("messages.read"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/conversations/:id", authMiddleware, requirePermission("messages.read"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
  });

  it("requires message permission, role floor, and dealership context for messenger routes", () => {
    expect(routesSource).toContain(
      'app.get("/api/messenger-conversations", authMiddleware, requirePermission("messages.read"), requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/messenger-conversations/:id/reply", authMiddleware, requirePermission("messages.write"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
  });

  it("does not perform ad hoc header tenant selection inside conversation read routes", () => {
    const conversationReadSection = routesSource.slice(
      routesSource.indexOf("// Get all conversations"),
      routesSource.indexOf("// ===== MESSENGER CONVERSATIONS ROUTES ====="),
    );

    expect(conversationReadSection).not.toContain("x-dealership-id");
    expect(conversationReadSection).not.toContain("headerDealershipId");
  });
});
