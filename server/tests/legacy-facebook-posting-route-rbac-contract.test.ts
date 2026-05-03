import { readFileSync } from "fs";
import { resolve } from "path";

describe("legacy Facebook posting route RBAC contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const facebookPostingBlock = routesSource.match(
    /\/\/ ===== FACEBOOK POSTING ROUTES \(Salespeople\) =====[\s\S]*?\/\/ ===== SALES MANAGER ROUTES =====/
  )?.[0];
  const accountTemplateQueueBlock = routesSource.match(
    /\/\/ Get Facebook accounts for current user[\s\S]*?\/\/ Get posting schedule for current user/
  )?.[0];

  it("requires explicit read permissions and dealership context for legacy Facebook read routes", () => {
    expect(facebookPostingBlock).toBeDefined();

    for (const route of [
      'app.get("/api/facebook/accounts", authMiddleware, requirePermission("messages.read"), requireRole("salesperson"), requireDealership',
      'app.get("/api/facebook/templates", authMiddleware, requirePermission("messages.read"), requireRole("salesperson"), requireDealership',
      'app.get("/api/facebook/queue", authMiddleware, requirePermission("messages.read"), requireRole("salesperson"), requireDealership',
      'app.get("/api/facebook/schedule", authMiddleware, requirePermission("messages.read"), requireRole("salesperson"), requireDealership',
      'app.get("/api/facebook/config/status", authMiddleware, requirePermission("messages.read"), requireRole("salesperson"), requireDealership',
      'app.get("/api/facebook/oauth/session/:sessionId", authMiddleware, requirePermission("messages.read"), requireRole("salesperson"), requireDealership',
      'app.get("/api/facebook/accounts/:accountId/pages", authMiddleware, requirePermission("messages.read"), requireRole("salesperson"), requireDealership',
      'app.get("/api/facebook/connected-pages", authMiddleware, requirePermission("messages.read"), requireRole("salesperson"), requireDealership',
    ]) {
      expect(facebookPostingBlock).toContain(route);
    }
  });

  it("requires explicit write permissions and dealership context for legacy Facebook mutation routes", () => {
    expect(facebookPostingBlock).toBeDefined();

    for (const route of [
      'app.post("/api/facebook/accounts", authMiddleware, requirePermission("messages.write"), requireRole("salesperson"), requireDealership',
      'app.patch("/api/facebook/accounts/:id", authMiddleware, requirePermission("messages.write"), requireRole("salesperson"), requireDealership',
      'app.delete("/api/facebook/accounts/:id", authMiddleware, requirePermission("messages.write"), requireRole("salesperson"), requireDealership',
      'app.post("/api/facebook/templates", authMiddleware, requirePermission("messages.write"), requireRole("salesperson"), requireDealership',
      'app.patch("/api/facebook/templates/:id", authMiddleware, requirePermission("messages.write"), requireRole("salesperson"), requireDealership',
      'app.delete("/api/facebook/templates/:id", authMiddleware, requirePermission("messages.write"), requireRole("salesperson"), requireDealership',
      'app.post("/api/facebook/queue", authMiddleware, requirePermission("messages.write"), requireRole("salesperson"), requireDealership',
      'app.patch("/api/facebook/queue/:id", authMiddleware, requirePermission("messages.write"), requireRole("salesperson"), requireDealership',
      'app.delete("/api/facebook/queue/:id", authMiddleware, requirePermission("messages.write"), requireRole("salesperson"), requireDealership',
      'app.post("/api/facebook/schedule", authMiddleware, requirePermission("messages.write"), requireRole("salesperson"), requireDealership',
      'app.post("/api/facebook/oauth/start", authMiddleware, requirePermission("messages.write"), requireRole("salesperson"), requireDealership',
      'app.post("/api/facebook/accounts/connect", authMiddleware, requirePermission("messages.write"), requireRole("salesperson"), requireDealership',
      'app.get("/api/facebook/oauth/init/:accountId", authMiddleware, requirePermission("messages.write"), requireRole("salesperson"), requireDealership',
      'app.post("/api/facebook/accounts/:accountId/pages/:pageId/connect", authMiddleware, requirePermission("messages.write"), requireRole("salesperson"), requireDealership',
      'app.post("/api/facebook/pages/:pageId/disconnect", authMiddleware, requirePermission("messages.write"), requireRole("salesperson"), requireDealership',
      'app.post("/api/facebook/pages/:pageId/test-post", authMiddleware, requirePermission("messages.write"), requireRole("master"), requireDealership',
      'app.post("/api/facebook/pages/:pageId/post-vehicle/:vehicleId", authMiddleware, requirePermission("messages.write"), requireRole("salesperson"), requireDealership',
      'app.post("/api/facebook/post/:queueId", authMiddleware, requirePermission("messages.write"), requireRole("salesperson"), requireDealership',
    ]) {
      expect(facebookPostingBlock).toContain(route);
    }
  });

  it("does not leave authenticated legacy Facebook posting routes without permission and dealership middleware", () => {
    expect(facebookPostingBlock).toBeDefined();

    const protectedRouteLines = facebookPostingBlock!
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /app\.(get|post|patch|delete)\("\/api\/facebook/.test(line))
      .filter((line) => !line.includes("/api/facebook/oauth/callback"));

    expect(protectedRouteLines.length).toBeGreaterThanOrEqual(25);
    expect(protectedRouteLines.every((line) => line.includes("requirePermission("))).toBe(true);
    expect(protectedRouteLines.every((line) => line.includes("requireDealership"))).toBe(true);
  });

  it("does not partially parse legacy Facebook account, template, or queue item ids", () => {
    expect(accountTemplateQueueBlock).toBeDefined();
    expect(routesSource).toContain("function requireFacebookPostingIdParam");

    const idGuardCalls = accountTemplateQueueBlock?.match(/requireFacebookPostingIdParam\(req, res,/g) ?? [];
    expect(idGuardCalls).toHaveLength(6);
    expect(accountTemplateQueueBlock).not.toContain("parseInt(req.params.id)");
    expect(accountTemplateQueueBlock).not.toContain("Number.parseInt(req.params.id");
  });

  it("does not partially parse legacy Facebook OAuth, page posting, vehicle, or manual queue ids", () => {
    expect(facebookPostingBlock).toBeDefined();
    expect(routesSource).toContain(
      'function requireFacebookPostingIdParam(req: Request, res: Response, label: string, paramName = "id"): number | null'
    );

    for (const expectedGuard of [
      'const accountId = requireFacebookPostingIdParam(req, res, "Facebook account", "accountId")',
      'const pageId = requireFacebookPostingIdParam(req, res, "Facebook page", "pageId")',
      'const vehicleId = requireVehicleIdPathParam(req, res)',
      'const queueId = requireFacebookPostingIdParam(req, res, "Posting queue", "queueId")',
    ]) {
      expect(facebookPostingBlock).toContain(expectedGuard);
    }

    expect(facebookPostingBlock).not.toContain("parseInt(req.params.accountId)");
    expect(facebookPostingBlock).not.toContain("parseInt(req.params.pageId)");
    expect(facebookPostingBlock).not.toContain("parseInt(req.params.vehicleId)");
    expect(facebookPostingBlock).not.toContain("parseInt(req.params.queueId)");
  });
});
