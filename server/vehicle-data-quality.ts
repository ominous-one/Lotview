import type { Vehicle } from '@shared/schema';
import { isPlaceholderVin, normalizeStockNumber, normalizeVin } from './inventory-identity';

export interface VehicleDataQualitySignals {
  freshnessHours: number | null;
  isFreshForAvailability: boolean;
  isSoldOrRemoved: boolean;
  hasTrustedHistorySignal: boolean;
  hasExactIdentity: boolean;
  provenance: string[];
  blockers: string[];
}

export const DEFAULT_AVAILABILITY_FRESHNESS_HOURS = 36;

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function computeVehicleDataQualitySignals(
  vehicle: Pick<Vehicle,
    'vin' |
    'stockNumber' |
    'normalizedStockNumber' |
    'dealerVdpUrl' |
    'carfaxUrl' |
    'carfaxBadges' |
    'lastScrapedAt' |
    'deletedAt' |
    'lifecycleStatus' |
    'photoStatus'
  >,
  options?: { freshnessHours?: number },
): VehicleDataQualitySignals {
  const freshnessHours = options?.freshnessHours ?? DEFAULT_AVAILABILITY_FRESHNESS_HOURS;
  const blockers: string[] = [];
  const provenance: string[] = [];

  const lastScrapedAt = toDate(vehicle.lastScrapedAt);
  const freshnessAgeHours = lastScrapedAt
    ? (Date.now() - lastScrapedAt.getTime()) / (1000 * 60 * 60)
    : null;

  if (lastScrapedAt) {
    provenance.push('inventory:last_scraped_at');
  } else {
    blockers.push('freshness_unknown');
  }

  const isSoldOrRemoved = !!vehicle.deletedAt || ['SOLD', 'REMOVED_BY_SYNC'].includes((vehicle.lifecycleStatus || '').toUpperCase());
  if (isSoldOrRemoved) blockers.push('inventory_not_active');

  const normalizedVin = normalizeVin(vehicle.vin);
  const normalizedStock = vehicle.normalizedStockNumber || normalizeStockNumber(vehicle.stockNumber);
  const hasExactIdentity = !!normalizedVin && !isPlaceholderVin(normalizedVin) && !!normalizedStock;
  if (normalizedVin && !isPlaceholderVin(normalizedVin)) provenance.push('identity:vin');
  if (normalizedStock) provenance.push('identity:stock');
  if (vehicle.dealerVdpUrl) provenance.push('source:dealer_vdp');
  if (!hasExactIdentity) blockers.push('identity_incomplete');

  const hasTrustedHistorySignal = !!vehicle.carfaxUrl || (Array.isArray(vehicle.carfaxBadges) && vehicle.carfaxBadges.length > 0);
  if (vehicle.carfaxUrl) provenance.push('history:carfax_url');
  if (Array.isArray(vehicle.carfaxBadges) && vehicle.carfaxBadges.length > 0) provenance.push('history:carfax_badges');

  if (vehicle.photoStatus === 'no_vdp' || !vehicle.dealerVdpUrl) {
    blockers.push('missing_vdp_source');
  }

  const isFreshForAvailability = freshnessAgeHours !== null && freshnessAgeHours <= freshnessHours;
  if (!isFreshForAvailability) blockers.push('inventory_stale');

  return {
    freshnessHours: freshnessAgeHours,
    isFreshForAvailability,
    isSoldOrRemoved,
    hasTrustedHistorySignal,
    hasExactIdentity,
    provenance,
    blockers: Array.from(new Set(blockers)),
  };
}

export function buildVehicleTruthfulnessContext(
  vehicle: Pick<Vehicle,
    'vin' |
    'stockNumber' |
    'normalizedStockNumber' |
    'dealerVdpUrl' |
    'carfaxUrl' |
    'carfaxBadges' |
    'lastScrapedAt' |
    'deletedAt' |
    'lifecycleStatus' |
    'photoStatus'
  >,
): string[] {
  const signals = computeVehicleDataQualitySignals(vehicle);
  const lines: string[] = [];

  if (signals.provenance.length > 0) {
    lines.push(`Verification Signals: ${signals.provenance.join(', ')}`);
  }
  if (signals.freshnessHours !== null) {
    lines.push(`Inventory Freshness: ${signals.freshnessHours.toFixed(1)}h since last scrape`);
  } else {
    lines.push('Inventory Freshness: unknown');
  }
  if (signals.blockers.length > 0) {
    lines.push(`Truthfulness Guardrails: ${signals.blockers.join(', ')}`);
  }

  return lines;
}
