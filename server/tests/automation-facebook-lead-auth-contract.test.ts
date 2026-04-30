import { readFileSync } from "fs";
import { resolve } from "path";

describe("automation Facebook lead auth contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const routeStart = routesSource.indexOf('app.post("/api/automation/facebook-lead"');
  const routeEnd = routesSource.indexOf("// Get automation logs", routeStart);
  const routeSource = routesSource.slice(routeStart, routeEnd);

  it("does not trust tenant context alone as authentication", () => {
    expect(routeSource).toContain("Tenant middleware context by itself is not authentication for this write path.");
    expect(routeSource).toContain("if (!req.headers.authorization?.startsWith('Bearer '))");
    expect(routeSource).not.toContain("if ((req as any).dealershipId)");
    expect(routeSource).not.toContain("dealershipId = (req as any).dealershipId");
  });

  it("allows active manager-tier staff JWTs with message write permission", () => {
    expect(routeSource).toContain("const decoded = verifyToken(fullToken);");
    expect(routeSource).toContain("const user = await storage.getUserById(decoded.id);");
    expect(routeSource).toContain("if (!user || !user.isActive)");
    expect(routeSource).toContain(
      `if (!hasPermission(user.role, "messages.write") || !hasRole(user.role, 'manager', 'admin', 'master', 'super_admin'))`
    );
    expect(routeSource).toContain("dealershipId = parseDealershipIdParam(bodyDealershipId);");
    expect(routeSource).toContain("dealershipId = user.dealershipId ?? null;");
  });

  it("allows active external API tokens with automation trigger permission", () => {
    expect(routesSource).toContain(
      `const validPerms = ["import:vehicles", "read:vehicles", "update:vehicles", "delete:vehicles", "automation:trigger"];`
    );
    expect(routeSource).toContain("const prefixMatch = fullToken.match(/^(oag_[a-z0-9]+_)/);");
    expect(routeSource).toContain("const tokenData = await storage.getExternalApiTokenByPrefix(tokenPrefix);");
    expect(routeSource).toContain("if (!tokenData.isActive)");
    expect(routeSource).toContain("if (tokenData.expiresAt && tokenData.expiresAt < new Date())");
    expect(routeSource).toContain("const isValid = await comparePassword(fullToken, tokenData.tokenHash);");
    expect(routeSource).toContain("isValid && tokenData.permissions.includes('automation:trigger')");
    expect(routeSource).toContain("dealershipId = tokenData.dealershipId;");
    expect(routeSource).toContain("await storage.updateExternalApiTokenLastUsed(tokenData.id);");
  });
});
