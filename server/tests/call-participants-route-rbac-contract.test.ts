import { readFileSync } from "fs";
import { resolve } from "path";

describe("call participants route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const callParticipantsBlock = routesSource.match(
    /\/\/ ===== CALL PARTICIPANTS =====[\s\S]*?\/\/ ====== SUPER ADMIN IMPERSONATION ======/
  )?.[0];

  it("requires explicit lead read permission, manager role, and dealership context", () => {
    expect(callParticipantsBlock).toBeDefined();
    expect(callParticipantsBlock).toContain(
      'app.get("/api/call-recordings/:callId/participants", authMiddleware, requirePermission("leads.read"), requireRole(\'manager\', \'admin\', \'master\', \'super_admin\'), requireDealership'
    );
    expect(callParticipantsBlock).not.toContain(
      'app.get("/api/call-recordings/:callId/participants", authMiddleware, async'
    );
  });

  it("verifies the parent call recording belongs to the resolved dealership before returning participants", () => {
    expect(callParticipantsBlock).toBeDefined();
    expect(callParticipantsBlock).toContain("const dealershipId = req.dealershipId!");
    expect(callParticipantsBlock).toContain("storage.getCallRecordingById(callId, dealershipId)");
    expect(callParticipantsBlock).toContain('return res.status(404).json({ error: "Call recording not found" })');
    expect(callParticipantsBlock).toContain("storage.getCallParticipants(callId)");
  });

  it("rejects malformed call recording ids before scoped participant reads", () => {
    expect(callParticipantsBlock).toBeDefined();
    expect(callParticipantsBlock).toContain("requireCallScoringCallIdParam(req, res)");
    expect(routesSource).toContain("function requireCallScoringCallIdParam(req: Request, res: Response): number | null");
    expect(routesSource).toContain('res.status(400).json({ error: "Call recording id must be a positive integer" })');
    expect(callParticipantsBlock).not.toContain("parseInt(req.params.callId");
  });
});
