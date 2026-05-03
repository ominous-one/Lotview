import { readFileSync } from "fs";
import { resolve } from "path";

import { parsePositiveIntegerId } from "../tenant-utils";

describe("tenant id parsing contract", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

  it("accepts only strict positive integer ids", () => {
    expect(parsePositiveIntegerId(1)).toBe(1);
    expect(parsePositiveIntegerId("42")).toBe(42);
    expect(parsePositiveIntegerId(" 42 ")).toBe(42);

    [
      undefined,
      null,
      "",
      "0",
      "00",
      "-1",
      "1.5",
      1.5,
      "123abc",
      "abc123",
      Number.NaN,
      Number.MAX_SAFE_INTEGER + 1,
      String(Number.MAX_SAFE_INTEGER + 1),
    ].forEach((value) => {
      expect(parsePositiveIntegerId(value)).toBeNull();
    });
  });

  it("uses the strict parser for shared dealership route parameters", () => {
    expect(routesSource).toContain('import { parsePositiveIntegerId, resolveDealershipIdStrict } from "./tenant-utils";');
    expect(routesSource).toMatch(
      /function parseDealershipIdParam\(value: unknown\): number \| null \{\s+return parsePositiveIntegerId\(value\);\s+\}/
    );
  });

  it("does not parse tenant selectors with partial-string parseInt in admin prompt and automation routes", () => {
    const adminPromptStart = routesSource.indexOf('// ===== ENHANCED PROMPT MANAGEMENT API FOR SUPER ADMIN =====');
    const adminPromptEnd = routesSource.indexOf('// Chat insights analytics endpoint', adminPromptStart);
    const adminPromptBlock = routesSource.slice(adminPromptStart, adminPromptEnd);

    const automationStart = routesSource.indexOf('// ===== AUTOMATION ENGINE ROUTES =====');
    const automationEnd = routesSource.indexOf('// Get all follow-up sequences for dealership', automationStart);
    const automationResolverBlock = routesSource.slice(automationStart, automationEnd);

    [
      "const queryDealershipId = parseDealershipIdParam(req.query.dealershipId);",
      "const bodyDealershipId = parseDealershipIdParam(req.body?.dealershipId);",
    ].forEach((safeParser) => expect(adminPromptBlock).toContain(safeParser));

    expect(automationResolverBlock).toContain("const queryDealershipId = parseDealershipIdParam(req.query.dealershipId);");
    expect(automationResolverBlock).toContain("const bodyDealershipId = parseDealershipIdParam(req.body?.dealershipId);");

    expect(adminPromptBlock).not.toMatch(/parseInt\((?:String\()?req\.(?:body|query)\.dealershipId/);
    expect(automationResolverBlock).not.toMatch(/parseInt\((?:String\()?req\.(?:body|query)\.dealershipId/);
  });

  it("uses strict tenant-id parsing for public tenancy, scrape tooling, and PBS webhook bindings", () => {
    const tenancyStart = routesSource.indexOf("// ===== TENANCY RESOLUTION (Public) =====");
    const tenancyEnd = routesSource.indexOf("// ===== AUTHENTICATION ROUTES (JWT) =====", tenancyStart);
    const tenancyBlock = routesSource.slice(tenancyStart, tenancyEnd);

    const scraperLogsStart = routesSource.indexOf("// Get scraper activity logs (super admin only)");
    const scraperLogsEnd = routesSource.indexOf("// Get system health status (super admin only)", scraperLogsStart);
    const scraperLogsBlock = routesSource.slice(scraperLogsStart, scraperLogsEnd);

    const filterGroupStart = routesSource.indexOf("// ===== SUPER ADMIN FILTER GROUPS ROUTES =====");
    const filterGroupEnd = routesSource.indexOf("// ===== SUPER ADMIN SCRAPE SOURCES ROUTES =====", filterGroupStart);
    const filterGroupBlock = routesSource.slice(filterGroupStart, filterGroupEnd);

    const providerStart = routesSource.indexOf("// ===== BROWSERLESS SCRAPING ROUTES =====");
    const providerEnd = routesSource.indexOf("// Upload vehicle images to Object Storage", providerStart);
    const providerBlock = routesSource.slice(providerStart, providerEnd);

    const pbsStart = routesSource.indexOf("// Webhook receiver endpoint");
    const pbsEnd = routesSource.indexOf("// Get PBS webhook events", pbsStart);
    const pbsBlock = routesSource.slice(pbsStart, pbsEnd);

    expect(tenancyBlock).toContain("const id = parseDealershipIdParam(dealershipId);");
    expect(scraperLogsBlock).toContain("const dealershipId = req.query.dealershipId ? parseDealershipIdParam(req.query.dealershipId) : undefined");
    expect(filterGroupBlock).toContain("const parsedDealershipId = parseDealershipIdParam(dealershipId)");
    expect(providerBlock).toContain("const parsedDealershipId = dealershipId ? parseDealershipIdParam(dealershipId) : undefined");
    expect(pbsBlock).toContain("const dealershipId = parseDealershipIdParam(rawDealershipIdValue)");

    [tenancyBlock, scraperLogsBlock, filterGroupBlock, providerBlock, pbsBlock].forEach((block) => {
      expect(block).not.toMatch(/parseInt\([^\n)]*dealershipId[^\n)]*\)/);
      expect(block).not.toContain("Number.parseInt(String(rawDealershipIdValue");
    });
  });

  it("does not partially parse dealership route parameters", () => {
    expect(routesSource).toContain("function requireDealershipIdParam(req: Request, res: Response): number | null");
    expect(routesSource).toContain("const dealershipId = parseDealershipIdParam(req.params.dealershipId);");
    expect(routesSource).toContain('res.status(400).json({ error: "dealershipId must be a positive integer" });');
    expect(routesSource).not.toContain("parseInt(req.params.dealershipId)");
    expect(routesSource).not.toContain("Number.parseInt(req.params.dealershipId");
  });
});
