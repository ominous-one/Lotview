import { readFileSync } from "fs";
import { resolve } from "path";

describe("PBS sales tenant route contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const pbsSalesBlock = routesSource.match(
    /\/\/ ===== PBS SALES MODULE[\s\S]*?\/\/ ===== PBS SERVICE MODULE/
  )?.[0];

  it("requires dealership context before every authenticated PBS sales route", () => {
    for (const route of [
      'app.get("/api/pbs/sales/contacts/search", authMiddleware, requireRole("master", "sales_manager"), requireDealership',
      'app.get("/api/pbs/sales/contacts/:contactId", authMiddleware, requireRole("master", "sales_manager"), requireDealership',
      'app.post("/api/pbs/sales/contacts", authMiddleware, requireRole("master", "sales_manager"), requireDealership',
      'app.patch("/api/pbs/sales/contacts/:contactId", authMiddleware, requireRole("master", "sales_manager"), requireDealership',
      'app.get("/api/pbs/sales/contacts/:contactId/vehicles", authMiddleware, requireRole("master", "sales_manager"), requireDealership',
      'app.get("/api/pbs/sales/workplan/events", authMiddleware, requireRole("master", "sales_manager"), requireDealership',
      'app.get("/api/pbs/sales/workplan/events/:eventId", authMiddleware, requireRole("master", "sales_manager"), requireDealership',
      'app.patch("/api/pbs/sales/workplan/events/:eventId", authMiddleware, requireRole("master", "sales_manager"), requireDealership',
      'app.get("/api/pbs/sales/workplan/appointments", authMiddleware, requireRole("master", "sales_manager"), requireDealership',
      'app.get("/api/pbs/sales/workplan/appointments/:appointmentId", authMiddleware, requireRole("master", "sales_manager"), requireDealership',
      'app.post("/api/pbs/sales/workplan/appointments", authMiddleware, requireRole("master", "sales_manager"), requireDealership',
      'app.patch("/api/pbs/sales/workplan/appointments/:appointmentId", authMiddleware, requireRole("master", "sales_manager"), requireDealership',
      'app.get("/api/pbs/sales/workplan/reminders", authMiddleware, requireRole("master", "sales_manager"), requireDealership',
    ]) {
      expect(routesSource).toContain(route);
    }
  });

  it("uses the resolved dealership before constructing PBS sales service calls", () => {
    expect(pbsSalesBlock).toBeDefined();
    expect(pbsSalesBlock).toContain("const dealershipId = req.dealershipId!");
    expect(pbsSalesBlock).toContain("createPbsApiService(dealershipId)");
    expect(pbsSalesBlock).toContain("pbsService.contactSearch");
    expect(pbsSalesBlock).toContain("pbsService.contactGet");
    expect(pbsSalesBlock).toContain("pbsService.contactSave");
    expect(pbsSalesBlock).toContain("pbsService.contactChange");
    expect(pbsSalesBlock).toContain("pbsService.contactVehicleGet");
    expect(pbsSalesBlock).toContain("pbsService.workplanEventsByContact");
    expect(pbsSalesBlock).toContain("pbsService.workplanEventGet");
    expect(pbsSalesBlock).toContain("pbsService.workplanEventChange");
    expect(pbsSalesBlock).toContain("pbsService.workplanAppointmentContactGet");
    expect(pbsSalesBlock).toContain("pbsService.workplanAppointmentGet");
    expect(pbsSalesBlock).toContain("pbsService.workplanAppointmentCreate");
    expect(pbsSalesBlock).toContain("pbsService.workplanAppointmentChange");
    expect(pbsSalesBlock).toContain("pbsService.workplanReminderGet");
  });
});
