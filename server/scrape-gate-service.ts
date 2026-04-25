import { storage } from './storage';
import { deriveDealershipOperatorLabel } from './dealership-reference';
import {
  evaluateDealershipScrapeGate,
  reconcileVehicleTruth,
  type DealershipScrapeGateResult,
  type VehicleTruthSample,
  type VehicleReconciliationResult,
} from './scrape-truth-foundation';
import {
  assessDealershipScrapeCertificationArtifact,
  buildDealershipScrapeCertificationArtifact,
  deriveDealershipScrapePostingGate,
  mergeDealershipScrapeGateBlockers,
  readDealershipScrapeCertificationArtifact,
  type DealershipScrapeCertificationArtifact,
} from './scrape-certification';

export interface StoredInventoryScrapeGateComputation {
  gate: DealershipScrapeGateResult;
  sampledVehicles: VehicleReconciliationResult[];
  truthBoundary: string;
  certificationArtifact: DealershipScrapeCertificationArtifact;
}

export interface DealershipScrapeGateResolution {
  gate: DealershipScrapeGateResult;
  truthBoundary: string;
  artifact: DealershipScrapeCertificationArtifact | null;
  source: 'external_certification' | 'stored_inventory_diagnostic' | 'no_inventory';
  launchEligible: boolean;
  certificationBlockers: string[];
}

function deriveSourceTruthFromStoredVehicle(vehicle: any): VehicleTruthSample {
  return {
    vin: vehicle.vin ?? null,
    stockNumber: vehicle.stockNumber ?? null,
    year: vehicle.year ?? null,
    make: vehicle.make ?? null,
    model: vehicle.model ?? null,
    trim: vehicle.trim ?? null,
    price: vehicle.price ?? null,
    odometer: vehicle.odometer ?? null,
    photoCount: Array.isArray(vehicle.images) ? vehicle.images.length : 0,
    primaryPhoto: Array.isArray(vehicle.images) && vehicle.images.length > 0 ? vehicle.images[0] : null,
    transmission: typeof vehicle.transmission === 'string' ? vehicle.transmission : null,
    drivetrain: typeof vehicle.drivetrain === 'string' ? vehicle.drivetrain : null,
    fuelType: typeof vehicle.fuelType === 'string' ? vehicle.fuelType : null,
    exteriorColor: typeof vehicle.exteriorColor === 'string' ? vehicle.exteriorColor : null,
    interiorColor: typeof vehicle.interiorColor === 'string' ? vehicle.interiorColor : null,
    carfaxUrl: typeof vehicle.carfaxUrl === 'string' ? vehicle.carfaxUrl : null,
    carfaxBadges: Array.isArray(vehicle.carfaxBadges)
      ? vehicle.carfaxBadges.filter((value: unknown): value is string => typeof value === 'string')
      : [],
  };
}

function deriveObservedTruthFromStoredVehicle(vehicle: any): VehicleTruthSample {
  const rawImages = Array.isArray(vehicle.images) ? vehicle.images : [];
  const filteredImages = rawImages.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0);
  const uniqueImages = Array.from(new Set<string>(filteredImages));

  return {
    vin: vehicle.vin ?? null,
    stockNumber: vehicle.stockNumber ?? null,
    year: vehicle.year ?? null,
    make: vehicle.make ?? null,
    model: vehicle.model ?? null,
    trim: vehicle.trim ?? null,
    price: vehicle.price ?? null,
    odometer: vehicle.odometer ?? null,
    photoCount: uniqueImages.length,
    primaryPhoto: uniqueImages[0] ?? null,
    transmission: typeof vehicle.transmission === 'string' ? vehicle.transmission : null,
    drivetrain: typeof vehicle.drivetrain === 'string' ? vehicle.drivetrain : null,
    fuelType: typeof vehicle.fuelType === 'string' ? vehicle.fuelType : null,
    exteriorColor: typeof vehicle.exteriorColor === 'string' ? vehicle.exteriorColor : null,
    interiorColor: typeof vehicle.interiorColor === 'string' ? vehicle.interiorColor : null,
    carfaxUrl: typeof vehicle.carfaxUrl === 'string' ? vehicle.carfaxUrl : null,
    carfaxBadges: Array.isArray(vehicle.carfaxBadges)
      ? vehicle.carfaxBadges.filter((value: unknown): value is string => typeof value === 'string')
      : [],
  };
}

