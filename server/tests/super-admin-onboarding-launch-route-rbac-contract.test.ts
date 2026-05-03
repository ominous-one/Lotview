import { readFileSync } from "fs";
import { resolve } from "path";

describe("super-admin onboarding and launch checklist route RBAC contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const onboardingLaunchBlock = routesSource.match(
    /\/\/ ===== SUPER ADMIN ONBOARDING ROUTES =====[\s\S]*?\/\/ ===== USER MANAGEMENT ROUTES/
  )?.[0];

  it("requires tenant management and user invite permission for onboarding setup", () => {
    expect(onboardingLaunchBlock).toBeDefined();

    expect(onboardingLaunchBlock).toContain(
      'app.post("/api/super-admin/onboarding/validate", authMiddleware, requireCapability("tenant.manage"), requirePermission("users.invite"), superAdminOnly'
    );
    expect(onboardingLaunchBlock).toContain(
      'app.post("/api/super-admin/onboarding/start", authMiddleware, requireCapability("tenant.manage"), requirePermission("users.invite"), superAdminOnly, sensitiveLimiter'
    );
  });

  it("requires admin audit permission for onboarding run reads", () => {
    expect(onboardingLaunchBlock).toBeDefined();

    expect(onboardingLaunchBlock).toContain(
      'app.get("/api/super-admin/onboarding/runs/:runId", authMiddleware, requirePermission("admin.audit"), superAdminOnly'
    );
    expect(onboardingLaunchBlock).toContain(
      'app.get("/api/super-admin/onboarding/runs", authMiddleware, requirePermission("admin.audit"), superAdminOnly'
    );
  });

  it("requires tenant management before reading or mutating launch checklists", () => {
    expect(onboardingLaunchBlock).toBeDefined();

    [
      'app.get("/api/super-admin/dealerships/:dealershipId/launch-checklist", authMiddleware, requireCapability("tenant.manage"), superAdminOnly',
      'app.get("/api/super-admin/dealerships/:dealershipId/launch-checklist/progress", authMiddleware, requireCapability("tenant.manage"), superAdminOnly',
      'app.post("/api/super-admin/dealerships/:dealershipId/launch-checklist/:itemId/complete", authMiddleware, requireCapability("tenant.manage"), superAdminOnly',
      'app.post("/api/super-admin/dealerships/:dealershipId/launch-checklist/:itemId/skip", authMiddleware, requireCapability("tenant.manage"), superAdminOnly',
      'app.patch("/api/super-admin/dealerships/:dealershipId/launch-checklist/:itemId", authMiddleware, requireCapability("tenant.manage"), superAdminOnly',
    ].forEach((routeContract) => {
      expect(onboardingLaunchBlock).toContain(routeContract);
    });
  });

  it("keeps one-click onboarding audited", () => {
    expect(onboardingLaunchBlock).toBeDefined();

    expect(onboardingLaunchBlock).toContain("await storage.logAuditAction");
    expect(onboardingLaunchBlock).toContain("action: 'onboard_dealership'");
    expect(onboardingLaunchBlock).toContain("resource: 'dealership'");
  });

  it("does not partially parse onboarding run or launch checklist item ids", () => {
    expect(onboardingLaunchBlock).toBeDefined();
    expect(routesSource).toContain("function requireOnboardingRunIdParam(req: Request, res: Response): number | null");
    expect(routesSource).toContain("function requireLaunchChecklistItemIdParam(req: Request, res: Response): number | null");
    expect(onboardingLaunchBlock).toContain("const runId = requireOnboardingRunIdParam(req, res)");
    expect(onboardingLaunchBlock).toContain("const itemId = requireLaunchChecklistItemIdParam(req, res)");
    expect(onboardingLaunchBlock).not.toContain("parseInt(req.params.runId)");
    expect(onboardingLaunchBlock).not.toContain("parseInt(req.params.itemId)");
  });
});
