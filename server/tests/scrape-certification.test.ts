import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assessDealershipScrapeCertificationArtifact,
  buildDealershipScrapeCertificationArtifact,
  deriveDealershipScrapePostingGate,
  SCRAPE_CERTIFICATION_MIN_SOURCE_SAMPLE_SIZE,
  readDealershipScrapeCertificationArtifact,
  SCRAPE_SUSTAINED_GREEN_STREAK_BLOCKER,
  writeDealershipScrapeCertificationArtifact,
} from '../scrape-certification';

const passingGate = {
  dealershipId: 44,
  score: 98.4,
  passed: true,
  blockers: [] as string[],
  categoryBreakdown: {
    identity: 100,
    price: 99.8,
    media: 99.5,
    details: 98.7,
    freshness: 99.2,
    history: 100,
  },
};

describe('scrape-certification', () => {
  test('stored-inventory artifacts remain launch-blocked even when the score is green', () => {
    const artifact = buildDealershipScrapeCertificationArtifact({
      dealershipId: 44,
      truthBoundary: 'stored_inventory_internal_consistency',
      gate: passingGate,
      metrics: {
        sampledVehicleCount: 25,
        sampledVehiclePassCount: 25,
        scrapeSuccessRate: 0.998,
        staleRemovalWithinSla: true,
        consecutiveDaysAbove95: 7,
        imageContaminationRate: 0,
        hasCarfaxUnknownsOnlyWhenAbsent: true,
      },
      sampledVehicles: [],
    });

    expect(artifact.launchEligible).toBe(false);
    expect(artifact.launchBlockers).toContain('truth_boundary_not_source_reconciled');
  });

  test('fresh source-truth artifacts are usable for launch gating', () => {
    const artifact = buildDealershipScrapeCertificationArtifact({
      dealershipId: 44,
      generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      truthBoundary: 'source_truth_reconciliation',
      gate: passingGate,
      metrics: {
        sampledVehicleCount: 25,
        sampledVehiclePassCount: 25,
        scrapeSuccessRate: 0.998,
        staleRemovalWithinSla: true,
        consecutiveDaysAbove95: 7,
        imageContaminationRate: 0,
        hasCarfaxUnknownsOnlyWhenAbsent: true,
      },
      sampledVehicles: [],
    });

    const assessment = assessDealershipScrapeCertificationArtifact(artifact);
    expect(assessment.usable).toBe(true);
    expect(assessment.blockers).toEqual([]);
    expect(assessment.ageHours).not.toBeNull();
  });

  test('source-truth launch bootstrap ignores the 7-day streak for posting, but preserves it in diagnostics', () => {
    const artifact = buildDealershipScrapeCertificationArtifact({
      dealershipId: 44,
      generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      truthBoundary: 'source_truth_reconciliation',
      gate: {
        ...passingGate,
        passed: false,
        blockers: [SCRAPE_SUSTAINED_GREEN_STREAK_BLOCKER],
      },
      metrics: {
        sampledVehicleCount: 25,
        sampledVehiclePassCount: 25,
        scrapeSuccessRate: 0.998,
        staleRemovalWithinSla: true,
        consecutiveDaysAbove95: 3,
        imageContaminationRate: 0,
        hasCarfaxUnknownsOnlyWhenAbsent: true,
      },
      sampledVehicles: [],
    });

    const assessment = assessDealershipScrapeCertificationArtifact(artifact);
    const postingGate = deriveDealershipScrapePostingGate(artifact);

    expect(artifact.launchEligible).toBe(true);
    expect(artifact.launchBlockers).toEqual([]);
    expect(artifact.notes).toContain(
      'Bootstrap launch may proceed before a 7-day green streak when source-truth reconciliation is fresh and launch blockers are otherwise clear.',
    );
    expect(assessment.usable).toBe(true);
    expect(assessment.blockers).toEqual([]);
    expect(postingGate.passed).toBe(true);
    expect(postingGate.blockers).toEqual([]);
    expect(artifact.gate.blockers).toEqual([SCRAPE_SUSTAINED_GREEN_STREAK_BLOCKER]);
  });

  test('stale source-truth artifacts are blocked even if their gate passed', () => {
    const artifact = buildDealershipScrapeCertificationArtifact({
      dealershipId: 44,
      generatedAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
      truthBoundary: 'source_truth_reconciliation',
      gate: passingGate,
      metrics: {
        sampledVehicleCount: 25,
        sampledVehiclePassCount: 25,
        scrapeSuccessRate: 0.998,
        staleRemovalWithinSla: true,
        consecutiveDaysAbove95: 7,
        imageContaminationRate: 0,
        hasCarfaxUnknownsOnlyWhenAbsent: true,
      },
      sampledVehicles: [],
    });

    const assessment = assessDealershipScrapeCertificationArtifact(artifact);
    expect(assessment.usable).toBe(false);
    expect(assessment.blockers).toContain('certification_artifact_stale');
  });

  test('source-truth artifacts remain launch-blocked when the reconciliation sample is too small', () => {
    const artifact = buildDealershipScrapeCertificationArtifact({
      dealershipId: 44,
      generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      truthBoundary: 'source_truth_reconciliation',
      gate: passingGate,
      metrics: {
        sampledVehicleCount: SCRAPE_CERTIFICATION_MIN_SOURCE_SAMPLE_SIZE - 1,
        sampledVehiclePassCount: SCRAPE_CERTIFICATION_MIN_SOURCE_SAMPLE_SIZE - 1,
        scrapeSuccessRate: 0.998,
        staleRemovalWithinSla: true,
        consecutiveDaysAbove95: 7,
        imageContaminationRate: 0,
        hasCarfaxUnknownsOnlyWhenAbsent: true,
      },
      sampledVehicles: [],
    });

    const assessment = assessDealershipScrapeCertificationArtifact(artifact);
    expect(artifact.launchEligible).toBe(false);
    expect(artifact.launchBlockers).toContain('source_truth_sample_size_below_threshold');
    expect(assessment.usable).toBe(false);
  });

  test('assessment recomputes launch blockers so legacy source-truth artifacts are not stuck red on the streak rule', () => {
    const artifact = {
      ...buildDealershipScrapeCertificationArtifact({
        dealershipId: 44,
        generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        truthBoundary: 'source_truth_reconciliation',
        gate: {
          ...passingGate,
          passed: false,
          blockers: [SCRAPE_SUSTAINED_GREEN_STREAK_BLOCKER],
        },
        metrics: {
          sampledVehicleCount: 25,
          sampledVehiclePassCount: 25,
          scrapeSuccessRate: 0.998,
          staleRemovalWithinSla: true,
          consecutiveDaysAbove95: 4,
          imageContaminationRate: 0,
          hasCarfaxUnknownsOnlyWhenAbsent: true,
        },
        sampledVehicles: [],
      }),
      launchEligible: false,
      launchBlockers: [SCRAPE_SUSTAINED_GREEN_STREAK_BLOCKER],
    };

    const assessment = assessDealershipScrapeCertificationArtifact(artifact);
    expect(assessment.usable).toBe(true);
    expect(assessment.blockers).toEqual([]);
  });

  test('artifact files round-trip through the canonical dealership path', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lotview-scrape-cert-'));
    const artifact = buildDealershipScrapeCertificationArtifact({
      dealershipId: 44,
      dealershipLabel: 'olympic',
      truthBoundary: 'source_truth_reconciliation',
      gate: passingGate,
      metrics: {
        sampledVehicleCount: 25,
        sampledVehiclePassCount: 25,
        scrapeSuccessRate: 0.998,
        staleRemovalWithinSla: true,
        consecutiveDaysAbove95: 7,
        imageContaminationRate: 0,
        hasCarfaxUnknownsOnlyWhenAbsent: true,
      },
      sampledVehicles: [],
    });

    const outputPath = writeDealershipScrapeCertificationArtifact(artifact, { rootDir });
    const loaded = readDealershipScrapeCertificationArtifact(44, { rootDir });

    expect(fs.existsSync(outputPath)).toBe(true);
    expect(loaded).not.toBeNull();
    expect(loaded?.dealershipId).toBe(44);
    expect(loaded?.dealershipLabel).toBe('olympic');
    expect(loaded?.artifactType).toBe('dealership_scrape_certification');
  });
});
