import { readFileSync } from "fs";
import { resolve } from "path";

describe("automation runtime route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const storageSource = readFileSync(resolve(process.cwd(), "server/storage.ts"), "utf8");
  const managerRoles = "requireRole('manager', 'admin', 'master', 'super_admin'), requireDealership";
  const automationSequenceBlock = routesSource.match(
    /\/\/ ===== AUTOMATION ENGINE ROUTES =====[\s\S]*?\/\/ Facebook Messenger Lead Webhook/
  )?.[0];

  it("requires message read permission and dealership context for automation queue, logs, campaigns, and analytics reads", () => {
    [
      'app.get("/api/automation/queue", authMiddleware, requirePermission("messages.read"), requireDealership',
      'app.get("/api/automation/logs", authMiddleware, requirePermission("messages.read"), requireDealership',
      'app.get("/api/automation/reengagement-campaigns", authMiddleware, requirePermission("messages.read"),',
      'app.get("/api/automation/reengagement-campaigns/:id", authMiddleware, requirePermission("messages.read"),',
      'app.get("/api/automation/analytics/summary", authMiddleware, requirePermission("messages.read"),',
      'app.get("/api/automation/analytics/executions", authMiddleware, requirePermission("messages.read"),',
      'app.get("/api/automation/analytics/executions/:executionId/messages", authMiddleware, requirePermission("messages.read"),',
      'app.get("/api/automation/analytics/conversions", authMiddleware, requirePermission("messages.read"),',
    ].forEach((route) => expect(routesSource).toContain(route));

    [
      'app.get("/api/automation/reengagement-campaigns", authMiddleware, requirePermission("messages.read"),',
      'app.get("/api/automation/reengagement-campaigns/:id", authMiddleware, requirePermission("messages.read"),',
      'app.get("/api/automation/analytics/summary", authMiddleware, requirePermission("messages.read"),',
      'app.get("/api/automation/analytics/executions", authMiddleware, requirePermission("messages.read"),',
      'app.get("/api/automation/analytics/executions/:executionId/messages", authMiddleware, requirePermission("messages.read"),',
      'app.get("/api/automation/analytics/conversions", authMiddleware, requirePermission("messages.read"),',
    ].forEach((route) => expect(routesSource).toContain(`${route} ${managerRoles}`));
  });

  it("requires message write permission and dealership context for automation message-producing mutations", () => {
    [
      'app.post("/api/automation/queue/:id/cancel", authMiddleware, requirePermission("messages.write"),',
      'app.post("/api/automation/trigger", authMiddleware, requirePermission("messages.write"),',
      'app.post("/api/automation/reengagement-campaigns", authMiddleware, requirePermission("messages.write"),',
      'app.patch("/api/automation/reengagement-campaigns/:id", authMiddleware, requirePermission("messages.write"),',
      'app.delete("/api/automation/reengagement-campaigns/:id", authMiddleware, requirePermission("messages.write"),',
    ].forEach((route) => expect(routesSource).toContain(`${route} ${managerRoles}`));

    expect(routesSource).toContain(
      `app.post("/api/automation/run", authMiddleware, requirePermission("messages.write"), requireRole('admin', 'master', 'super_admin'), requireDealership`
    );

    [
      'app.post("/api/automation/sequence-executions", authMiddleware, requirePermission("messages.write"), requireDealership',
      'app.patch("/api/automation/sequence-executions/:id", authMiddleware, requirePermission("messages.write"), requireDealership',
      'app.post("/api/automation/sequence-messages", authMiddleware, requirePermission("messages.write"), requireDealership',
      'app.patch("/api/automation/sequence-messages/:id", authMiddleware, requirePermission("messages.write"), requireDealership',
    ].forEach((route) => expect(routesSource).toContain(route));
  });

  it("requires lead permissions and dealership context for automation contact/conversion surfaces", () => {
    [
      'app.get("/api/automation/contact-activity", authMiddleware, requirePermission("leads.read"),',
      'app.get("/api/automation/inactive-contacts", authMiddleware, requirePermission("leads.read"),',
    ].forEach((route) => expect(routesSource).toContain(`${route} ${managerRoles}`));

    expect(routesSource).toContain(
      `app.patch("/api/automation/contact-activity/:id", authMiddleware, requirePermission("leads.write"), ${managerRoles}`
    );

    [
      'app.post("/api/automation/contact-activity", authMiddleware, requirePermission("leads.write"), requireDealership',
      'app.post("/api/automation/conversions", authMiddleware, requirePermission("leads.write"), requireDealership',
    ].forEach((route) => expect(routesSource).toContain(route));
  });

  it("strips immutable tenant ownership fields before automation runtime updates", () => {
    [
      "storage.updateReengagementCampaign(id, dealershipId, req.body)",
      "storage.updateContactActivity(id, dealershipId, req.body)",
      "storage.updateSequenceExecution(id, dealershipId, req.body)",
      "storage.updateSequenceMessage(id, dealershipId, req.body)",
    ].forEach((unsafeCall) => expect(routesSource).not.toContain(unsafeCall));

    [
      "storage.updateReengagementCampaign(id, dealershipId, updates)",
      "storage.updateContactActivity(id, dealershipId, updates)",
      "storage.updateSequenceExecution(id, dealershipId, updates)",
      "storage.updateSequenceMessage(id, dealershipId, updates)",
    ].forEach((safeCall) => expect(routesSource).toContain(safeCall));

    [
      ".set({ ...stripTenantOwnershipFields(campaign), updatedAt: new Date() })",
      ".set({ ...stripTenantOwnershipFields(activity), updatedAt: new Date() })",
      ".set({ ...stripTenantOwnershipFields(execution), lastActivityAt: new Date() })",
      ".set(stripTenantOwnershipFields(message))",
    ].forEach((storageGuard) => expect(storageSource).toContain(storageGuard));
  });

  it("rejects malformed automation queue ids and limit filters before scoped queue storage access", () => {
    expect(automationSequenceBlock).toBeDefined();
    expect(routesSource).toContain("function requireAutomationQueueItemIdParam(req: Request, res: Response): number | null");
    expect(routesSource).toContain('res.status(400).json({ error: "Automation queue item id must be a positive integer" })');
    expect(automationSequenceBlock).toContain("const parsedLimit = parseOptionalPositiveIntegerQueryParam(req.query.limit, res, \"limit\")");
    expect(automationSequenceBlock).toContain("if (parsedLimit === null) return;");
    expect(automationSequenceBlock).toContain("const limit = parsedLimit ?? 50;");
    expect(automationSequenceBlock).toContain("requireAutomationQueueItemIdParam(req, res)");
    expect(automationSequenceBlock).not.toContain("parseInt(req.query.limit as string)");
    expect(automationSequenceBlock).not.toContain("parseInt(req.params.id");
  });
});
