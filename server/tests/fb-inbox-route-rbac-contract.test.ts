import { readFileSync } from "fs";
import { resolve } from "path";

describe("FB inbox route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

  it("requires AI configuration permission and dealership context for FB inbox automation settings", () => {
    [
      'app.get("/api/fb-inbox/settings", authMiddleware, requirePermission("ai.configure"), requireDealership',
      'app.put("/api/fb-inbox/settings", authMiddleware, requirePermission("ai.configure"), requireDealership',
      'app.post("/api/fb-inbox/threads/:id/auto-send", authMiddleware, requirePermission("ai.configure"), requireDealership',
    ].forEach((route) => expect(routesSource).toContain(route));
  });

  it("requires message read permission and dealership context for FB inbox read surfaces", () => {
    [
      'app.get("/api/fb-inbox/threads", authMiddleware, requirePermission("messages.read"), requireDealership',
      'app.get("/api/fb-inbox/threads/:id", authMiddleware, requirePermission("messages.read"), requireDealership',
      'app.get("/api/fb-inbox/threads/:id/messages", authMiddleware, requirePermission("messages.read"), requireDealership',
      'app.get("/api/fb-inbox/audit", authMiddleware, requirePermission("messages.read"), requireDealership',
    ].forEach((route) => expect(routesSource).toContain(route));
  });

  it("requires message write permission and dealership context for FB inbox thread actions", () => {
    [
      'app.post("/api/fb-inbox/threads/:id/pause", authMiddleware, requirePermission("messages.write"), requireDealership',
      'app.post("/api/fb-inbox/threads/:id/abort", authMiddleware, requirePermission("messages.write"), requireDealership',
      'app.post("/api/fb-inbox/threads/:id/dnc", authMiddleware, requirePermission("messages.write"), requireDealership',
    ].forEach((route) => expect(routesSource).toContain(route));
  });
});
