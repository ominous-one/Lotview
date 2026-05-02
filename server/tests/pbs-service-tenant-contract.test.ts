import { readFileSync } from "fs";
import { resolve } from "path";

describe("PBS service tenant route contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const pbsServiceBlock = routesSource.match(
    /\/\/ ===== PBS SERVICE MODULE[\s\S]*?\/\/ ===== PBS PARTS MODULE/
  )?.[0];
  const pbsShopsBlock = routesSource.match(
    /\/\/ Get shops[\s\S]*?\/\/ ===== ADMIN ROUTES/
  )?.[0];

  it("requires dealership context before every authenticated PBS service route", () => {
    for (const route of [
      'app.get("/api/pbs/service/appointments/booking", authMiddleware, requireRole("master", "service_manager"), requireDealership',
      'app.get("/api/pbs/service/appointments", authMiddleware, requireRole("master", "service_manager"), requireDealership',
      'app.get("/api/pbs/service/appointments/:appointmentId", authMiddleware, requireRole("master", "service_manager"), requireDealership',
      'app.post("/api/pbs/service/appointments", authMiddleware, requireRole("master", "service_manager"), requireDealership',
      'app.patch("/api/pbs/service/appointments/:appointmentId", authMiddleware, requireRole("master", "service_manager"), requireDealership',
      'app.patch("/api/pbs/service/appointments/:appointmentId/vehicle", authMiddleware, requireRole("master", "service_manager"), requireDealership',
      'app.get("/api/pbs/service/repair-orders", authMiddleware, requireRole("master", "service_manager"), requireDealership',
      'app.get("/api/pbs/service/repair-orders/:repairOrderId", authMiddleware, requireRole("master", "service_manager"), requireDealership',
      'app.patch("/api/pbs/service/repair-orders/:repairOrderId", authMiddleware, requireRole("master", "service_manager"), requireDealership',
      'app.patch("/api/pbs/service/repair-orders/:repairOrderId/vehicle", authMiddleware, requireRole("master", "service_manager"), requireDealership',
      'app.get("/api/pbs/service/shops", authMiddleware, requireRole("master", "service_manager"), requireDealership',
    ]) {
      expect(routesSource).toContain(route);
    }
  });

  it("uses the resolved dealership before constructing PBS service calls", () => {
    expect(pbsServiceBlock).toBeDefined();
    expect(pbsShopsBlock).toBeDefined();
    const serviceSource = `${pbsServiceBlock}\n${pbsShopsBlock}`;
    expect(serviceSource).toContain("const dealershipId = req.dealershipId!");
    expect(serviceSource).toContain("createPbsApiService(dealershipId)");
    expect(serviceSource).toContain("pbsService.appointmentBookingGet");
    expect(serviceSource).toContain("pbsService.appointmentContactVehicleInfoGet");
    expect(serviceSource).toContain("pbsService.appointmentContactVehicleGet");
    expect(serviceSource).toContain("pbsService.appointmentGet");
    expect(serviceSource).toContain("pbsService.appointmentCreate");
    expect(serviceSource).toContain("pbsService.appointmentChange");
    expect(serviceSource).toContain("pbsService.appointmentContactVehicleChange");
    expect(serviceSource).toContain("pbsService.repairOrderContactVehicleGet");
    expect(serviceSource).toContain("pbsService.repairOrderGet");
    expect(serviceSource).toContain("pbsService.repairOrderChange");
    expect(serviceSource).toContain("pbsService.repairOrderContactVehicleChange");
    expect(serviceSource).toContain("pbsService.shopGet");
  });
});
