export interface RobustScrapeResult {
  success: boolean;
  vehiclesFound: number;
  method: string;
  retryCount: number;
  error?: string;
}

/**
 * Fail-closed robust scraper entrypoint.
 *
 * The previous repo referenced this module but did not include it, which made
 * production bundles fail before any runtime proof could execute. This
 * implementation is intentionally conservative: it compiles and returns a
 * clear blocked state unless the certified scraper is wired behind an explicit
 * feature flag.
 */
export async function runRobustScrape(
  source: string = "unknown",
  dealershipId?: number,
): Promise<RobustScrapeResult> {
  const enabled = process.env.FEATURE_ROBUST_SCRAPER === "true";

  if (!enabled) {
    return {
      success: false,
      vehiclesFound: 0,
      method: "disabled_pending_certification",
      retryCount: 0,
      error: `Robust scraper disabled pending certification (source=${source}, dealershipId=${dealershipId ?? "all"})`,
    };
  }

  return {
    success: false,
    vehiclesFound: 0,
    method: "not_certified",
    retryCount: 0,
    error: "Robust scraper feature flag is enabled, but no certified implementation is registered.",
  };
}