export async function computeStoredInventoryScrapeGate(
  dealershipId: number,
): Promise<StoredInventoryScrapeGateComputation | null> {
  const dealership = await storage.getDealership(dealershipId);
  const vehiclePage = await storage.getVehicles(dealershipId, 25, 0);
  if (!vehiclePage.vehicles.length) return null;

  const sampledVehicles = vehiclePage.vehicles.slice(0, 25).map((vehicle) =>
    reconcileVehicleTruth({
      dealershipId,
      source: deriveSourceTruthFromStoredVehicle(vehicle),
      observed: deriveObservedTruthFromStoredVehicle(vehicle),
    }),
  );

  const latestRun = await storage.getLatestScrapeRun(dealershipId);
  const scrapeSuccessRate =
    latestRun && typeof latestRun.vehiclesFound === 'number' && latestRun.vehiclesFound > 0
      ? Math.min(1, vehiclePage.vehicles.length / latestRun.vehiclesFound)
      : 1;

  const hasCarfaxUnknownsOnlyWhenAbsent = vehiclePage.vehicles.every(
    (vehicle) => !vehicle.carfaxUrl || Array.isArray(vehicle.carfaxBadges) || vehicle.carfaxBadges == null,
  );

  const gate = evaluateDealershipScrapeGate({
    dealershipId,
    sampledVehicles,
    scrapeSuccessRate,
    staleRemovalWithinSla: true,
    consecutiveDaysAbove95: 0,
    imageContaminationRate: 0,
    hasCarfaxUnknownsOnlyWhenAbsent,
  });

  const truthBoundary = 'stored_inventory_internal_consistency';
  const certificationArtifact = buildDealershipScrapeCertificationArtifact({
    dealershipId,
    dealershipLabel: dealership ? deriveDealershipOperatorLabel(dealership) : undefined,
    truthBoundary,
    gate,
    metrics: {
      sampledVehicleCount: sampledVehicles.length,
      sampledVehiclePassCount: sampledVehicles.filter((vehicle) => vehicle.criticalMismatchCount === 0).length,
      scrapeSuccessRate,
      staleRemovalWithinSla: true,
      consecutiveDaysAbove95: 0,
      imageContaminationRate: 0,
      hasCarfaxUnknownsOnlyWhenAbsent,
      inventoryTotal: vehiclePage.total,
      latestScrapeRunId: latestRun?.id ?? null,
    },
    sampledVehicles,
    notes: [
      'Computed from stored inventory only.',
      'Use this for diagnostics until direct source reconciliation evidence is captured.',
    ],
  });

  return {
    gate,
    sampledVehicles,
    truthBoundary,
    certificationArtifact,
  };
}

function createBlockedGate(dealershipId: number, blockers: string[]): DealershipScrapeGateResult {
  return {
    dealershipId,
    score: 0,
    passed: false,
    blockers: Array.from(new Set(blockers)),
    categoryBreakdown: {
      identity: 0,
      price: 0,
      media: 0,
      details: 0,
      freshness: 0,
      history: 0,
    },
  };
}

export async function resolveDealershipScrapeGateForPosting(
  dealershipId: number,
): Promise<DealershipScrapeGateResolution> {
  const externalArtifact = readDealershipScrapeCertificationArtifact(dealershipId);
  if (externalArtifact?.truthBoundary === 'source_truth_reconciliation') {
    const assessment = assessDealershipScrapeCertificationArtifact(externalArtifact);
    const postingGate = deriveDealershipScrapePostingGate(externalArtifact);

    return {
      gate: assessment.usable
        ? postingGate
        : mergeDealershipScrapeGateBlockers(postingGate, assessment.blockers),
      truthBoundary: externalArtifact.truthBoundary,
      artifact: externalArtifact,
      source: 'external_certification',
      launchEligible: assessment.usable,
      certificationBlockers: assessment.blockers,
    };
  }

  const diagnostic = await computeStoredInventoryScrapeGate(dealershipId);
  if (diagnostic) {
    const blockers = ['certification_artifact_missing', 'truth_boundary_not_source_reconciled'];
    return {
      gate: mergeDealershipScrapeGateBlockers(diagnostic.gate, blockers),
      truthBoundary: diagnostic.truthBoundary,
      artifact: diagnostic.certificationArtifact,
      source: 'stored_inventory_diagnostic',
      launchEligible: false,
      certificationBlockers: blockers,
    };
  }

  const blockers = ['certification_artifact_missing', 'no_inventory_sample_available'];
  return {
    gate: createBlockedGate(dealershipId, blockers),
    truthBoundary: 'no_inventory_sample_available',
    artifact: null,
    source: 'no_inventory',
    launchEligible: false,
    certificationBlockers: blockers,
  };
}
