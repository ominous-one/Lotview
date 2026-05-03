import { readFileSync } from "fs";
import { resolve } from "path";

describe("financing and fee settings route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const storageSource = readFileSync(resolve(process.cwd(), "server/storage.ts"), "utf8");
  const financingAndFeeBlock = routesSource.match(
    /\/\/ Update credit score tier[\s\S]*?\/\/ ===== DEALERSHIP CONTACTS\/WEBSITE ROUTES =====/
  )?.[0];

  it("requires billing read permission and dealership context for financing setting reads", () => {
    expect(routesSource).toContain(
      'app.get("/api/financing/credit-tiers", authMiddleware, requirePermission("billing.read"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/financing/model-year-terms", authMiddleware, requirePermission("billing.read"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/dealership-fees", authMiddleware, requirePermission("billing.read"), requireRole("master"), requireDealership'
    );
  });

  it("requires billing write permission and dealership context for financing setting mutations", () => {
    expect(routesSource).toContain(
      'app.post("/api/financing/credit-tiers", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.patch("/api/financing/credit-tiers/:id", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.delete("/api/financing/credit-tiers/:id", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/financing/model-year-terms", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.patch("/api/financing/model-year-terms/:id", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.delete("/api/financing/model-year-terms/:id", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/dealership-fees", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.patch("/api/dealership-fees/:id", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.delete("/api/dealership-fees/:id", authMiddleware, requirePermission("billing.write"), requireRole("master"), requireDealership'
    );
  });

  it("strips immutable tenant ownership fields before financing and fee setting updates", () => {
    expect(routesSource).toContain("const TENANT_OWNERSHIP_FIELDS = new Set");
    expect(routesSource).not.toContain("storage.updateCreditScoreTier(id, dealershipId, req.body)");
    expect(routesSource).not.toContain("storage.updateModelYearTerm(id, dealershipId, req.body)");
    expect(routesSource).not.toContain("storage.updateDealershipFee(id, dealershipId, req.body)");

    expect(routesSource).toContain("storage.updateCreditScoreTier(id, dealershipId, updates)");
    expect(routesSource).toContain("storage.updateModelYearTerm(id, dealershipId, updates)");
    expect(routesSource).toContain("storage.updateDealershipFee(id, dealershipId, updates)");

    expect(storageSource).toContain(".set({ ...stripTenantOwnershipFields(tier), updatedAt: new Date() })");
    expect(storageSource).toContain(".set({ ...stripTenantOwnershipFields(term), updatedAt: new Date() })");
    expect(storageSource).toContain(".set({ ...stripTenantOwnershipFields(fee), updatedAt: new Date() })");
  });

  it("requires strict positive IDs before financing and fee setting storage mutations", () => {
    expect(financingAndFeeBlock).toBeDefined();
    expect(routesSource).toContain("function requireBillingSettingIdParam");

    const idGuardCalls = financingAndFeeBlock?.match(/requireBillingSettingIdParam\(req, res\)/g) ?? [];
    expect(idGuardCalls).toHaveLength(6);
    expect(financingAndFeeBlock).not.toContain("parseInt(req.params.id)");
  });
});
