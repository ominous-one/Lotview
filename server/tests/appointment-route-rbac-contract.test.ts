import { readFileSync } from "fs";
import { resolve } from "path";

describe("appointment route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

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
});
