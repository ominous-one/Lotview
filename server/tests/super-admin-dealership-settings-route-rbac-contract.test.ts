import { readFileSync } from "fs";
import { resolve } from "path";

describe("super-admin dealership and settings route RBAC contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const dealershipSettingsBlock = routesSource.match(
    /\/\/ Get all dealerships \(super admin only\)[\s\S]*?\/\/ Get audit logs \(super admin only\)/
  )?.[0];

  it("requires tenant management capability before reading or mutating dealerships", () => {
    expect(dealershipSettingsBlock).toBeDefined();

    expect(dealershipSettingsBlock).toContain(
      'app.get("/api/super-admin/dealerships", authMiddleware, requireCapability("tenant.manage"), superAdminOnly'
    );
    expect(dealershipSettingsBlock).toContain(
      'app.get("/api/super-admin/dealerships/:dealershipId", authMiddleware, requireCapability("tenant.manage"), superAdminOnly'
    );
    expect(dealershipSettingsBlock).toContain(
      'app.post("/api/super-admin/dealerships", authMiddleware, requireCapability("tenant.manage"), requirePermission("users.invite"), superAdminOnly'
    );
    expect(dealershipSettingsBlock).toContain(
      'app.patch("/api/super-admin/dealerships/:dealershipId", authMiddleware, requireCapability("tenant.manage"), requirePermission("users.manage"), superAdminOnly'
    );
  });

  it("requires explicit admin/settings permissions before global settings access", () => {
    expect(dealershipSettingsBlock).toBeDefined();

    expect(dealershipSettingsBlock).toContain(
      'app.get("/api/super-admin/global-settings", authMiddleware, requirePermission("admin.audit"), superAdminOnly'
    );
    expect(dealershipSettingsBlock).toContain(
      'app.put("/api/super-admin/global-settings/:key", authMiddleware, requireCapability("tenant.settings.write"), superAdminOnly'
    );
    expect(dealershipSettingsBlock).toContain(
      'app.delete("/api/super-admin/global-settings/:key", authMiddleware, requireCapability("tenant.settings.write"), superAdminOnly'
    );
  });

  it("keeps sensitive dealership and global settings mutations audited", () => {
    expect(dealershipSettingsBlock).toBeDefined();

    expect(dealershipSettingsBlock).toContain('"CREATE_DEALERSHIP"');
    expect(dealershipSettingsBlock).toContain('"UPDATE_DEALERSHIP"');
    expect(dealershipSettingsBlock).toContain('"UPDATE_GLOBAL_SETTING"');
    expect(dealershipSettingsBlock).toContain('"DELETE_GLOBAL_SETTING"');
    expect(dealershipSettingsBlock).toContain("await storage.logAuditAction");
  });
});
