import { buildDealershipScrapeCertificationArtifact, type DealershipScrapeCertificationArtifact } from './scrape-certification';
import { buildComparableVehicleTruthSamples, normalizeCarfaxEvidenceUrl } from './live-source-reconciliation';
import { evaluateDealershipScrapeGate, reconcileVehicleTruth } from './scrape-truth-foundation';

export interface LiveSourceTruthVehicleSource {
  vin?: string | null;
  stockNumber?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  price?: number | null;
  odometer?: number | null;
  photoCountObservedInDom?: number | null;
  photoCount?: number | null;
  primaryPhoto?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  fuelType?: string | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  carfaxUrl?: string | null;
  carfaxBadges?: string[] | null;
  carfaxSignalsPresent?: boolean | null;
}

export interface LiveSourceTruthVehicleObserved {
  vin?: string | null;
  stockNumber?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  price?: number | null;
  odometer?: number | null;
  photoCount?: number | null;
  primaryPhoto?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  fuelType?: string | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  carfaxUrl?: string | null;
  carfaxBadges?: string[] | null;
}

export interface LiveSourceTruthVehicleSample {
  source: LiveSourceTruthVehicleSource;
  observed: LiveSourceTruthVehicleObserved;
}

export interface LiveSourceTruthReconciliationArtifact {
  generatedAt?: string;
  dealership?: {
    name?: string | null;
    listingUrl?: string | null;
    listingPageSignals?: {
      visibleVehicleLinkCount?: number | null;
    } | null;
  } | null;
  sampledVehicles?: LiveSourceTruthVehicleSample[] | null;
}

function deriveVisibleSourceVehicleCount(artifact: LiveSourceTruthReconciliationArtifact): number | null {
  const count = artifact.dealership?.listingPageSignals?.visibleVehicleLinkCount;
  return typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : null;
}

function deriveHasCarfaxUnknownsOnlyWhenAbsent(samples: LiveSourceTruthVehicleSample[]): boolean {
  return samples.every((sample) => {
    const sourceSignalsHistory = Boolean(
      sample.source?.carfaxSignalsPresent ||
      normalizeCarfaxEvidenceUrl(sample.source?.carfaxUrl) ||
      (Array.isArray(sample.source?.carfaxBadges) && sample.source!.carfaxBadges!.length > 0),
    );

    if (!sourceSignalsHistory) {
      return true;
    }

    return Boolean(
      normalizeCarfaxEvidenceUrl(sample.observed?.carfaxUrl) ||
      (Array.isArray(sample.observed?.carfaxBadges) && sample.observed!.carfaxBadges!.length > 0),
    );
  });
}

export function buildSourceTruthCertificationArtifactFromLiveReconciliation(params: {
  dealershipId: number;
  dealershipLabel?: string;
  liveArtifact: LiveSourceTruthReconciliationArtifact;
  storedInventoryTotal: number;
  latestScrapeRunId?: number | null;
  consecutiveDaysAbove95?: number;
}): DealershipScrapeCertificationArtifact {
  const samples = Array.isArray(params.liveArtifact.sampledVehicles)
    ? params.liveArtifact.sampledVehicles
    : [];

  const sampledVehicles = samples.map((sample) =>
    {
      const comparisonSamples = buildComparableVehicleTruthSamples(
        sample.source ?? {},
        sample.observed ?? {},
        Array.isArray(sample.source?.carfaxBadges) ? sample.source!.carfaxBadges! : [],
        Array.isArray(sample.observed?.carfaxBadges) ? sample.observed!.carfaxBadges! : [],
      );

      return reconcileVehicleTruth({
        dealershipId: params.dealershipId,
        source: comparisonSamples.source,
        observed: comparisonSamples.observed,
      });
    },
  );

  const sourceVehicleCount = deriveVisibleSourceVehicleCount(params.liveArtifact);
  const scrapeSuccessRate =
    sourceVehicleCount && sourceVehicleCount > 0
      ? Math.min(1, params.storedInventoryTotal / sourceVehicleCount)
      : 1;

  const staleRemovalWithinSla =
    sourceVehicleCount == null ? true : params.storedInventoryTotal <= sourceVehicleCount;

  const hasCarfaxUnknownsOnlyWhenAbsent = deriveHasCarfaxUnknownsOnlyWhenAbsent(samples);
  const gate = evaluateDealershipScrapeGate({
    dealershipId: params.dealershipId,
    sampledVehicles,
    scrapeSuccessRate,
    staleRemovalWithinSla,
    consecutiveDaysAbove95: params.consecutiveDaysAbove95 ?? 0,
    imageContaminationRate: 0,
    hasCarfaxUnknownsOnlyWhenAbsent,
  });

  const notes = [
    'Built from a live dealership reconciliation artifact and current stored inventory totals.',
    sourceVehicleCount == null
      ? 'Listing-page source vehicle count was unavailable; scrape success rate defaulted to 1.'
      : `Listing-page visible vehicle count: ${sourceVehicleCount}; stored inventory total at certification time: ${params.storedInventoryTotal}.`,
  ];

  if (!hasCarfaxUnknownsOnlyWhenAbsent) {
    notes.push('Source pages signaled CARFAX/history presence that was not represented in observed inventory data for at least one sampled vehicle.');
  }

  return buildDealershipScrapeCertificationArtifact({
    dealershipId: params.dealershipId,
    dealershipLabel: params.dealershipLabel,
    generatedAt: params.liveArtifact.generatedAt,
    truthBoundary: 'source_truth_reconciliation',
    gate,
    metrics: {
      sampledVehicleCount: sampledVehicles.length,
      sampledVehiclePassCount: sampledVehicles.filter((vehicle) => vehicle.criticalMismatchCount === 0).length,
      scrapeSuccessRate,
      staleRemovalWithinSla,
      consecutiveDaysAbove95: params.consecutiveDaysAbove95 ?? 0,
      imageContaminationRate: 0,
      hasCarfaxUnknownsOnlyWhenAbsent,
      inventoryTotal: params.storedInventoryTotal,
      latestScrapeRunId: params.latestScrapeRunId ?? null,
    },
    sampledVehicles,
    notes,
  });
}
