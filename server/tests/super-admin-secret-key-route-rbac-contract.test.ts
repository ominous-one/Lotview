import { readFileSync } from "fs";
import { resolve } from "path";

describe("super-admin secret and API key route RBAC contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const superAdminBlock = routesSource.match(
    /\/\/ ===== SUPER ADMIN ROUTES \(Super Admin Only\) =====[\s\S]*?\/\/ ===== BROWSERLESS SCRAPING ROUTES =====/
  )?.[0];

  it("requires explicit integration permissions for secrets password management", () => {
    expect(superAdminBlock).toBeDefined();

    expect(superAdminBlock).toContain(
      'app.get("/api/super-admin/secrets/password-status", authMiddleware, requirePermission("integrations.read"), superAdminOnly'
    );
    expect(superAdminBlock).toContain(
      'app.post("/api/super-admin/secrets/verify-password", authMiddleware, requirePermission("integrations.read"), superAdminOnly'
    );
    expect(superAdminBlock).toContain(
      'app.post("/api/super-admin/secrets/set-password", authMiddleware, requirePermission("integrations.write"), superAdminOnly'
    );
    expect(superAdminBlock).toContain(
      'app.get("/api/super-admin/secrets/all-api-keys", authMiddleware, requirePermission("integrations.read"), superAdminOnly'
    );
  });

  it("keeps the secondary secrets password gate before returning all API keys", () => {
    expect(superAdminBlock).toBeDefined();

    const allKeysRoute = superAdminBlock?.match(
      /app\.get\("\/api\/super-admin\/secrets\/all-api-keys"[\s\S]*?\/\/ Get all dealerships \(super admin only\)/
    )?.[0];
    expect(allKeysRoute).toBeDefined();
    expect(allKeysRoute).toContain("const secretsPassword = req.headers['x-secrets-password'] as string;");
    expect(allKeysRoute).toContain('return res.status(401).json({ error: "Secrets password required" });');
    expect(allKeysRoute).toContain("const isValid = await bcrypt.compare(secretsPassword, config.value);");
    expect(allKeysRoute).toContain('return res.status(401).json({ error: "Invalid secrets password" });');
  });

  it("requires explicit integration permissions for dealership API key reads and writes", () => {
    expect(superAdminBlock).toBeDefined();

    expect(superAdminBlock).toContain(
      'app.get("/api/super-admin/dealerships/:dealershipId/api-keys", authMiddleware, requirePermission("integrations.read"), superAdminOnly'
    );
    expect(superAdminBlock).toContain(
      'app.patch("/api/super-admin/dealerships/:dealershipId/api-keys", authMiddleware, requirePermission("integrations.write"), superAdminOnly'
    );
  });

  it("requires integration write permission before exercising stored provider credentials", () => {
    expect(superAdminBlock).toBeDefined();

    for (const route of [
      "test-openai",
      "test-facebook",
      "test-ghl",
      "test-marketcheck",
      "test-apify",
      "test-gemini",
    ]) {
      expect(superAdminBlock).toContain(
        `app.post("/api/super-admin/dealerships/:dealershipId/${route}", authMiddleware, requirePermission("integrations.write"), superAdminOnly`
      );
    }
  });

  it("audits secrets password and API key updates", () => {
    expect(superAdminBlock).toBeDefined();

    expect(superAdminBlock).toContain("action: existingConfig ? 'update_secrets_password' : 'set_secrets_password'");
    expect(superAdminBlock).toContain('action: "UPDATE_DEALERSHIP_API_KEYS"');
    expect(superAdminBlock).toContain("await storage.logAuditAction");
  });
});
