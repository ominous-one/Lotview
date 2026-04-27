export interface VehicleTruthSample {
  vin: string | null;
  stockNumber: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  price: number | null;
  odometer: number | null;
  photoCount: number;
  primaryPhoto: string | null;
  transmission: string | null;
  drivetrain: string | null;
  fuelType: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  carfaxUrl: string | null;
  carfaxBadges: string[];
}

export interface VehicleReconciliationResult {
  dealershipId: number;
  vin: string | null;
  stockNumber: string | null;
  criticalMismatchCount: number;
  mismatches: string[];
}

export interface DealershipScrapeGateResult {
  dealershipId: number;
  score: number;
  passed: boolean;
  blockers: string[];
  categoryBreakdown: {
    identity: number;
    price: number;
    media: number;
    details: number;
    freshness: number;
    history: number;
  };
}

export function validateScrapeData(data: unknown): boolean {
  return Boolean(data && typeof data === "object");
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left == null && right == null) return true;
  return String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase();
}

export function reconcileVehicleTruth(input: {
  dealershipId: number;
  source: VehicleTruthSample;
  observed: VehicleTruthSample;
}): VehicleReconciliationResult {
  const mismatches: string[] = [];

  for (const key of ["vin", "stockNumber", "year", "make", "model", "price", "odometer"] as const) {
    if (!sameValue(input.source[key], input.observed[key])) {
      mismatches.push(key);
    }
  }

  if ((input.observed.photoCount ?? 0) < 1) {
    mismatches.push("photoCount");
  }

  return {
    dealershipId: input.dealershipId,
    vin: input.observed.vin ?? input.source.vin,
    stockNumber: input.observed.stockNumber ?? input.source.stockNumber,
    criticalMismatchCount: mismatches.length,
    mismatches,
  };
}

export function evaluateDealershipScrapeGate(input: {
  dealershipId: number;
  sampledVehicles: VehicleReconciliationResult[];
  scrapeSuccessRate: number;
  staleRemovalWithinSla: boolean;
  consecutiveDaysAbove95: number;
  imageContaminationRate: number;
  hasCarfaxUnknownsOnlyWhenAbsent: boolean;
}): DealershipScrapeGateResult {
  const blockers: string[] = [];
  const sampleCount = input.sampledVehicles.length;
  const passingSamples = input.sampledVehicles.filter((vehicle) => vehicle.criticalMismatchCount === 0).length;
  const samplePassRate = sampleCount > 0 ? passingSamples / sampleCount : 0;

  if (sampleCount === 0) blockers.push("no_inventory_sample_available");
  if (samplePassRate < 0.95) blockers.push("vehicle_truth_sample_below_95_percent");
  if (input.scrapeSuccessRate < 0.95) blockers.push("scrape_success_rate_below_95_percent");
  if (!input.staleRemovalWithinSla) blockers.push("stale_removal_outside_sla");
  if (input.imageContaminationRate > 0.01) blockers.push("image_contamination_above_threshold");
  if (!input.hasCarfaxUnknownsOnlyWhenAbsent) blockers.push("carfax_unknowns_not_explained");

  const identity = Math.round(samplePassRate * 100);
  const freshness = input.staleRemovalWithinSla ? 100 : 0;
  const media = Math.max(0, Math.round((1 - input.imageContaminationRate) * 100));
  const history = input.hasCarfaxUnknownsOnlyWhenAbsent ? 100 : 0;
  const score = Math.round((identity + freshness + media + history + Math.round(input.scrapeSuccessRate * 100)) / 5);

  return {
    dealershipId: input.dealershipId,
    score,
    passed: blockers.length === 0,
    blockers,
    categoryBreakdown: {
      identity,
      price: identity,
      media,
      details: identity,
      freshness,
      history,
    },
  };
}
