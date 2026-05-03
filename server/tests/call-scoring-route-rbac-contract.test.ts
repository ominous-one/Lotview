import { readFileSync } from "fs";
import { resolve } from "path";

describe("call scoring route RBAC and tenant contracts", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const storageSource = readFileSync(resolve(process.cwd(), "server/storage.ts"), "utf8");
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

  it("requires dealership context and same-template criteria for scoring sheet responses", () => {
    expect(callScoringBlock).toBeDefined();

    [
      "storage.getCallScoringSheetWithResponses(callId)",
      "storage.getCallScoringSheet(callId)",
      "storage.updateCallScoringSheet(sheet.id, {",
      "storage.bulkUpsertCallScoringResponses(responsesWithSheetId)",
    ].forEach((unsafeCall) => expect(callScoringBlock).not.toContain(unsafeCall));

    [
      "storage.getCallScoringSheetWithResponses(callId, dealershipId)",
      "storage.getCallScoringSheet(callId, dealershipId)",
      "storage.updateCallScoringSheet(sheet.id, dealershipId, {",
      "storage.bulkUpsertCallScoringResponses(responsesWithSheetId, dealershipId)",
      'return res.status(404).json({ error: "Scoring response criterion not found" })',
    ].forEach((safeCall) => expect(callScoringBlock).toContain(safeCall));

    [
      "getCallScoringSheet(callRecordingId: number, dealershipId: number)",
      "getCallScoringSheetWithResponses(callRecordingId: number, dealershipId: number)",
      "updateCallScoringSheet(id: number, dealershipId: number, sheet: Partial<InsertCallScoringSheet>)",
      "getCallScoringResponses(sheetId: number, dealershipId: number)",
      "bulkUpsertCallScoringResponses(responses: InsertCallScoringResponse[], dealershipId: number)",
      "isCallScoringResponseScopedToDealerTemplate",
      "eq(callScoringCriteria.templateId, callScoringSheets.templateId)",
      "eq(callScoringSheets.dealershipId, dealershipId)",
    ].forEach((storageGuard) => expect(storageSource).toContain(storageGuard));
  });

  it("rejects malformed call scoring ids before scoped storage access", () => {
    expect(callScoringBlock).toBeDefined();

    [
      "function requireCallScoringTemplateIdParam(req: Request, res: Response, paramName = \"id\"): number | null",
      "function requireCallScoringCriterionIdParam(req: Request, res: Response): number | null",
      "function requireCallScoringCallIdParam(req: Request, res: Response): number | null",
      "function requireCallScoringResponseIdParam(req: Request, res: Response): number | null",
      'res.status(400).json({ error: "Call scoring template id must be a positive integer" })',
      'res.status(400).json({ error: "Call scoring criterion id must be a positive integer" })',
      'res.status(400).json({ error: "Call recording id must be a positive integer" })',
      'res.status(400).json({ error: "Call scoring response id must be a positive integer" })',
    ].forEach((guard) => expect(routesSource).toContain(guard));

    expect(callScoringBlock?.match(/requireCallScoringTemplateIdParam\(req, res/g)).toHaveLength(7);
    expect(callScoringBlock?.match(/requireCallScoringCriterionIdParam\(req, res\)/g)).toHaveLength(2);
    expect(callScoringBlock?.match(/requireCallScoringCallIdParam\(req, res\)/g)).toHaveLength(3);
    expect(callScoringBlock?.match(/requireCallScoringResponseIdParam\(req, res\)/g)).toHaveLength(1);
    expect(callScoringBlock).not.toContain("parseInt(req.params.");
  });
});
