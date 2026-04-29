import { readFileSync } from "fs";
import { resolve } from "path";

describe("user management route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

  it("requires user management permission and dealership context to list tenant users", () => {
    expect(routesSource).toContain(
      'app.get("/api/users", authMiddleware, requirePermission("users.manage"), requireRole("master"), requireDealership'
    );
  });

  it("requires user invite permission and dealership context to create tenant users", () => {
    expect(routesSource).toContain(
      'app.post("/api/users", authMiddleware, requirePermission("users.invite"), requireRole("master"), requireDealership'
    );
  });

  it("requires user management permission and dealership context to mutate tenant users", () => {
    expect(routesSource).toContain(
      'app.patch("/api/users/:id", authMiddleware, requirePermission("users.manage"), requireRole("master"), requireDealership'
    );
  });
});
