import { readFileSync } from "fs";
import { resolve } from "path";

describe("PBS management tenant route contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const pbsManagementBlock = routesSource.match(
    /\/\/ ===== PBS DMS INTEGRATION ROUTES[\s\S]*?\/\/ ===== PBS SALES MODULE/
  )?.[0];
  const storageSource = readFileSync(resolve(process.cwd(), "server/storage.ts"), "utf8");
  const pbsStorageBlock = storageSource.match(
    /\/\/ ====== PBS DMS INTEGRATION \(Multi-Tenant\)[\s\S]*?\/\/ ====== PBS SESSIONS/
  )?.[0];

  it("requires dealership context before every authenticated PBS management route", () => {
    for (const route of [
      'app.get("/api/pbs/config", authMiddleware, requireRole("master"), requireDealership',
      'app.post("/api/pbs/config", authMiddleware, requireRole("master"), requireDealership',
      'app.delete("/api/pbs/config/:id", authMiddleware, requireRole("master"), requireDealership',
      'app.get("/api/pbs/webhook-events", authMiddleware, requireRole("master"), requireDealership',
      'app.patch("/api/pbs/webhook-events/:id", authMiddleware, requireRole("master"), requireDealership',
      'app.post("/api/pbs/test-connection", authMiddleware, requireRole("master"), requireDealership',
      'app.get("/api/pbs/api-logs", authMiddleware, requireRole("master"), requireDealership',
      'app.post("/api/pbs/clear-cache", authMiddleware, requireRole("master"), requireDealership',
    ]) {
      expect(routesSource).toContain(route);
    }
  });

  it("uses the resolved dealership for PBS management reads, writes, and service construction", () => {
    expect(pbsManagementBlock).toBeDefined();
    expect(pbsManagementBlock).toContain("const dealershipId = req.dealershipId!");
    expect(pbsManagementBlock).toContain("storage.getPbsConfig(dealershipId)");
    expect(pbsManagementBlock).toContain("storage.updatePbsConfig(existing.id, dealershipId");
    expect(pbsManagementBlock).toContain("storage.createPbsConfig({");
    expect(pbsManagementBlock).toContain("dealershipId,");
    expect(pbsManagementBlock).toContain("storage.deletePbsConfig(id, dealershipId)");
    expect(pbsManagementBlock).toContain("storage.getPbsWebhookEvents(dealershipId, limit)");
    expect(pbsManagementBlock).toContain("storage.updatePbsWebhookEvent(id, dealershipId");
    expect(pbsManagementBlock).toContain("createPbsApiService(dealershipId)");
  });

  it("rejects malformed PBS management ids and limits before scoped storage calls", () => {
    expect(pbsManagementBlock).toBeDefined();
    expect(routesSource).toContain("function requirePbsConfigIdParam(req: Request, res: Response): number | null");
    expect(routesSource).toContain("function requirePbsWebhookEventIdParam(req: Request, res: Response): number | null");
    expect(routesSource).toContain('res.status(400).json({ error: "PBS config id must be a positive integer" })');
    expect(routesSource).toContain('res.status(400).json({ error: "PBS webhook event id must be a positive integer" })');
    expect(pbsManagementBlock).toContain("const id = requirePbsConfigIdParam(req, res)");
    expect(pbsManagementBlock).toContain("const id = requirePbsWebhookEventIdParam(req, res)");
    expect(pbsManagementBlock).toContain('parseOptionalPositiveIntegerQueryParam(req.query.limit, res, "limit")');
    expect(pbsManagementBlock).not.toContain("parseInt(req.params.id");
    expect(pbsManagementBlock).not.toContain("parseInt(req.query.limit");
  });

  it("keeps PBS storage scoped to dealership boundaries", () => {
    expect(pbsStorageBlock).toBeDefined();
    expect(pbsStorageBlock).toContain("eq(pbsConfig.dealershipId, dealershipId)");
    expect(pbsStorageBlock).toContain("dealershipId is required when creating PBS config");
    expect(pbsStorageBlock).toContain("eq(pbsWebhookEvents.dealershipId, dealershipId)");
    expect(pbsStorageBlock).toContain("dealershipId is required when creating PBS webhook event");
  });
});
