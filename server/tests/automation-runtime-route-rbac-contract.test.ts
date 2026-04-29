import { readFileSync } from "fs";
import { resolve } from "path";

describe("automation runtime route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const managerRoles = "requireRole('manager', 'admin', 'master', 'super_admin'), requireDealership";

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
});
