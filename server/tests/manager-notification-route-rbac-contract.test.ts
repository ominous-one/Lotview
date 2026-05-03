import { readFileSync } from "fs";
import { resolve } from "path";

describe("manager notification route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const notificationsBlock = routesSource.match(
    /\/\/ ===== WS4E: In-app notifications feed \+ email outbox audit =====[\s\S]*?\/\/ ===== Autopost Priority Queue \(Inventory Sync v1\.1\) =====/
  )?.[0];

  it("requires explicit permissions for manager notification audit and settings routes", () => {
    expect(notificationsBlock).toBeDefined();

    for (const route of [
      "app.get('/api/notifications', authMiddleware, requirePermission(\"messages.read\"), requireDealership",
      "app.post('/api/notifications/:id/read', authMiddleware, requirePermission(\"messages.write\"), requireDealership",
      "app.get('/api/notifications/email-outbox', authMiddleware, requirePermission(\"messages.read\"), requireDealership, requireRole('master', 'sales_manager')",
      "app.get('/api/notifications/settings/manager-emails', authMiddleware, requirePermission(\"messages.read\"), requireDealership, requireRole('master', 'sales_manager')",
      "app.post('/api/notifications/settings/manager-emails/:userId/start-verify', authMiddleware, requirePermission(\"messages.write\"), requireDealership, requireRole('master', 'sales_manager')",
    ]) {
      expect(notificationsBlock).toContain(route);
    }
  });

  it("keeps manager notification data scoped to the resolved dealership", () => {
    expect(notificationsBlock).toBeDefined();

    expect(notificationsBlock).toContain("const dealershipId = req.dealershipId!");
    expect(notificationsBlock).toContain("eq(notifications.dealershipId, dealershipId)");
    expect(notificationsBlock).toContain("eq(notifications.recipientUserId, userId)");
    expect(notificationsBlock).toContain("where: eq(emailOutbox.dealershipId, dealershipId)");
    expect(notificationsBlock).toContain("eq(usersTable.dealershipId, dealershipId)");
    expect(notificationsBlock).toContain("inArray(usersTable.role, ['manager', 'sales_manager'])");
  });

  it("verifies target manager ownership before starting email verification", () => {
    expect(notificationsBlock).toBeDefined();

    expect(notificationsBlock).toContain("const manager = await db.query.users.findFirst({");
    expect(notificationsBlock).toContain("if (!manager) return res.status(404).json({ error: 'Manager not found' })");
    expect(notificationsBlock).toContain("startNotificationEmailVerification({ userId, email })");
  });

  it("does not partially parse target manager user ids", () => {
    expect(notificationsBlock).toBeDefined();

    expect(routesSource).toContain('function requireUserIdParam(req: Request, res: Response, paramName = "id"): number | null');
    expect(notificationsBlock).toContain('const userId = requireUserIdParam(req, res, "userId")');
    expect(notificationsBlock).not.toContain("parseInt(req.params.userId");
  });

  it("rejects malformed notification route ids before notification writes reach storage", () => {
    expect(notificationsBlock).toBeDefined();

    expect(routesSource).toContain("function requireNotificationIdParam(req: Request, res: Response): string | null");
    expect(routesSource).toContain("const notificationId = parseUuidRouteParam(req.params.id);");
    expect(routesSource).toContain('res.status(400).json({ error: "Notification id must be a valid UUID" });');
    expect(notificationsBlock).toContain("const id = requireNotificationIdParam(req, res);");
    expect(notificationsBlock).toContain("if (!id) return;");
    expect(notificationsBlock).not.toContain("const id = req.params.id");
  });
});
