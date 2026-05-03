type ForceRescrapeScrapeRecord = {
  success?: unknown;
  error?: unknown;
  price?: number;
  odometer?: number;
  images?: string[];
  vin?: string;
  trim?: string;
  badges?: string[];
  [key: string]: unknown;
};

export type ForceRescrapeScrapeResultDecision =
  | { ok: true; result: ForceRescrapeScrapeRecord }
  | {
      ok: false;
      status: 502 | 503;
      body: {
        error: string;
        code: "RESCRAPE_FAILED" | "RESCRAPE_NOT_CONFIGURED" | "RESCRAPE_INVALID_RESPONSE";
        scraperError?: string;
      };
    };

function isRecord(value: unknown): value is ForceRescrapeScrapeRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotConfiguredFailure(error: string | undefined): boolean {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return normalized.includes("not configured") || normalized.includes("not_configured") || normalized.includes("scraper_not_configured");
}

export function resolveForceRescrapeScrapeResult(result: unknown): ForceRescrapeScrapeResultDecision {
  if (!isRecord(result)) {
    return {
      ok: false,
      status: 502,
      body: {
        error: "Vehicle rescrape returned an invalid response; refusing to update inventory",
        code: "RESCRAPE_INVALID_RESPONSE",
      },
    };
  }

  const scraperError = typeof result.error === "string" ? result.error : undefined;

  if (result.success === false) {
    const notConfigured = isNotConfiguredFailure(scraperError);
    return {
      ok: false,
      status: notConfigured ? 503 : 502,
      body: {
        error: notConfigured
          ? "Vehicle rescrape is not configured; refusing to update inventory"
          : "Vehicle rescrape failed; refusing to update inventory",
        code: notConfigured ? "RESCRAPE_NOT_CONFIGURED" : "RESCRAPE_FAILED",
        ...(scraperError ? { scraperError } : {}),
      },
    };
  }

  return { ok: true, result };
}
