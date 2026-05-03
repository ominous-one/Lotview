import { readFileSync } from "fs";
import { resolve } from "path";

describe("legacy conversation route tenant and RBAC contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const saveConversationBlock = routesSource.match(
    /\/\/ Save conversation \(public - conversations are saved automatically\)[\s\S]*?\/\/ Get all conversations/
  )?.[0];

  it("requires dealership context before saving public conversations", () => {
    expect(routesSource).toContain('app.post("/api/conversations", requireDealership');
  });

  it("requires strict scoped vehicle proof before saving public conversation vehicle links", () => {
    expect(saveConversationBlock).toBeDefined();
    expect(routesSource).toContain("function parseOptionalPositiveIntegerBodyValue(value: unknown, res: Response, label: string)");
    expect(saveConversationBlock).toContain('const parsedVehicleId = parseOptionalPositiveIntegerBodyValue(vehicleId, res, "vehicleId");');
    expect(saveConversationBlock).toContain("if (parsedVehicleId === null) return;");
    expect(saveConversationBlock).toContain("const scopedVehicle = await storage.getVehicleById(parsedVehicleId, dealershipId);");
    expect(saveConversationBlock).toContain('return res.status(404).json({ error: "Vehicle not found" });');
    expect(saveConversationBlock).toContain("vehicleId: parsedVehicleId ?? null");
    expect(saveConversationBlock).not.toContain("vehicleId: vehicleId || null");
  });

  it("derives public conversation vehicle names from the scoped vehicle when a vehicle id is linked", () => {
    expect(saveConversationBlock).toBeDefined();
    expect(saveConversationBlock).toContain("scopedVehicleName = [scopedVehicle.year, scopedVehicle.make, scopedVehicle.model, scopedVehicle.trim]");
    expect(saveConversationBlock).toContain("vehicleName: scopedVehicleName");
    expect(saveConversationBlock).not.toContain("vehicleName: vehicleName || null");
  });

  it("requires message read permission, role floor, and dealership context for conversation reads", () => {
    expect(routesSource).toContain(
      'app.get("/api/conversations", authMiddleware, requirePermission("messages.read"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/conversations/:id", authMiddleware, requirePermission("messages.read"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
  });

  it("requires message permission, role floor, and dealership context for messenger routes", () => {
    expect(routesSource).toContain(
      'app.get("/api/messenger-conversations", authMiddleware, requirePermission("messages.read"), requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/messenger-conversations/:id/reply", authMiddleware, requirePermission("messages.write"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/messenger-conversations/:id/messages", authMiddleware, requirePermission("messages.read"), requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/messenger-conversations/:id/assign", authMiddleware, requirePermission("messages.write"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/salespeople", authMiddleware, requirePermission("messages.read"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
  });

  it("requires explicit permissions and dealership context for messenger AI controls", () => {
    expect(routesSource).toContain(
      'app.post("/api/messenger-conversations/:id/toggle-ai", authMiddleware, requirePermission("ai.configure"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/messenger-conversations/:id/toggle-watch-mode", authMiddleware, requirePermission("messages.write"), requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.patch("/api/messenger-conversations/:id/metadata", authMiddleware, requirePermission("messages.write"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.patch("/api/messenger-messages/:id/training", authMiddleware, requirePermission("ai.configure"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
  });

  it("requires message write permission, role floor, and dealership context for outbound conversation messages", () => {
    expect(routesSource).toContain(
      'app.post("/api/conversations/:id/fwc-message", authMiddleware, requirePermission("messages.write"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/conversations/:id/send-message", authMiddleware, requirePermission("messages.write"), requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership'
    );
  });

  it("requires message permissions, role floor, and dealership context for combined and scheduled message routes", () => {
    expect(routesSource).toContain(
      'app.get("/api/all-conversations", authMiddleware, requirePermission("messages.read"), requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/messenger-conversations/:id/scheduled", authMiddleware, requirePermission("messages.read"), requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/scheduled-messages", authMiddleware, requirePermission("messages.read"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/scheduled-messages/:id/cancel", authMiddleware, requirePermission("messages.write"), requireRole("manager", "admin", "master", "super_admin"), requireDealership'
    );
  });

  it("does not perform ad hoc header tenant selection inside conversation read routes", () => {
    const conversationReadSection = routesSource.slice(
      routesSource.indexOf("// Get all conversations"),
      routesSource.indexOf("// ===== MESSENGER CONVERSATIONS ROUTES ====="),
    );

    expect(conversationReadSection).not.toContain("x-dealership-id");
    expect(conversationReadSection).not.toContain("headerDealershipId");
  });

  it("uses strict positive integer parsing for conversation and message route ids", () => {
    const conversationRouteSection = routesSource.slice(
      routesSource.indexOf("// Get conversation by ID"),
      routesSource.indexOf("// ===== CHAT PROMPT ROUTES ====="),
    );

    expect(routesSource).toContain("function requireConversationIdParam(req: Request, res: Response): number | null");
    expect(routesSource).toContain("function requireMessageIdParam(req: Request, res: Response): number | null");
    expect(routesSource).toContain("const conversationId = parsePositiveIntegerId(req.params.id);");
    expect(routesSource).toContain("const messageId = parsePositiveIntegerId(req.params.id);");
    expect(conversationRouteSection).not.toContain("parseInt(req.params.id)");
    expect(conversationRouteSection).not.toContain("Number.parseInt(req.params.id");
  });
});
