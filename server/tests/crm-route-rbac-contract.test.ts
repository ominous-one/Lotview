import { readFileSync } from "fs";
import { resolve } from "path";

describe("CRM route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const storageSource = readFileSync(resolve(process.cwd(), "server/storage.ts"), "utf8");
  const crmContactRoutesSource = routesSource.slice(
    routesSource.indexOf("  // ===== CRM CONTACTS ====="),
    routesSource.indexOf("  // ===== CRM TASKS =====")
  );
  const crmTaskRoutesSource = routesSource.slice(
    routesSource.indexOf("  // ===== CRM TASKS ====="),
    routesSource.indexOf("  // ===== CRM MESSAGE TEMPLATES =====")
  );
  const crmMessagingRoutesSource = routesSource.slice(
    routesSource.indexOf("  // ===== CRM MESSAGING ====="),
    routesSource.indexOf("  // =====================\n  // Email API Routes")
  );
  const crmContactBoundarySource = `${crmContactRoutesSource}\n${crmMessagingRoutesSource}`;

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

  it("requires dealership context for CRM contact tag assignments", () => {
    [
      "storage.addTagToContact(contactId, tagId, userId)",
      "storage.removeTagFromContact(contactId, tagId)",
      "storage.getContactTags(contactId)",
    ].forEach((unsafeCall) => expect(routesSource).not.toContain(unsafeCall));

    [
      "storage.addTagToContact(contactId, tagId, dealershipId, userId)",
      "storage.removeTagFromContact(contactId, tagId, dealershipId)",
      "storage.getContactTags(contactId, dealershipId)",
    ].forEach((safeCall) => expect(routesSource).toContain(safeCall));

    [
      "addTagToContact(contactId: number, tagId: number, dealershipId: number",
      "removeTagFromContact(contactId: number, tagId: number, dealershipId: number)",
      "getContactTags(contactId: number, dealershipId: number)",
      "eq(crmContacts.dealershipId, dealershipId)",
      "eq(crmTags.dealershipId, dealershipId)",
    ].forEach((tenantGuard) => expect(storageSource).toContain(tenantGuard));
  });

  it("fails closed on malformed CRM contact, tag, and pagination identifiers before storage access", () => {
    [
      "function requireCrmContactIdParam(req: Request, res: Response): number | null",
      "CRM contact id must be a positive integer",
      'function requireCrmTagIdParam(req: Request, res: Response, paramName = "tagId"): number | null',
      "CRM tag id must be a positive integer",
      'const ownerId = parseOptionalPositiveIntegerQueryParam(req.query.ownerId, res, "ownerId")',
      'const parsedLimit = parseOptionalPositiveIntegerQueryParam(req.query.limit, res, "limit")',
      'const parsedOffset = parseOptionalNonNegativeIntegerQueryParam(req.query.offset, res, "offset")',
      "const id = requireCrmContactIdParam(req, res)",
      'const id = requireCrmTagIdParam(req, res, "id")',
      "const contactId = requireCrmContactIdParam(req, res)",
      "const tagId = requireCrmTagIdParam(req, res)",
    ].forEach((guard) => expect(routesSource).toContain(guard));

    [
      "filters.ownerId = parseInt(req.query.ownerId as string)",
      "limit: req.query.limit ? parseInt(req.query.limit as string) : 50",
      "offset: req.query.offset ? parseInt(req.query.offset as string) : 0",
      "const id = parseInt(req.params.id);\n      const userId = req.user?.id;\n      const userRole = req.user?.role;",
      "const id = parseInt(req.params.id);\n      \n      const updates = stripTenantOwnershipFields(req.body ?? {});",
      "const id = parseInt(req.params.id);\n      \n      const deleted = await storage.deleteCrmTag(id, dealershipId);",
      "const contactId = parseInt(req.params.id);\n      const tagId = parseInt(req.params.tagId);",
      "const contactId = parseInt(req.params.id);\n      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;",
    ].forEach((unsafeParse) => expect(crmContactBoundarySource).not.toContain(unsafeParse));
  });

  it("fails closed on malformed CRM task identifiers and numeric filters before storage access", () => {
    [
      "function requireCrmTaskIdParam(req: Request, res: Response): number | null",
      "CRM task id must be a positive integer",
      'const assignedToId = parseOptionalPositiveIntegerQueryParam(req.query.assignedToId, res, "assignedToId")',
      'const contactId = parseOptionalPositiveIntegerQueryParam(req.query.contactId, res, "contactId")',
      'const parsedLimit = parseOptionalPositiveIntegerQueryParam(req.query.limit, res, "limit")',
      "const id = requireCrmTaskIdParam(req, res)",
    ].forEach((guard) => expect(routesSource).toContain(guard));

    [
      "filters.assignedToId = parseInt(req.query.assignedToId as string)",
      "if (req.query.contactId) filters.contactId = parseInt(req.query.contactId as string)",
      "const limit = req.query.limit ? parseInt(req.query.limit as string) : 100",
      "const id = parseInt(req.params.id);\n      \n      const task = await storage.getCrmTaskById(id, dealershipId);",
      "const id = parseInt(req.params.id);\n      const userId = req.user?.id;\n      const userRole = req.user?.role;",
      "const id = parseInt(req.params.id);\n      \n      const deleted = await storage.deleteCrmTask(id, dealershipId);",
    ].forEach((unsafeParse) => expect(crmTaskRoutesSource).not.toContain(unsafeParse));
  });
});
