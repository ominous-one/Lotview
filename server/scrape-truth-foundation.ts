import { normalizeCarfaxBadgeList } from './carfax-badge-utils';

export type ReconciledField =
  | 'vin'
  | 'stockNumber'
  | 'year'
  | 'make'
  | 'model'
  | 'trim'
  | 'price'
  | 'odometer'
  | 'photoCount'
  | 'primaryPhoto'
  | 'transmission'
  | 'drivetrain'
  | 'fuelType'
  | 'exteriorColor'
  | 'interiorColor'
  | 'carfaxUrl'
  | 'carfaxBadges';

export interface VehicleTruthSample {
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

export interface VehicleReconciliationInput {
  dealershipId: number;
  source: VehicleTruthSample;
  observed: VehicleTruthSample;
}

export interface VehicleFieldMismatch {
  field: ReconciledField;
  sourceValue: unknown;
  observedValue: unknown;
  reason: string;
  blocking: boolean;
}

export interface VehicleReconciliationResult {
  dealershipId: number;
  matches: ReconciledField[];
  mismatches: VehicleFieldMismatch[];
  criticalMismatchCount: number;
  blockingReasons: string[];
}

export interface DealershipScrapeGateInput {
  dealershipId: number;
  sampledVehicles: VehicleReconciliationResult[];
  scrapeSuccessRate: number;
  staleRemovalWithinSla: boolean;
  consecutiveDaysAbove95: number;
  imageContaminationRate: number;
  hasCarfaxUnknownsOnlyWhenAbsent: boolean;
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

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.protocol}//${parsed.host}${path}`.toLowerCase();
  } catch {
    return normalizeText(value);
  }
}

function normalizeBadgeList(values: string[] | null | undefined): string[] {
  return normalizeCarfaxBadgeList(values).map(v => normalizeText(v)!).sort();
}

function equalText(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeText(a) === normalizeText(b);
}

function equalUrl(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeUrl(a) === normalizeUrl(b);
}

function equalNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  return typeof a === 'number' && typeof b === 'number' ? a === b : a == null && b == null;
}

function optionalTextMatches(sourceValue: string | null | undefined, observedValue: string | null | undefined): boolean {
  if (sourceValue == null) return true;
  return equalText(sourceValue, observedValue);
}

function optionalUrlMatches(sourceValue: string | null | undefined, observedValue: string | null | undefined): boolean {
  if (sourceValue == null) return true;
  return equalUrl(sourceValue, observedValue);
}

function optionalNumberMatches(
  sourceValue: number | null | undefined,
  observedValue: number | null | undefined,
  tolerance = 0,
): boolean {
  if (sourceValue == null) return true;
  if (observedValue == null) return false;
  return Math.abs(sourceValue - observedValue) <= tolerance;
}

