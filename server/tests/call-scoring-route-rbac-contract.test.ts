import { readFileSync } from "fs";
import { resolve } from "path";

describe("call scoring route RBAC and tenant contracts", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const callScoringBlock = routesSource.match(
    /\/\/ ===== CALL SCORING TEMPLATES =====[\s\S]*?\/\/ ===== CALL PARTICIPANTS =====/
  )?.[0];

  it("requires explicit read permissions and dealership context for call scoring reads", () => {
    expect(callScoringBlock).toBeDefined();

    for (const route of [
      'app.get("/api/call-scoring/templates", authMiddleware, requirePermission("leads.read"), requireDealership',
      'app.get("/api/call-scoring/templates/:id", authMiddleware, requirePermission("leads.read"), requireDealership',
      'app.get("/api/call-scoring/templates/:templateId/criteria", authMiddleware, requirePermission("leads.read"), requireDealership',
      'app.get("/api/call-recordings/:callId/scoring", authMiddleware, requirePermission("leads.read"), requireDealership',
    ]) {
      expect(callScoringBlock).toContain(route);
    }
  });

  it("requires explicit write permissions and dealership context for call scoring mutations", () => {
    expect(callScoringBlock).toBeDefined();

    for (const route of [
      'app.post("/api/call-scoring/templates", authMiddleware, requirePermission("leads.write"),',
      'app.post("/api/call-scoring/templates/:id/clone", authMiddleware, requirePermission("leads.write"),',
      'app.patch("/api/call-scoring/templates/:id", authMiddleware, requirePermission("leads.write"),',
      'app.delete("/api/call-scoring/templates/:id", authMiddleware, requirePermission("leads.write"),',
      'app.post("/api/call-scoring/templates/:templateId/criteria", authMiddleware, requirePermission("leads.write"),',
      'app.patch("/api/call-scoring/criteria/:id", authMiddleware, requirePermission("leads.write"),',
      'app.delete("/api/call-scoring/criteria/:id", authMiddleware, requirePermission("leads.write"),',
      'app.post("/api/call-scoring/templates/:templateId/criteria/reorder", authMiddleware, requirePermission("leads.write"),',
      'app.post("/api/call-recordings/:callId/scoring", authMiddleware, requirePermission("leads.write"),',
      'app.patch("/api/call-scoring/responses/:id", authMiddleware, requirePermission("leads.write"),',
      'app.post("/api/call-recordings/:callId/scoring/responses", authMiddleware, requirePermission("leads.write"),',
    ]) {
      expect(callScoringBlock).toContain(route);
    }

    expect(callScoringBlock).not.toContain("req.dealershipId || req.user?.dealershipId");
  });

  it("blocks cross-tenant call scoring access by route-controlled dealership context", () => {
    expect(callScoringBlock).toBeDefined();
    expect(routesSource).toContain("async function getCallScoringCriterionTemplateScope");
    expect(callScoringBlock).toContain("const dealershipId = req.dealershipId!");
    expect(callScoringBlock).toContain("template.dealershipId !== dealershipId");
    expect(callScoringBlock).toContain("sourceTemplate.dealershipId !== dealershipId");
    expect(callScoringBlock).toContain("criterionScope.templateDealershipId !== dealershipId");
    expect(callScoringBlock).toContain("result.sheet.dealershipId !== dealershipId");
    expect(callScoringBlock).toContain("sheet.dealershipId !== dealershipId");
    expect(callScoringBlock).toContain("responseWithSheet[0].sheetDealershipId !== dealershipId");
    expect(callScoringBlock).toContain("storage.getCallRecordingById(callId, dealershipId)");
  });
});
