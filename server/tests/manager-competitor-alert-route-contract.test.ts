import { readFileSync } from "fs";
import { resolve } from "path";

describe("manager competitor alert route contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const competitorAlertBlock = routesSource.match(
    /\/\/ Get competitor price alerts[\s\S]*?\/\/ Trigger manual competitor scan/
  )?.[0];

  it("keeps competitor alert reads and mutations scoped to the resolved dealership", () => {
    expect(competitorAlertBlock).toBeDefined();
    expect(competitorAlertBlock).toContain("const dealershipId = requireResolvedDealershipId(req as AuthRequest);");
    expect(competitorAlertBlock).toContain("storage.getCompetitorPriceAlerts(dealershipId");
    expect(competitorAlertBlock).toContain("storage.acknowledgeCompetitorPriceAlert(alertId, dealershipId, userId)");
    expect(competitorAlertBlock).toContain("storage.resolveCompetitorPriceAlert(alertId, dealershipId, note)");
  });

  it("rejects malformed competitor alert ids before storage mutations", () => {
    expect(competitorAlertBlock).toBeDefined();
    expect(routesSource).toContain("function requireCompetitorAlertIdParam");

    const idGuardCalls = competitorAlertBlock?.match(/requireCompetitorAlertIdParam\(req, res\)/g) ?? [];
    expect(idGuardCalls).toHaveLength(2);
    expect(competitorAlertBlock).not.toContain("parseInt(req.params.id)");
    expect(competitorAlertBlock).not.toContain("Number.parseInt(req.params.id");
  });

  it("rejects malformed competitor alert numeric filters before storage reads", () => {
    expect(competitorAlertBlock).toBeDefined();
    expect(routesSource).toContain("function parseOptionalPositiveIntegerQueryParam");
    expect(competitorAlertBlock).toContain('parseOptionalPositiveIntegerQueryParam(req.query.vehicleId, res, "vehicleId")');
    expect(competitorAlertBlock).toContain('parseOptionalPositiveIntegerQueryParam(req.query.limit, res, "limit")');
    expect(competitorAlertBlock).not.toContain("vehicleId ? parseInt(vehicleId as string)");
    expect(competitorAlertBlock).not.toContain("limit ? parseInt(limit as string)");
  });
});