function optionalBadgeMatch(sourceValue: string[] | null | undefined, observedValue: string[] | null | undefined): boolean {
  const normalizedSource = normalizeBadgeList(sourceValue);
  if (normalizedSource.length === 0) return true;
  return JSON.stringify(normalizedSource) === JSON.stringify(normalizeBadgeList(observedValue));
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 100;
  return (numerator / denominator) * 100;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

export function reconcileVehicleTruth(input: VehicleReconciliationInput): VehicleReconciliationResult {
  const mismatches: VehicleFieldMismatch[] = [];
  const matches: ReconciledField[] = [];

  const pushMismatch = (field: ReconciledField, sourceValue: unknown, observedValue: unknown, reason: string, blocking: boolean) => {
    mismatches.push({ field, sourceValue, observedValue, reason, blocking });
  };

  const check = (field: ReconciledField, ok: boolean, sourceValue: unknown, observedValue: unknown, reason: string, blocking = false) => {
    if (ok) matches.push(field);
    else pushMismatch(field, sourceValue, observedValue, reason, blocking);
  };

  check('vin', equalText(input.source.vin, input.observed.vin), input.source.vin, input.observed.vin, 'VIN mismatch', true);
  check('stockNumber', equalText(input.source.stockNumber, input.observed.stockNumber), input.source.stockNumber, input.observed.stockNumber, 'Stock number mismatch', true);
  check('year', equalNumber(input.source.year, input.observed.year), input.source.year, input.observed.year, 'Year mismatch', true);
  check('make', equalText(input.source.make, input.observed.make), input.source.make, input.observed.make, 'Make mismatch', true);
  check('model', equalText(input.source.model, input.observed.model), input.source.model, input.observed.model, 'Model mismatch', true);
  check('trim', optionalTextMatches(input.source.trim, input.observed.trim), input.source.trim, input.observed.trim, 'Trim mismatch');

  const sourcePrice = input.source.price ?? null;
  const observedPrice = input.observed.price ?? null;
  const priceMatches = typeof sourcePrice === 'number' && typeof observedPrice === 'number'
    ? Math.abs(sourcePrice - observedPrice) <= 1
    : sourcePrice == null && observedPrice == null;
  check('price', priceMatches, sourcePrice, observedPrice, 'Price mismatch', true);

  const sourceOdometer = input.source.odometer ?? null;
  const observedOdometer = input.observed.odometer ?? null;
  const odometerMatches = optionalNumberMatches(sourceOdometer, observedOdometer, 5);
  check('odometer', odometerMatches, sourceOdometer, observedOdometer, 'Odometer mismatch');

  check('photoCount', equalNumber(input.source.photoCount, input.observed.photoCount), input.source.photoCount, input.observed.photoCount, 'Photo count mismatch', true);
  check('primaryPhoto', equalUrl(input.source.primaryPhoto, input.observed.primaryPhoto), input.source.primaryPhoto, input.observed.primaryPhoto, 'Primary photo mismatch', true);
  check('transmission', optionalTextMatches(input.source.transmission, input.observed.transmission), input.source.transmission, input.observed.transmission, 'Transmission mismatch');
  check('drivetrain', optionalTextMatches(input.source.drivetrain, input.observed.drivetrain), input.source.drivetrain, input.observed.drivetrain, 'Drivetrain mismatch');
  check('fuelType', optionalTextMatches(input.source.fuelType, input.observed.fuelType), input.source.fuelType, input.observed.fuelType, 'Fuel type mismatch');
  check('exteriorColor', optionalTextMatches(input.source.exteriorColor, input.observed.exteriorColor), input.source.exteriorColor, input.observed.exteriorColor, 'Exterior color mismatch');
  check('interiorColor', optionalTextMatches(input.source.interiorColor, input.observed.interiorColor), input.source.interiorColor, input.observed.interiorColor, 'Interior color mismatch');
  check('carfaxUrl', optionalUrlMatches(input.source.carfaxUrl, input.observed.carfaxUrl), input.source.carfaxUrl, input.observed.carfaxUrl, 'CARFAX URL mismatch');

  const badgesMatch = optionalBadgeMatch(input.source.carfaxBadges, input.observed.carfaxBadges);
  check('carfaxBadges', badgesMatch, input.source.carfaxBadges ?? [], input.observed.carfaxBadges ?? [], 'CARFAX badge mismatch');

  const blockingReasons = mismatches.filter(m => m.blocking).map(m => `${m.field}:${m.reason}`);

  return {
    dealershipId: input.dealershipId,
    matches,
    mismatches,
    criticalMismatchCount: mismatches.filter(m => m.blocking).length,
    blockingReasons,
  };
}

function countVehiclePasses(results: VehicleReconciliationResult[], fields: ReconciledField[]): number {
  return results.filter(result => fields.every(field => result.matches.includes(field))).length;
}

function countFieldPasses(results: VehicleReconciliationResult[], field: ReconciledField): number {
  return results.filter(result => result.matches.includes(field)).length;
}

export function evaluateDealershipScrapeGate(input: DealershipScrapeGateInput): DealershipScrapeGateResult {
  const total = input.sampledVehicles.length;
  const blockers: string[] = [];

  const identityScore = pct(countVehiclePasses(input.sampledVehicles, ['vin', 'stockNumber', 'year', 'make', 'model']), total);
  const priceScore = pct(countFieldPasses(input.sampledVehicles, 'price'), total);
  const mediaScore = pct(countVehiclePasses(input.sampledVehicles, ['photoCount', 'primaryPhoto']), total);
  const detailsFields: ReconciledField[] = ['trim', 'odometer', 'transmission', 'drivetrain', 'fuelType', 'exteriorColor', 'interiorColor'];
  const detailsPasses = total === 0 ? 0 : input.sampledVehicles.reduce((acc, vehicle) => {
    const passed = detailsFields.filter(field => vehicle.matches.includes(field)).length;
    return acc + passed / detailsFields.length;
  }, 0);
  const detailsScore = total === 0 ? 0 : pct(detailsPasses, total);
  const freshnessScore = clampScore((input.scrapeSuccessRate * 100) - (input.staleRemovalWithinSla ? 0 : 20));
  const historyScore = input.hasCarfaxUnknownsOnlyWhenAbsent ? 100 : 0;

  const weightedScore = clampScore(
    identityScore * 0.25 +
    priceScore * 0.25 +
    mediaScore * 0.20 +
    detailsScore * 0.15 +
    freshnessScore * 0.10 +
    historyScore * 0.05
  );

  if (input.sampledVehicles.some(vehicle => vehicle.matches.includes('vin') === false)) {
    blockers.push('vin_mismatch_present');
  }
  if (priceScore < 99.5) {
    blockers.push('price_accuracy_below_threshold');
  }
  if (mediaScore < 99) {
    blockers.push('media_accuracy_below_threshold');
  }
  if (detailsScore < 98) {
    blockers.push('core_details_below_threshold');
  }
  if (input.scrapeSuccessRate < 0.99) {
    blockers.push('scrape_success_rate_below_threshold');
  }
  if (!input.staleRemovalWithinSla) {
    blockers.push('stale_removal_sla_failed');
  }
  if (input.imageContaminationRate >= 0.02) {
    blockers.push('image_contamination_above_threshold');
  }
  if (!input.hasCarfaxUnknownsOnlyWhenAbsent) {
    blockers.push('carfax_truthfulness_failed');
  }
  if (input.consecutiveDaysAbove95 < 7) {
    blockers.push('insufficient_consecutive_green_days');
  }
  if (weightedScore < 95) {
    blockers.push('overall_score_below_launch_gate');
  }

  return {
    dealershipId: input.dealershipId,
    score: weightedScore,
    passed: blockers.length === 0,
    blockers,
    categoryBreakdown: {
      identity: clampScore(identityScore),
      price: clampScore(priceScore),
      media: clampScore(mediaScore),
      details: clampScore(detailsScore),
      freshness: freshnessScore,
      history: historyScore,
    },
  };
}
