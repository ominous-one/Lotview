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

  it("passes only the stored source tenant facts into the Scrapling fallback", () => {
    const fallbackBlock = source.match(
      /const sidecar = await runScraplingSidecar\(\{[\s\S]*?\n\s+\}\);/
    )?.[0];

    expect(fallbackBlock).toBeDefined();
    expect(fallbackBlock).toContain("sourceId: source.id");
    expect(fallbackBlock).toContain("dealershipId: source.dealershipId");
    expect(fallbackBlock).toContain("sourceUrl: source.sourceUrl");
    expect(fallbackBlock).toContain("sourceName: source.sourceName");
    expect(fallbackBlock).not.toContain("options.dealershipId");
    expect(fallbackBlock).not.toContain("request.body");
  });
});
