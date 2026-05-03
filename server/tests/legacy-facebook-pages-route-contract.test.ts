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
    expect(routesSource).toContain("const id = requireFacebookPageIdParam(req, res);");
    expect(routesSource).toContain("const page = await storage.updateFacebookPage(id, updates, req.dealershipId!)");
    expect(routesSource).not.toContain("const page = await storage.updateFacebookPage(id, req.body)");
  });

  it("uses strict positive integer parsing for page ids", () => {
    const facebookPagesBlock = routesSource.slice(
      routesSource.indexOf("// Get all connected Facebook pages"),
      routesSource.indexOf("// ===== FILE DOWNLOADS ====="),
    );

    expect(routesSource).toContain("function requireFacebookPageIdParam(req: Request, res: Response): number | null");
    expect(routesSource).toContain("const pageId = parsePositiveIntegerId(req.params.id);");
    expect(facebookPagesBlock).toContain("const id = requireFacebookPageIdParam(req, res);");
    expect(facebookPagesBlock).toContain("const pageId = requireFacebookPageIdParam(req, res);");
    expect(facebookPagesBlock).not.toContain("parseInt(req.params.id)");
    expect(facebookPagesBlock).not.toContain("Number(req.params.id)");
  });

  it("does not trust caller-supplied identity fields when updating a page", () => {
    expect(routesSource).toContain("dealershipId: _ignoredDealershipId");
    expect(routesSource).toContain("id: _ignoredId");
  });
});
