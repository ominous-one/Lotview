import { resolveForceRescrapeScrapeResult } from "../services/force-rescrape-result-guard";

describe("force rescrape result guard", () => {
  it("rejects an invalid scraper response before inventory writes", () => {
    expect(resolveForceRescrapeScrapeResult(null)).toEqual({
      ok: false,
      status: 502,
      body: {
        error: "Vehicle rescrape returned an invalid response; refusing to update inventory",
        code: "RESCRAPE_INVALID_RESPONSE",
      },
    });
  });

  it("fails closed when the single-vehicle scraper is not configured", () => {
    expect(resolveForceRescrapeScrapeResult({
      success: false,
      error: "Enhanced single-vehicle scraper is not configured",
    })).toEqual({
      ok: false,
      status: 503,
      body: {
        error: "Vehicle rescrape is not configured; refusing to update inventory",
        code: "RESCRAPE_NOT_CONFIGURED",
        scraperError: "Enhanced single-vehicle scraper is not configured",
      },
    });
  });

  it("fails closed on explicit scraper failures", () => {
    expect(resolveForceRescrapeScrapeResult({
      success: false,
      error: "source page timed out",
    })).toEqual({
      ok: false,
      status: 502,
      body: {
        error: "Vehicle rescrape failed; refusing to update inventory",
        code: "RESCRAPE_FAILED",
        scraperError: "source page timed out",
      },
    });
  });

  it("allows successful scrape payloads through for field-level guards", () => {
    const payload = {
      success: true,
      price: 22500,
      odometer: 41000,
      vin: "1HGCM82633A004352",
    };

    expect(resolveForceRescrapeScrapeResult(payload)).toEqual({
      ok: true,
      result: payload,
    });
  });

  it("allows legacy payloads without a success flag through for field-level guards", () => {
    const payload = {
      price: 22500,
      vin: "1HGCM82633A004352",
    };

    expect(resolveForceRescrapeScrapeResult(payload)).toEqual({
      ok: true,
      result: payload,
    });
  });
});
