import { readFileSync } from "fs";
import { resolve } from "path";

describe("CRM route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const storageSource = readFileSync(resolve(process.cwd(), "server/storage.ts"), "utf8");

  const salespersonLeadRoles = "requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership";
  const managerLeadRoles = "requireRole('manager', 'admin', 'master', 'super_admin'), requireDealership";

  it("requires lead read permission and dealership context for CRM lead reads", () => {
    [
      'app.get("/api/crm/contacts", authMiddleware, requirePermission("leads.read"),',
      'app.get("/api/crm/contacts/:id", authMiddleware, requirePermission("leads.read"),',
      'app.get("/api/crm/tags", authMiddleware, requirePermission("leads.read"),',
      'app.get("/api/crm/contacts/:id/tags", authMiddleware, requirePermission("leads.read"),',
      'app.get("/api/crm/contacts/:id/activities", authMiddleware, requirePermission("leads.read"),',
      'app.get("/api/crm/tasks", authMiddleware, requirePermission("leads.read"),',
      'app.get("/api/crm/tasks/:id", authMiddleware, requirePermission("leads.read"),',
    ].forEach((route) => expect(routesSource).toContain(`${route} ${salespersonLeadRoles}`));
  });

  it("requires lead write permission and dealership context for CRM lead mutations", () => {
    [
      'app.post("/api/crm/contacts", authMiddleware, requirePermission("leads.write"),',
      'app.patch("/api/crm/contacts/:id", authMiddleware, requirePermission("leads.write"),',
      'app.post("/api/crm/contacts/:id/tags/:tagId", authMiddleware, requirePermission("leads.write"),',
      'app.delete("/api/crm/contacts/:id/tags/:tagId", authMiddleware, requirePermission("leads.write"),',
      'app.post("/api/crm/contacts/:id/activities", authMiddleware, requirePermission("leads.write"),',
      'app.post("/api/crm/tasks", authMiddleware, requirePermission("leads.write"),',
      'app.patch("/api/crm/tasks/:id", authMiddleware, requirePermission("leads.write"),',
    ].forEach((route) => expect(routesSource).toContain(`${route} ${salespersonLeadRoles}`));

    [
      'app.delete("/api/crm/contacts/:id", authMiddleware, requirePermission("leads.write"),',
      'app.post("/api/crm/tags", authMiddleware, requirePermission("leads.write"),',
      'app.patch("/api/crm/tags/:id", authMiddleware, requirePermission("leads.write"),',
      'app.delete("/api/crm/tags/:id", authMiddleware, requirePermission("leads.write"),',
      'app.delete("/api/crm/tasks/:id", authMiddleware, requirePermission("leads.write"),',
    ].forEach((route) => expect(routesSource).toContain(`${route} ${managerLeadRoles}`));
  });

  it("requires message permissions and dealership context for CRM messaging surfaces", () => {
    [
      'app.get("/api/crm/message-templates", authMiddleware, requirePermission("messages.read"),',
      'app.get("/api/crm/message-templates/:id", authMiddleware, requirePermission("messages.read"),',
      'app.get("/api/crm/contacts/:id/messages", authMiddleware, requirePermission("messages.read"),',
    ].forEach((route) => expect(routesSource).toContain(`${route} ${salespersonLeadRoles}`));

    [
      'app.post("/api/crm/message-templates", authMiddleware, requirePermission("messages.write"),',
      'app.patch("/api/crm/message-templates/:id", authMiddleware, requirePermission("messages.write"),',
      'app.delete("/api/crm/message-templates/:id", authMiddleware, requirePermission("messages.write"),',
    ].forEach((route) => expect(routesSource).toContain(`${route} ${managerLeadRoles}`));

    expect(routesSource).toContain(
      `app.post("/api/crm/contacts/:id/message", authMiddleware, requirePermission("messages.write"), ${salespersonLeadRoles}`
    );
    expect(routesSource).toContain(
      `app.post("/api/crm/contacts/:id/suggest-message", authMiddleware, requirePermission("messages.write"), requirePermission("ai.use"), ${salespersonLeadRoles}`
    );
  });

  it("strips immutable tenant ownership fields before CRM updates", () => {
    [
      "storage.updateCrmContact(id, dealershipId, req.body)",
      "storage.updateCrmTag(id, dealershipId, req.body)",
      "storage.updateCrmTask(id, dealershipId, req.body)",
      "storage.updateCrmMessageTemplate(id, dealershipId, req.body)",
    ].forEach((unsafeCall) => expect(routesSource).not.toContain(unsafeCall));

    [
      "storage.updateCrmContact(id, dealershipId, updates)",
      "storage.updateCrmTag(id, dealershipId, updates)",
      "storage.updateCrmTask(id, dealershipId, updates)",
      "storage.updateCrmMessageTemplate(id, dealershipId, updates)",
    ].forEach((safeCall) => expect(routesSource).toContain(safeCall));

    [
      ".set({ ...stripTenantOwnershipFields(contact), updatedAt: new Date() })",
      ".set(stripTenantOwnershipFields(tag))",
      ".set({ ...stripTenantOwnershipFields(task), updatedAt: new Date() })",
      ".set(stripTenantOwnershipFields(message))",
      ".set({ ...stripTenantOwnershipFields(template), updatedAt: new Date() })",
    ].forEach((storageGuard) => expect(storageSource).toContain(storageGuard));
  });
});
