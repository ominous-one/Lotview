import { readFileSync } from "fs";
import { resolve } from "path";

describe("AI runtime route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const publicChatBlock = routesSource.match(
    /\/\/ Chat endpoint for AI responses[\s\S]*?\/\/ AI suggest reply for conversations/
  )?.[0];
  const aiPaymentsBlock = routesSource.match(
    /\/\/ AI Payment Calculator - Calculate payment options for a vehicle[\s\S]*?\/\/ Save conversation \(public - conversations are saved automatically\)/
  )?.[0];

  it("requires dealership context for public chat generation", () => {
    expect(routesSource).toContain('app.post("/api/chat", requireDealership');
  });

  it("requires scoped vehicle proof before public chat can ground AI on a vehicle id", () => {
    expect(publicChatBlock).toBeDefined();
    expect(publicChatBlock).toContain('const parsedVehicleId = parseOptionalPositiveIntegerBodyValue(vehicleId, res, "vehicleId");');
    expect(publicChatBlock).toContain("if (parsedVehicleId === null) return;");
    expect(publicChatBlock).toContain("const scopedVehicle = await storage.getVehicleById(parsedVehicleId, finalDealershipId);");
    expect(publicChatBlock).toContain('return res.status(404).json({ error: "Vehicle not found" });');
    expect(publicChatBlock).toContain("parsedVehicleId !== undefined ? undefined : vehicleContext");
    expect(publicChatBlock).toContain("parsedVehicleId");
    expect(publicChatBlock).not.toContain("typeof vehicleId === 'number' ? vehicleId : undefined");
  });

  it("requires AI use permission and dealership context for AI generation actions", () => {
    expect(routesSource).toContain(
      'app.post("/api/ai/suggest-reply", authMiddleware, requirePermission("ai.use"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/ai/respond", authMiddleware, requirePermission("ai.use"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/ai/follow-up", authMiddleware, requirePermission("ai.use"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/ai/payments/:vehicleId", authMiddleware, requirePermission("ai.use"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/ai/conversations", authMiddleware, requirePermission("ai.use"), requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership'
    );
  });

  it("requires AI configure permission and dealership context for AI settings", () => {
    expect(routesSource).toContain(
      'app.get("/api/ai-settings", authMiddleware, requirePermission("ai.configure"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.put("/api/ai-settings", authMiddleware, requirePermission("ai.configure"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/ai-settings/test", authMiddleware, requirePermission("ai.configure"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
  });

  it("fails closed on malformed AI payment vehicle and credit score parameters", () => {
    expect(aiPaymentsBlock).toBeDefined();
    expect(routesSource).toContain("function requireVehicleIdPathParam(req: Request, res: Response, paramName = \"vehicleId\"): number | null");
    expect(routesSource).toContain("function parseOptionalCreditScoreQueryParam(value: unknown, res: Response): number | null | undefined");
    expect(routesSource).toContain("creditScore must be an integer between 300 and 850");
    expect(aiPaymentsBlock).toContain("const vehicleId = requireVehicleIdPathParam(req, res)");
    expect(aiPaymentsBlock).toContain("const creditScore = parseOptionalCreditScoreQueryParam(req.query.creditScore, res)");
    expect(aiPaymentsBlock).not.toContain("const vehicleId = parseInt(req.params.vehicleId)");
    expect(aiPaymentsBlock).not.toContain("parseInt(req.query.creditScore as string)");
  });
});
