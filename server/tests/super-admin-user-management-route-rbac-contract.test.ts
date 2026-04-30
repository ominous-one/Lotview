import { readFileSync } from "fs";
import { resolve } from "path";

describe("super-admin user management route RBAC contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const userManagementBlock = routesSource.match(
    /\/\/ Get all users across all dealerships[\s\S]*?\/\/ Get API keys for a specific dealership/
  )?.[0];

  it("requires users.manage before reading or mutating super-admin user records", () => {
    expect(userManagementBlock).toBeDefined();

    expect(userManagementBlock).toContain(
      'app.get("/api/super-admin/users", authMiddleware, requirePermission("users.manage"), superAdminOnly'
    );
    expect(userManagementBlock).toContain(
      'app.delete("/api/super-admin/users/:userId", authMiddleware, requirePermission("users.manage"), superAdminOnly'
    );
    expect(userManagementBlock).toContain(
      'app.patch("/api/super-admin/users/:userId/status", authMiddleware, requirePermission("users.manage"), superAdminOnly'
    );
    expect(userManagementBlock).toContain(
      'app.post("/api/super-admin/users/:userId/reset-password", authMiddleware, requirePermission("users.manage"), superAdminOnly, sensitiveLimiter'
    );
    expect(userManagementBlock).toContain(
      'app.patch("/api/super-admin/users/:userId", authMiddleware, requirePermission("users.manage"), superAdminOnly'
    );
  });

  it("requires users.invite before creating super-admin-managed users", () => {
    expect(userManagementBlock).toBeDefined();

    expect(userManagementBlock).toContain(
      'app.post("/api/super-admin/users", authMiddleware, requirePermission("users.invite"), superAdminOnly'
    );
  });

  it("keeps sensitive user management protections and audit actions", () => {
    expect(userManagementBlock).toBeDefined();

    expect(userManagementBlock).toContain('return res.status(400).json({ error: "Cannot delete your own account" })');
    expect(userManagementBlock).toContain('return res.status(400).json({ error: "Cannot deactivate your own account" })');
    expect(userManagementBlock).toContain('return res.status(403).json({ error: "Cannot delete super admin accounts" })');
    expect(userManagementBlock).toContain('return res.status(403).json({ error: "Cannot modify super admin accounts" })');
    expect(userManagementBlock).toContain('return res.status(403).json({ error: "Cannot promote users to super admin" })');
    expect(userManagementBlock).toContain("sensitiveLimiter");
    expect(userManagementBlock).toContain("user_created");
    expect(userManagementBlock).toContain('"DELETE_USER"');
    expect(userManagementBlock).toContain('"ACTIVATE_USER"');
    expect(userManagementBlock).toContain('"DEACTIVATE_USER"');
    expect(userManagementBlock).toContain('"RESET_USER_PASSWORD"');
    expect(userManagementBlock).toContain('"UPDATE_USER"');
  });
});
