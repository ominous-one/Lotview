import { readFileSync } from "fs";
import { resolve } from "path";

describe("automation sequence route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const managerRoles = "requireRole('manager', 'admin', 'master', 'super_admin'), requireAutomationDealershipContext";

  it("uses a fail-closed automation dealership context guard", () => {
    expect(routesSource).toContain("const requireAutomationDealershipContext = (req: Request, res: Response, next: NextFunction)");
    expect(routesSource).toContain("if (!resolveAutomationDealershipId(req))");
    expect(routesSource).toContain('return res.status(400).json({ error: "Dealership ID is required" })');
  });

  it("requires message read permission and dealership context for sequence reads", () => {
    [
      'app.get("/api/automation/sequences", authMiddleware, requirePermission("messages.read"), requireAutomationDealershipContext',
      'app.get("/api/automation/sequences/:id", authMiddleware, requirePermission("messages.read"), requireAutomationDealershipContext',
    ].forEach((route) => expect(routesSource).toContain(route));
  });

  it("requires message write permission, manager-tier role, and dealership context for sequence writes", () => {
    [
      'app.post("/api/automation/sequences", authMiddleware, requirePermission("messages.write"),',
      'app.patch("/api/automation/sequences/:id", authMiddleware, requirePermission("messages.write"),',
      'app.delete("/api/automation/sequences/:id", authMiddleware, requirePermission("messages.write"),',
    ].forEach((route) => expect(routesSource).toContain(`${route} ${managerRoles}`));
  });
});
