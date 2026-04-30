import { readFileSync } from "fs";
import { resolve } from "path";

describe("GHL integration route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

  it("requires integration permission and dealership context for API key management", () => {
    expect(routesSource).toContain(
      'app.get("/api/dealership-api-keys", authMiddleware, requirePermission("integrations.read"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.patch("/api/dealership-api-keys", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/dealership/webhook-secret", authMiddleware, requirePermission("integrations.read"), requireRole("admin"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/dealership/webhook-secret", authMiddleware, requirePermission("integrations.write"), requireRole("admin"), requireDealership'
    );
  });

  it("requires integration permission and dealership context for GHL admin configuration routes", () => {
    expect(routesSource).toContain(
      'app.get("/api/admin/ghl/workflows", authMiddleware, requirePermission("integrations.read"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/admin/ghl-config", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/admin/ghl-webhook-config", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/admin/ghl-webhook-config", authMiddleware, requirePermission("integrations.read"), requireRole("master"), requireDealership'
    );
  });

  it("requires integration permission and dealership context for GHL account and config routes", () => {
    expect(routesSource).toContain(
      'app.get("/api/ghl/auth/connect", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/ghl/account", authMiddleware, requirePermission("integrations.read"), requireRole("master", "sales_manager"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.delete("/api/ghl/account", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/ghl/config", authMiddleware, requirePermission("integrations.read"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/ghl/config", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership'
    );
  });

  it("requires integration read permission and dealership context for GHL read routes", () => {
    expect(routesSource).toContain(
      'app.get("/api/ghl/webhook-events", authMiddleware, requirePermission("integrations.read"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/ghl/api-logs", authMiddleware, requirePermission("integrations.read"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/ghl/contacts/search", authMiddleware, requirePermission("integrations.read"), requireRole("master", "sales_manager"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/ghl/contacts/:contactId", authMiddleware, requirePermission("integrations.read"), requireRole("master", "sales_manager"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/ghl/appointments", authMiddleware, requirePermission("integrations.read"), requireRole("master", "sales_manager"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/ghl/pipelines", authMiddleware, requirePermission("integrations.read"), requireRole("master", "sales_manager"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/ghl/calendars", authMiddleware, requirePermission("integrations.read"), requireRole("master", "sales_manager"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/ghl/opportunities", authMiddleware, requirePermission("integrations.read"), requireRole("master", "sales_manager"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/ghl/sync/stats", authMiddleware, requirePermission("integrations.read"), requireRole("master", "sales_manager"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.get("/api/ghl/sync/contacts", authMiddleware, requirePermission("integrations.read"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/ghl/test-connection", authMiddleware, requirePermission("integrations.read"), requireRole("master"), requireDealership'
    );
  });

  it("requires integration write permission and dealership context for GHL mutation routes", () => {
    expect(routesSource).toContain(
      'app.post("/api/ghl/contacts", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.patch("/api/ghl/contacts/:contactId", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/ghl/appointments", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/ghl/opportunities", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.post("/api/ghl/sync/run", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership'
    );
    expect(routesSource).toContain(
      'app.delete("/api/ghl/disconnect", authMiddleware, requirePermission("integrations.write"), requireRole("master"), requireDealership'
    );
  });
});
