import { readFileSync } from "fs";
import { resolve } from "path";

describe("super-admin impersonation route RBAC contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const impersonationBlock = routesSource.match(
    /\/\/ ====== SUPER ADMIN IMPERSONATION ======[\s\S]*?const httpServer = createServer/
  )?.[0];

  it("requires explicit impersonation permission for starting and viewing active sessions", () => {
    expect(impersonationBlock).toBeDefined();

    expect(impersonationBlock).toContain(
      'app.post("/api/super-admin/impersonate", authMiddleware, requirePermission("admin.impersonate"), superAdminOnly'
    );
    expect(impersonationBlock).toContain(
      'app.get("/api/super-admin/impersonate/active", authMiddleware, requirePermission("admin.impersonate"), superAdminOnly'
    );
  });

  it("requires explicit audit permission before reading impersonation history", () => {
    expect(impersonationBlock).toBeDefined();

    expect(impersonationBlock).toContain(
      'app.get("/api/super-admin/impersonation-history", authMiddleware, requirePermission("admin.audit"), superAdminOnly'
    );
  });

  it("preserves impersonated-token session end while permission-checking super-admin manual ends", () => {
    expect(impersonationBlock).toBeDefined();

    expect(impersonationBlock).toContain(
      'app.post("/api/super-admin/impersonate/end", authMiddleware, sensitiveLimiter, async'
    );
    expect(impersonationBlock).toContain(
      'const canManageImpersonation = req.user?.role ? hasPermission(req.user.role, "admin.impersonate") : false;'
    );
    expect(impersonationBlock).toContain(
      "if (decoded?.isImpersonating && decoded?.impersonationSessionId && decoded?.impersonatedBy)"
    );
    expect(impersonationBlock).toContain(
      "req.user?.role === 'super_admin' && canManageImpersonation && Number.isFinite(requestedSessionId)"
    );
  });

  it("audits impersonation start and end events", () => {
    expect(impersonationBlock).toBeDefined();

    expect(impersonationBlock).toContain("action: 'impersonate_start'");
    expect(impersonationBlock).toContain("action: 'impersonate_end'");
    expect(impersonationBlock).toContain("await storage.logAuditAction");
  });

  it("keeps all other super-admin routes behind explicit permission or capability middleware", () => {
    const routeLines = routesSource
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /app\.(get|post|patch|put|delete)\("\/api\/super-admin/.test(line));

    const routesWithoutExplicitMiddleware = routeLines.filter(
      (line) => !line.includes("requirePermission(") && !line.includes("requireCapability(")
    );

    expect(routeLines.length).toBeGreaterThanOrEqual(90);
    expect(routesWithoutExplicitMiddleware).toEqual([
      'app.post("/api/super-admin/impersonate/end", authMiddleware, sensitiveLimiter, async (req: AuthRequest, res) => {',
    ]);
  });
});
