import { readFileSync } from "fs";
import { resolve } from "path";

describe("public GHL and chat lead route tenant contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const ghlPublicBlock = routesSource.match(
    /\/\/ ===== GOHIGHLEVEL CTA ROUTES =====[\s\S]*?\/\/ ===== FINANCING RULES ROUTES/
  )?.[0];

  it("requires dealership context before public CTA and chat handoff CRM writes", () => {
    expect(routesSource).toContain('app.post("/api/cta/send", requireDealership, async');
    expect(routesSource).toContain('app.post("/api/chat/handoff", requireDealership, async');
  });

  it("requires dealership context before public chat lead auto-sync", () => {
    expect(routesSource).toContain(
      'app.post("/api/chat/auto-sync-lead", requireDealership, async'
    );
  });

  it("does not silently skip auto-sync when dealership context is missing", () => {
    expect(ghlPublicBlock).toBeDefined();
    expect(ghlPublicBlock).not.toContain("Dealership not resolved");
    expect(ghlPublicBlock).not.toContain("No dealership resolved - skipping sync");
    expect(ghlPublicBlock).toContain("const dealershipId = req.dealershipId!");
  });
});
