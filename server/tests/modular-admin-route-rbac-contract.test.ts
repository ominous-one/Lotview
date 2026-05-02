import { readFileSync } from "fs";
import { resolve } from "path";

describe("modular admin route RBAC contract", () => {
  const adminRoutesSource = readFileSync(resolve(process.cwd(), "server/routes/admin.ts"), "utf8");

  it("requires explicit permissions for sensitive system and secret routes", () => {
    expect(adminRoutesSource).toContain(
      'router.post("/restart-server", authMiddleware, requirePermission("admin.audit"), superAdminOnly, sensitiveLimiter'
    );
    expect(adminRoutesSource).toContain(
      'router.get("/secrets/password-status", authMiddleware, requirePermission("integrations.read"), superAdminOnly'
    );
    expect(adminRoutesSource).toContain(
      'router.post("/secrets/set-password", authMiddleware, requirePermission("integrations.write"), superAdminOnly, sensitiveLimiter'
    );
  });

  it("requires tenant and user permissions for dealership and user lifecycle routes", () => {
    for (const route of [
      'router.get("/dealerships", authMiddleware, requireCapability("tenant.manage"), superAdminOnly',
      'router.post("/dealerships", authMiddleware, requireCapability("tenant.manage"), requirePermission("users.invite"), superAdminOnly',
      'router.get("/dealerships/:dealershipId", authMiddleware, requireCapability("tenant.manage"), superAdminOnly',
      'router.patch("/dealerships/:dealershipId", authMiddleware, requireCapability("tenant.manage"), requirePermission("users.manage"), superAdminOnly',
      'router.get("/users", authMiddleware, requirePermission("users.manage"), superAdminOnly',
      'router.post("/users", authMiddleware, requirePermission("users.invite"), superAdminOnly',
    ]) {
      expect(adminRoutesSource).toContain(route);
    }
  });

  it("strictly parses modular dealership identifiers instead of using permissive parseInt", () => {
    expect(adminRoutesSource).toContain("const dealershipId = parsePositiveInteger(req.params.dealershipId);");
    expect(adminRoutesSource).toContain('return res.status(400).json({ error: "dealershipId must be a positive integer" })');
    expect(adminRoutesSource).not.toContain("parseInt(req.params.dealershipId");
  });

  it("does not pass raw request bodies into modular dealership writes", () => {
    expect(adminRoutesSource).toContain("function buildDealershipUpdates(body: Record<string, unknown>)");
    expect(adminRoutesSource).toContain("const { updates, errors } = buildDealershipUpdates(req.body ?? {});");
    expect(adminRoutesSource).toContain('return res.status(400).json({ error: "No valid dealership fields provided" })');
    expect(adminRoutesSource).toContain("const dealership = await storage.updateDealership(dealershipId, updates);");
    expect(adminRoutesSource).not.toContain("storage.updateDealership(parseInt(req.params.dealershipId), req.body)");
    expect(adminRoutesSource).not.toContain("storage.updateDealership(dealershipId, req.body)");
  });

  it("checks dealership identity collisions before modular create or update", () => {
    expect(adminRoutesSource).toContain("async function validateTenantIdentityAvailability");
    expect(adminRoutesSource).toContain("const existing = await storage.getDealershipBySlug(options.slug);");
    expect(adminRoutesSource).toContain("const existing = await storage.getDealershipBySubdomain(options.subdomain);");
    expect(adminRoutesSource).toContain("const identityErrors = await validateTenantIdentityAvailability({ slug, subdomain });");
    expect(adminRoutesSource).toContain("dealershipIdToExclude: dealershipId");
  });

  it("audits modular dealership lifecycle writes and strips master user password hashes", () => {
    expect(adminRoutesSource).toContain("function stripPasswordHash");
    expect(adminRoutesSource).toContain('action: "dealership_created"');
    expect(adminRoutesSource).toContain('action: "dealership_updated"');
    expect(adminRoutesSource).toContain("masterUser: stripPasswordHash(masterUser)");
  });

  it("uses explicit super-admin user listing instead of tenant-scoped list fallback", () => {
    expect(adminRoutesSource).toContain("function parsePositiveInteger(value: unknown): number | null");
    expect(adminRoutesSource).toContain("const users = await storage.getAllUsersForSuperAdmin({ dealershipId, role, search });");
    expect(adminRoutesSource).toContain('return res.status(400).json({ error: "dealershipId must be a positive integer" })');
    expect(adminRoutesSource).not.toContain("parseInt(req.query.dealershipId");
    expect(adminRoutesSource).not.toContain("getAllUsers();");
  });

  it("requires explicit dealership binding before creating tenant users", () => {
    expect(adminRoutesSource).toContain("const normalizedRole = normalizeRole(role);");
    expect(adminRoutesSource).toContain("const parsedDealershipId = parsePositiveInteger(dealershipId);");
    expect(adminRoutesSource).toContain('typeof password !== "string"');
    expect(adminRoutesSource).toContain('return res.status(400).json({ error: "Email, name, password, role, and dealershipId are required" })');
    expect(adminRoutesSource).toContain('return res.status(400).json({ error: "dealershipId must be a positive integer" })');
    expect(adminRoutesSource).toContain('if (!normalizedRole || normalizedRole === "super_admin")');
    expect(adminRoutesSource).toContain("const dealership = await storage.getDealershipById(parsedDealershipId);");
    expect(adminRoutesSource).toContain("dealershipId: parsedDealershipId");
  });

  it("audits modular super-admin user creation and does not return password hashes", () => {
    expect(adminRoutesSource).toContain("await storage.logAuditAction({");
    expect(adminRoutesSource).toContain('action: "user_created"');
    expect(adminRoutesSource).toContain("const { passwordHash: _, ...userWithoutPassword } = user;");
    expect(adminRoutesSource).toContain("res.status(201).json(userWithoutPassword);");
  });

  it("requires audit permission for dashboard, audit, log, and health surfaces", () => {
    for (const route of [
      'router.get("/global-settings", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/dashboard/health", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/dashboard/business-metrics", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/dashboard/dealership-activity", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/dashboard/ai-metrics", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/dashboard/scraping-metrics", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/dashboard/fb-marketplace-metrics", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/dashboard/alerts", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.post("/dashboard/alerts/:alertId/resolve", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/audit-logs", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/scraper-logs", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
      'router.get("/system-health", authMiddleware, requirePermission("admin.audit"), superAdminOnly',
    ]) {
      expect(adminRoutesSource).toContain(route);
    }
  });

  it("requires tenant settings capability before mutating global settings", () => {
    expect(adminRoutesSource).toContain(
      'router.put("/global-settings/:key", authMiddleware, requireCapability("tenant.settings.write"), superAdminOnly'
    );
  });

  it("does not leave modular admin routes guarded only by superAdminOnly", () => {
    const routeLines = adminRoutesSource
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /router\.(get|post|patch|put|delete)\("/.test(line));

    const routesWithoutExplicitMiddleware = routeLines.filter(
      (line) => !line.includes("requirePermission(") && !line.includes("requireCapability(")
    );

    expect(routeLines.length).toBeGreaterThanOrEqual(20);
    expect(routesWithoutExplicitMiddleware).toEqual([]);
  });
});
