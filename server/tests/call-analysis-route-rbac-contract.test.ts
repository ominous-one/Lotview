import { readFileSync } from "fs";
import { resolve } from "path";

describe("call analysis route RBAC and tenant contracts", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const storageSource = readFileSync(resolve(process.cwd(), "server/storage.ts"), "utf8");
  const callAnalysisBlock = routesSource.match(
    /\/\/ Get call recordings \(manager\/admin only\)[\s\S]*?\/\/ ===== CALL SCORING TEMPLATES =====/
  )?.[0];

  it("requires explicit lead read permission and dealership context for call analysis reads", () => {
    expect(callAnalysisBlock).toBeDefined();

    for (const route of [
      'app.get("/api/call-recordings", authMiddleware, requirePermission("leads.read"),',
      'app.get("/api/call-recordings/stats", authMiddleware, requirePermission("leads.read"),',
      'app.get("/api/call-recordings/:id", authMiddleware, requirePermission("leads.read"),',
      'app.get("/api/call-analysis-criteria", authMiddleware, requirePermission("leads.read"),',
    ]) {
      expect(callAnalysisBlock).toContain(route);
    }

    const readRouteCount = (callAnalysisBlock?.match(/requirePermission\("leads\.read"\)/g) ?? []).length;
    expect(readRouteCount).toBe(4);
  });

  it("requires explicit lead write permission and dealership context for call analysis mutations", () => {
    expect(callAnalysisBlock).toBeDefined();

    for (const route of [
      'app.post("/api/call-recordings/:id/analyze", authMiddleware, requirePermission("leads.write"),',
      'app.post("/api/call-recordings/:id/review", authMiddleware, requirePermission("leads.write"),',
      'app.post("/api/call-analysis-criteria", authMiddleware, requirePermission("leads.write"),',
      'app.patch("/api/call-analysis-criteria/:id", authMiddleware, requirePermission("leads.write"),',
      'app.delete("/api/call-analysis-criteria/:id", authMiddleware, requirePermission("leads.write"),',
      'app.post("/api/call-analysis-criteria/seed-defaults", authMiddleware, requirePermission("leads.write"),',
    ]) {
      expect(callAnalysisBlock).toContain(route);
    }

    const dealershipContextCount = (callAnalysisBlock?.match(/requireDealership/g) ?? []).length;
    expect(dealershipContextCount).toBe(10);
  });

  it("uses the resolved dealership context for call analysis storage access", () => {
    expect(callAnalysisBlock).toBeDefined();
    expect(callAnalysisBlock).toContain("const dealershipId = req.dealershipId!");
    expect(callAnalysisBlock).not.toContain("requireResolvedDealershipId(req)");
    expect(callAnalysisBlock).not.toContain("const dealershipId = req.dealershipId;");
    expect(callAnalysisBlock).toContain("storage.getCallRecordings(");
    expect(callAnalysisBlock).toContain("storage.getCallRecordingById(id, dealershipId)");
    expect(callAnalysisBlock).toContain("storage.updateCallRecording(id, dealershipId");
    expect(callAnalysisBlock).toContain("storage.getCallAnalysisCriteria(dealershipId)");
    expect(callAnalysisBlock).toContain("storage.createCallAnalysisCriteria({");
    expect(callAnalysisBlock).not.toContain("storage.updateCallAnalysisCriteria(id, dealershipId, req.body)");
    expect(callAnalysisBlock).toContain("storage.updateCallAnalysisCriteria(id, dealershipId, updates)");
    expect(callAnalysisBlock).toContain("storage.deleteCallAnalysisCriteria(id, dealershipId)");
  });

  it("rejects malformed call analysis ids before scoped storage access", () => {
    expect(callAnalysisBlock).toBeDefined();
    expect(routesSource).toContain("function requireCallRecordingIdParam(req: Request, res: Response): number | null");
    expect(routesSource).toContain("function requireCallAnalysisCriteriaIdParam(req: Request, res: Response): number | null");
    expect(routesSource).toContain('res.status(400).json({ error: "Call recording id must be a positive integer" })');
    expect(routesSource).toContain('res.status(400).json({ error: "Call analysis criteria id must be a positive integer" })');
    expect(callAnalysisBlock?.match(/requireCallRecordingIdParam\(req, res\)/g)).toHaveLength(3);
    expect(callAnalysisBlock?.match(/requireCallAnalysisCriteriaIdParam\(req, res\)/g)).toHaveLength(2);
    expect(callAnalysisBlock).not.toContain("parseInt(req.params.id");
  });

  it("strips immutable tenant ownership fields before call analysis criteria updates", () => {
    expect(callAnalysisBlock).toContain("const updates = stripTenantOwnershipFields(req.body ?? {})");
    expect(storageSource).toContain(".set({ ...stripTenantOwnershipFields(criteria), updatedAt: new Date() })");
  });
});
