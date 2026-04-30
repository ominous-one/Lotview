import { readFileSync } from "fs";
import { resolve } from "path";

describe("super-admin restart route RBAC contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const restartBlock = routesSource.match(
    /\/\/ Restart server endpoint - reloads API keys and configurations[\s\S]*?\/\/ Secrets password management/
  )?.[0];

  it("requires explicit admin audit permission and sensitive rate limiting", () => {
    expect(restartBlock).toBeDefined();

    expect(restartBlock).toContain(
      'app.post("/api/super-admin/restart-server", authMiddleware, requirePermission("admin.audit"), superAdminOnly, sensitiveLimiter'
    );
  });

  it("keeps restart requests audited before exiting the process", () => {
    expect(restartBlock).toBeDefined();

    expect(restartBlock).toContain("await storage.logAuditAction");
    expect(restartBlock).toContain("action: 'restart_server'");
    expect(restartBlock).toContain("resource: 'system'");
    expect(restartBlock).toContain("process.exit(0)");
  });
});
