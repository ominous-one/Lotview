import { readFileSync } from "fs";
import { resolve } from "path";

describe("email route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

  it("requires integration write permission and dealership context for test email sends", () => {
    const testEmailRoute = routesSource.match(
      /app\.post\("\/api\/email\/test"[\s\S]*?app\.post\("\/api\/email\/call-scoring-alert"/
    )?.[0];

    expect(testEmailRoute).toBeDefined();
    expect(routesSource).toContain(
      'app.post("/api/email/test", authMiddleware, requirePermission("integrations.write"), requireRole(\'admin\', \'master\', \'super_admin\'), requireDealership'
    );
    expect(testEmailRoute).toContain("const dealershipId = req.dealershipId!");
    expect(testEmailRoute).not.toContain("const dealershipId = req.dealershipId ?? req.user?.dealershipId");
    expect(testEmailRoute).not.toContain('throw new Error("Dealership context required for GHL email")');
  });
});
