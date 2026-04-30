import { readFileSync } from "fs";
import { resolve } from "path";

describe("vehicle action route RBAC contract", () => {
  const vehicleRoutesSource = readFileSync(resolve(process.cwd(), "server/routes/vehicles.ts"), "utf8");

  it("requires explicit AI and inventory permissions for vehicle content generation routes", () => {
    for (const route of [
      'router.post("/:id/generate-video", authMiddleware, requirePermission("ai.use"), requireRole("master"), requireDealership',
      'router.post("/:id/generate-description", authMiddleware, requirePermission("ai.use"), requirePermission("inventory.write"), requireRole("master"), requireDealership',
      'router.post("/generate-descriptions", authMiddleware, requirePermission("ai.use"), requirePermission("inventory.write"), requireRole("master"), requireDealership',
      'router.post("/:id/ai-description", authMiddleware, requirePermission("ai.use"), requireRole("manager", "admin", "master", "super_admin"), requireDealership',
    ]) {
      expect(vehicleRoutesSource).toContain(route);
    }
  });

  it("requires explicit integration and inventory permissions for scraper and Carfax mutation routes", () => {
    for (const route of [
      'router.post("/:id/force-rescrape", authMiddleware, requirePermission("integrations.write"), requireRole("manager"), requireDealership',
      'router.post("/batch-carfax-update", authMiddleware, requirePermission("integrations.write"), requirePermission("inventory.write"), requireRole("manager"), requireDealership',
      'router.post("/:id/carfax", authMiddleware, requirePermission("integrations.write"), requirePermission("inventory.write"), requireRole("manager", "admin", "master", "super_admin"), requireDealership',
    ]) {
      expect(vehicleRoutesSource).toContain(route);
    }
  });

  it("requires explicit read permissions for analysis and scoring routes", () => {
    for (const route of [
      'router.post("/:id/market-analysis", authMiddleware, requirePermission("inventory.read"), requireRole("manager", "admin", "master", "super_admin"), requireDealership',
      'router.post("/:id/photo-score", authMiddleware, requirePermission("inventory.read"), requireRole("manager", "admin", "master", "super_admin"), requireDealership',
      'router.post("/:id/ai-carfax-context", authMiddleware, requirePermission("ai.use"), requirePermission("integrations.read"), requireRole("manager", "admin", "master", "super_admin"), requireDealership',
    ]) {
      expect(vehicleRoutesSource).toContain(route);
    }
  });

  it("does not leave protected vehicle action routes guarded only by roles", () => {
    const actionRouteLines = vehicleRoutesSource
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) =>
        line.startsWith("router.post(") &&
        (line.includes("generate-") ||
          line.includes("force-rescrape") ||
          line.includes("batch-carfax-update") ||
          line.includes('"/:id/carfax"') ||
          line.includes("ai-description") ||
          line.includes("market-analysis") ||
          line.includes("photo-score") ||
          line.includes("ai-carfax-context"))
      );

    expect(actionRouteLines.length).toBeGreaterThanOrEqual(10);
    expect(actionRouteLines.every((line) => line.includes("requirePermission("))).toBe(true);
  });
});
