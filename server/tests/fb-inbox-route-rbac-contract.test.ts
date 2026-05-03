import { readFileSync } from "fs";
import { resolve } from "path";

describe("FB inbox route RBAC and tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const fbInboxBlock = routesSource.match(
    /app\.get\("\/api\/fb-inbox\/settings"[\s\S]*?\/\/ ===== WS4E: Appointments \(canonical internal calendar\) =====/
  )?.[0];

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

  it("does not partially parse FB inbox thread ids", () => {
    expect(fbInboxBlock).toBeDefined();
    expect(routesSource).toContain("function requireFbInboxThreadIdParam(req: Request, res: Response): number | null");
    expect(fbInboxBlock).toContain("const id = requireFbInboxThreadIdParam(req, res)");
    expect(fbInboxBlock).not.toContain("parseInt(req.params.id");
  });

  it("does not partially parse FB inbox read query filters", () => {
    expect(fbInboxBlock).toBeDefined();

    const positiveQueryParsers = fbInboxBlock?.match(
      /parseOptionalPositiveIntegerQueryParam\(req\.query\.(?:limit|threadId), res, "(?:limit|threadId)"\)/g
    ) ?? [];
    expect(positiveQueryParsers).toHaveLength(4);

    const offsetParsers = fbInboxBlock?.match(
      /parseOptionalNonNegativeIntegerQueryParam\(req\.query\.offset, res, "offset"\)/g
    ) ?? [];
    expect(offsetParsers).toHaveLength(2);

    [
      "if (parsedLimit === null) return;",
      "if (parsedOffset === null) return;",
      "if (threadId === null) return;",
      "const limit = Math.min(parsedLimit ?? 50, 200);",
      "const limit = Math.min(parsedLimit ?? 200, 500);",
      "const offset = parsedOffset ?? 0;",
    ].forEach((snippet) => expect(fbInboxBlock).toContain(snippet));

    [
      "parseInt((req.query.limit as string)",
      "parseInt((req.query.offset as string)",
      "parseInt(req.query.threadId as string",
    ].forEach((snippet) => expect(fbInboxBlock).not.toContain(snippet));
  });
});
