import { readFileSync } from "fs";
import { resolve } from "path";

describe("external token route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const externalTokenBlock = routesSource.match(
    /\/\/ ===== EXTERNAL API TOKENS \(for n8n and other integrations\) =====[\s\S]*?\/\/ ===== VEHICLE IMPORT API \(for n8n\) =====/
  )?.[0];

  it("requires explicit integration permissions for super-admin token management", () => {
    expect(externalTokenBlock).toBeDefined();

    expect(externalTokenBlock).toContain(
      'app.get("/api/external-tokens", authMiddleware, requirePermission("integrations.read"), requireRole("super_admin")'
    );
    expect(externalTokenBlock).toContain(
      'app.post("/api/external-tokens", authMiddleware, requirePermission("integrations.write"), requireRole("super_admin")'
    );
    expect(externalTokenBlock).toContain(
      'app.delete("/api/external-tokens/:id", authMiddleware, requirePermission("integrations.write"), requireRole("super_admin")'
    );
  });

  it("requires explicit dealership selection before token reads, writes, and deletes", () => {
    expect(externalTokenBlock).toBeDefined();

    expect(externalTokenBlock).toContain("const parseDealershipId = (value: string | number | undefined | null): number | null => {");
    expect(externalTokenBlock).toContain("Missing or invalid dealershipId. Please select a dealership.");
    expect(externalTokenBlock).toContain("const dealership = await storage.getDealership(dealershipId)");
    expect(externalTokenBlock).toContain("await storage.getExternalApiTokens(dealershipId)");
    expect(externalTokenBlock).toContain("await storage.createExternalApiToken({");
    expect(externalTokenBlock).toContain("await storage.deleteExternalApiToken(id, dealershipId)");
  });

  it("does not expose stored token hashes in list responses", () => {
    expect(externalTokenBlock).toBeDefined();

    const listRoute = externalTokenBlock?.match(
      /app\.get\("\/api\/external-tokens"[\s\S]*?app\.post\("\/api\/external-tokens"/
    )?.[0];
    expect(listRoute).toBeDefined();
    expect(listRoute).toContain("const safeTokens = tokens.map");
    expect(listRoute).toContain("tokenPrefix: t.tokenPrefix");
    expect(listRoute).not.toContain("tokenHash: t.tokenHash");
  });
});
