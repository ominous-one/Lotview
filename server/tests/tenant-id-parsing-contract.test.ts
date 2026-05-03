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
});
