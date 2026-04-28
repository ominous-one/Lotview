import { createFBMarketplaceScheduler } from "../fb-marketplace-service";
import { runRobustScrape } from "../robust-scraper";
import {
  assessDealershipScrapeCertificationArtifact,
  buildDealershipScrapeCertificationArtifact,
} from "../scrape-certification";
import { evaluateDealershipScrapeGate } from "../scrape-truth-foundation";

describe("production feature gates", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("keeps Facebook Marketplace scheduler disabled unless certified", async () => {
    delete process.env.FEATURE_FACEBOOK_MARKETPLACE_SCHEDULER;

    const result = await createFBMarketplaceScheduler();

    expect(result.started).toBe(false);
    expect(result.reason).toBe("feature_disabled_pending_certification");
  });

  it("keeps robust scraper blocked unless certified", async () => {
    delete process.env.FEATURE_ROBUST_SCRAPER;

    const result = await runRobustScrape("test", 1);

    expect(result.success).toBe(false);
    expect(result.vehiclesFound).toBe(0);
    expect(result.method).toBe("disabled_pending_certification");
  });

  it("blocks scrape certification when truth boundary is not source reconciled", () => {
    const gate = evaluateDealershipScrapeGate({
      dealershipId: 1,
      sampledVehicles: [],
      scrapeSuccessRate: 0,
      staleRemovalWithinSla: false,
      consecutiveDaysAbove95: 0,
      imageContaminationRate: 1,
      hasCarfaxUnknownsOnlyWhenAbsent: false,
    });

    const artifact = buildDealershipScrapeCertificationArtifact({
      dealershipId: 1,
      truthBoundary: "stored_inventory_internal_consistency",
      gate,
      metrics: {},
      sampledVehicles: [],
    });

    const assessment = assessDealershipScrapeCertificationArtifact(artifact);

    expect(assessment.usable).toBe(false);
    expect(assessment.blockers).toContain("truth_boundary_not_source_reconciled");
  });
});
