import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Browserless scrape source tenant boundary", () => {
  const source = readFileSync(resolve(process.cwd(), "server/browserless-robust-scraper.ts"), "utf8");

  it("scopes sourceId lookup by dealership when a dealership context is provided", () => {
    const sourceIdLookupBlock = source.match(
      /if \(sourceId\) \{[\s\S]*?\} else if \(dealershipId\) \{/
    )?.[0];

    expect(sourceIdLookupBlock).toBeDefined();
    expect(sourceIdLookupBlock).toContain("eq(scrapeSources.id, sourceId)");
    expect(sourceIdLookupBlock).toContain("eq(scrapeSources.dealershipId, dealershipId)");
    expect(sourceIdLookupBlock).toContain("eq(scrapeSources.isActive, true)");
  });

  it("updates scrape source status with the selected source dealership boundary", () => {
    expect(source).toContain(
      ".where(and(eq(scrapeSources.id, source.id), eq(scrapeSources.dealershipId, source.dealershipId)))"
    );
    expect(source).not.toContain(".where(eq(scrapeSources.id, source.id));");
  });
});
