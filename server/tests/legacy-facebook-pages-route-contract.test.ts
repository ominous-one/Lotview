import { readFileSync } from "fs";
import { resolve } from "path";

describe("legacy Facebook Pages route contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

  it("requires explicit integration permissions and dealership context", () => {
    expect(routesSource).toContain(
      'app.get("/api/facebook-pages", authMiddleware, requirePermission("integrations.read"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/facebook-pages", authMiddleware, requirePermission("integrations.write"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.patch("/api/facebook-pages/:id", authMiddleware, requirePermission("integrations.write"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/facebook-pages/:id/priority-vehicles", authMiddleware, requirePermission("integrations.read"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/facebook-pages/:id/priority-vehicles", authMiddleware, requirePermission("integrations.write"), requireDealership'
    );
  });

  it("scopes legacy page updates to the authenticated dealership", () => {
    expect(routesSource).toContain("const id = Number(req.params.id)");
    expect(routesSource).toContain("if (!Number.isInteger(id) || id < 1)");
    expect(routesSource).toContain("const page = await storage.updateFacebookPage(id, updates, req.dealershipId!)");
    expect(routesSource).not.toContain("const page = await storage.updateFacebookPage(id, req.body)");
  });

  it("does not trust caller-supplied identity fields when updating a page", () => {
    expect(routesSource).toContain("dealershipId: _ignoredDealershipId");
    expect(routesSource).toContain("id: _ignoredId");
  });
});
