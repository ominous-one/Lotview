import { readFileSync } from "fs";
import { resolve } from "path";

describe("appointment route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const appointmentsBlock = routesSource.match(
    /\/\/ ===== WS4E: Appointments \(canonical internal calendar\) =====[\s\S]*?\/\/ ===== WS4E: In-app notifications feed \+ email outbox audit =====/
  )?.[0];

  it("requires lead read permission and dealership context for appointment read surfaces", () => {
    [
      'app.get("/api/appointments", authMiddleware, requirePermission("leads.read"), requireDealership',
      'app.get("/api/appointments/:id", authMiddleware, requirePermission("leads.read"), requireDealership',
      `app.get('/api/follow-up-tasks', authMiddleware, requirePermission("leads.read"), requireDealership`,
    ].forEach((route) => expect(routesSource).toContain(route));
  });

  it("requires lead write permission and dealership context for appointment mutations", () => {
    [
      'app.post("/api/appointments", authMiddleware, requirePermission("leads.write"), requireDealership',
      'app.post("/api/appointments/:id/reschedule", authMiddleware, requirePermission("leads.write"), requireDealership',
      'app.post("/api/appointments/:id/cancel", authMiddleware, requirePermission("leads.write"), requireDealership',
      'app.post("/api/appointments/:id/request-reschedule", authMiddleware, requirePermission("leads.write"), requireDealership',
      'app.post("/api/appointments/:id/no-show", authMiddleware, requirePermission("leads.write"), requireDealership',
      'app.post("/api/appointments/:id/complete", authMiddleware, requirePermission("leads.write"), requireDealership',
      `app.post('/api/appointments/:id/follow-up/no-response', authMiddleware, requirePermission("leads.write"), requireDealership`,
    ].forEach((route) => expect(routesSource).toContain(route));
  });

  it("keeps appointment reassignment restricted to lead writers with manager-tier roles", () => {
    expect(routesSource).toContain(
      `app.post("/api/appointments/:id/reassign", authMiddleware, requirePermission("leads.write"), requireDealership, requireRole('master', 'manager', 'sales_manager')`
    );
  });

  it("rejects malformed appointment route ids before appointment storage or service calls", () => {
    expect(appointmentsBlock).toBeDefined();
    expect(routesSource).toContain("function requireAppointmentIdParam(req: Request, res: Response): string | null");
    expect(routesSource).toContain("const appointmentId = parseUuidRouteParam(req.params.id);");
    expect(routesSource).toContain('res.status(400).json({ error: "Appointment id must be a valid UUID" });');

    const helperUsages = appointmentsBlock?.match(/const id = requireAppointmentIdParam\(req, res\);/g) ?? [];
    expect(helperUsages).toHaveLength(8);
    expect(appointmentsBlock).toContain("if (!id) return;");
    expect(appointmentsBlock).not.toContain("const id = req.params.id");
  });

  it("does not partially parse appointment owner query filters", () => {
    expect(appointmentsBlock).toBeDefined();

    const ownerFilterParsers = appointmentsBlock?.match(
      /const ownerUserId = parseOptionalPositiveIntegerQueryParam\(req\.query\.ownerUserId, res, "ownerUserId"\);/g
    ) ?? [];
    expect(ownerFilterParsers).toHaveLength(2);
    expect(appointmentsBlock).toContain("if (ownerUserId === null) return;");
    expect(appointmentsBlock).not.toContain("parseInt(req.query.ownerUserId");
  });
});
