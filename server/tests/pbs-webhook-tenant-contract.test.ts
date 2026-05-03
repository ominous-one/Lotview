import { readFileSync } from "fs";
import { resolve } from "path";

describe("PBS webhook tenant and signature contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");
  const pbsWebhookBlock = routesSource.match(
    /\/\/ Webhook receiver endpoint[\s\S]*?\/\/ Get PBS webhook events/
  )?.[0];

  it("requires explicit dealership binding for unauthenticated PBS webhooks", () => {
    expect(pbsWebhookBlock).toBeDefined();
    expect(pbsWebhookBlock).toContain('app.post(["/api/pbs/webhook", "/api/pbs/webhook/:dealershipId"]');
    expect(pbsWebhookBlock).toContain("req.params.dealershipId");
    expect(pbsWebhookBlock).toContain('req.headers["x-lotview-dealership-id"]');
    expect(pbsWebhookBlock).toContain('req.headers["x-dealership-id"]');
    expect(pbsWebhookBlock).toContain("req.body?.dealershipId");
    expect(pbsWebhookBlock).toContain("Explicit dealership binding is required");
    expect(pbsWebhookBlock).toContain("const dealershipId = parseDealershipIdParam(rawDealershipIdValue)");
    expect(pbsWebhookBlock).not.toContain("Number.parseInt(String(rawDealershipIdValue");
    expect(pbsWebhookBlock).not.toContain("req.dealershipId!");
  });

  it("fails closed unless the bound dealership has a configured PBS webhook secret", () => {
    expect(pbsWebhookBlock).toContain("storage.getPbsConfig(dealershipId)");
    expect(pbsWebhookBlock).toContain("if (!pbsConfig?.webhookSecret)");
    expect(pbsWebhookBlock).toContain("PBS webhook is not configured for this dealership");
  });

  it("requires timestamped HMAC verification before storing webhook events", () => {
    expect(pbsWebhookBlock).toContain('req.headers["x-pbs-signature"]');
    expect(pbsWebhookBlock).toContain('req.headers["x-pbs-timestamp"]');
    expect(pbsWebhookBlock).toContain('const payload = `${timestamp}.${JSON.stringify(req.body)}`');
    expect(pbsWebhookBlock).toContain('.createHmac("sha256", pbsConfig.webhookSecret)');
    expect(pbsWebhookBlock).toContain("crypto.timingSafeEqual");
    expect(pbsWebhookBlock).toContain("storage.createPbsWebhookEvent({");
    expect(pbsWebhookBlock).toContain("dealershipId,");
  });
});
