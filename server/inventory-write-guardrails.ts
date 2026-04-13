import type { Vehicle } from '@shared/schema';
import { normalizeCarfaxBadgeList } from './carfax-badge-utils';
import { isPlaceholderVin, normalizeStockNumber, normalizeVin } from './inventory-identity';

export interface InventoryWriteCandidate {
  year: number;
  make: string;
  model: string;
  trim?: string | null;
  price: number | null;
  odometer: number | null;
  images: string[];
  vin?: string | null;
  stockNumber?: string | null;
  carfaxUrl?: string | null;
  carfaxBadges?: string[] | null;
  dealerVdpUrl?: string | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  transmission?: string | null;
  fuelType?: string | null;
  drivetrain?: string | null;
  engine?: string | null;
}

export interface InventoryWriteExistingVehicle extends Pick<
  Vehicle,
  | 'id'
  | 'year'
  | 'make'
  | 'model'
  | 'trim'
  | 'price'
  | 'odometer'
  | 'images'
  | 'vin'
  | 'stockNumber'
  | 'normalizedStockNumber'
  | 'carfaxUrl'
  | 'carfaxBadges'
  | 'dealerVdpUrl'
  | 'exteriorColor'
  | 'interiorColor'
  | 'transmission'
  | 'fuelType'
  | 'drivetrain'
  | 'engine'
> {}

export interface InventoryWriteDecision {
  allow: boolean;
  blockers: string[];
  warnings: string[];
  normalizedVin: string | null;
  normalizedStockNumber: string | null;
  normalizedDealerVdpUrl: string | null;
  groundedCarfaxUrl: string | null;
  normalizedCarfaxBadges: string[];
  fields: {
    trim: string | null;
    exteriorColor: string | null;
    interiorColor: string | null;
    transmission: string | null;
    fuelType: string | null;
    drivetrain: string | null;
    engine: string | null;
  };
}

export class InventoryWriteGuardError extends Error {
  readonly blockers: string[];
  readonly warnings: string[];

  constructor(blockers: string[], warnings: string[] = []) {
    super(`Inventory write blocked: ${blockers.join(', ')}`);
    this.name = 'InventoryWriteGuardError';
    this.blockers = blockers;
    this.warnings = warnings;
  }
}

function normalizeVdpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    let normalizedPath = parsed.pathname.replace(/\/+$/, '');
    if (!normalizedPath) normalizedPath = '/';
    let normalized = `${parsed.protocol}//${parsed.host}${normalizedPath}`;
    if (normalized.endsWith('/') && normalized.length > parsed.origin.length + 1) {
      normalized = normalized.slice(0, -1);
    }
    return normalized.toLowerCase();
  } catch {
    return url.toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
  }
}

function normalizeTrimmedString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function looksLikeInventoryNoise(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed) return false;
  if (trimmed.length > 120) return true;
  if (/<[^>]+>/.test(trimmed)) return true;
  if (/https?:\/\//i.test(trimmed) || /\bwww\./i.test(trimmed)) return true;
  if (/\b[a-z0-9-]+\.(com|ca|net|org|ai)\b/i.test(trimmed)) return true;
  if (/\/vehicles\/|sale_class=|inventory\//i.test(trimmed)) return true;
  if (/\b(print page|get approved|book appointment|payment calculator|view history report)\b/i.test(lower)) return true;
  if (/\b(stock|vin|engine|transmission|drive train|drivetrain|mileage|kilometers?)\s*:/i.test(trimmed)) return true;
  return false;
}

export function sanitizeVehicleTextField(value: string | null | undefined): string | null {
  const normalized = normalizeTrimmedString(value);
  if (!normalized) return null;
  if (looksLikeInventoryNoise(normalized)) return null;
  return normalized;
}

const VEHICLE_COLOR_TOKENS = [
  'black', 'white', 'blue', 'red', 'silver', 'grey', 'gray', 'green', 'orange', 'yellow', 'beige',
  'brown', 'tan', 'burgundy', 'maroon', 'ivory', 'charcoal', 'graphite', 'bronze', 'gold', 'purple',
];

export function sanitizeVehicleColorField(value: string | null | undefined): string | null {
  const normalized = normalizeTrimmedString(value);
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  const compact = lower.replace(/[^a-z]+/g, ' ');
  const matchedColors = VEHICLE_COLOR_TOKENS.filter((token) => compact.includes(token));

  if (matchedColors.length === 0) {
    return null;
  }

  if (looksLikeInventoryNoise(normalized)) {
    return matchedColors[0]
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= 3) {
    return normalized;
  }

  return matchedColors[0]
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function normalizeGroundedCarfaxUrl(value: string | null | undefined): string | null {
  const normalized = normalizeTrimmedString(value);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const host = parsed.host.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    const vinParam = parsed.searchParams.get('vin');
    const reportId = parsed.searchParams.get('id');

    if ((host === 'www.carfax.ca' || host === 'carfax.ca' || host === 'www.carfax.com' || host === 'carfax.com') && pathname === '/') {
      return null;
    }

    if ((host === 'www.carfax.com' || host === 'carfax.com') && pathname.toLowerCase() === '/vehiclehistory/p/report.cfx' && vinParam) {
      return null;
    }

    if (host === 'vhr.carfax.ca' || host === 'vhr.carfax.com') {
      return reportId ? parsed.toString() : null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function countIncomingConfidenceSignals(candidate: InventoryWriteCandidate, normalizedVin: string | null, normalizedStockNumber: string | null, normalizedDealerVdpUrl: string | null): number {
  let count = 0;
  if (normalizedVin) count++;
  if (normalizedStockNumber) count++;
  if (normalizedDealerVdpUrl) count++;
  if ((candidate.price ?? 0) > 0) count++;
  if (candidate.images.length > 0) count++;
  return count;
}

function countExistingConfidenceSignals(existing?: InventoryWriteExistingVehicle | null): number {
  if (!existing) return 0;

  let count = 0;
  const normalizedVin = normalizeVin(existing.vin);
  if (normalizedVin && !isPlaceholderVin(normalizedVin)) count++;
  if (normalizeStockNumber(existing.normalizedStockNumber) || normalizeStockNumber(existing.stockNumber)) count++;
  if (normalizeVdpUrl(existing.dealerVdpUrl)) count++;
  if ((existing.price ?? 0) > 0) count++;
  if ((existing.images?.length ?? 0) > 0) count++;
  return count;
}

export function assessInventoryWrite(
  candidate: InventoryWriteCandidate,
  existing?: InventoryWriteExistingVehicle | null,
): InventoryWriteDecision {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const normalizedVinRaw = normalizeVin(candidate.vin);
  const normalizedVin = normalizedVinRaw && !isPlaceholderVin(normalizedVinRaw) && normalizedVinRaw.length === 17
    ? normalizedVinRaw
    : null;
  const normalizedStockNumber = normalizeStockNumber(candidate.stockNumber);
  const normalizedDealerVdpUrl = normalizeVdpUrl(candidate.dealerVdpUrl);
  const groundedCarfaxUrl = normalizeGroundedCarfaxUrl(candidate.carfaxUrl);
  const normalizedCarfaxBadges = normalizeCarfaxBadgeList(candidate.carfaxBadges ?? []);

  const sanitizedFields = {
    trim: sanitizeVehicleTextField(candidate.trim),
    exteriorColor: sanitizeVehicleColorField(candidate.exteriorColor),
    interiorColor: sanitizeVehicleColorField(candidate.interiorColor),
    transmission: sanitizeVehicleTextField(candidate.transmission),
    fuelType: sanitizeVehicleTextField(candidate.fuelType),
    drivetrain: sanitizeVehicleTextField(candidate.drivetrain),
    engine: sanitizeVehicleTextField(candidate.engine),
  };

  for (const [field, rawValue] of Object.entries({
    trim: candidate.trim,
    exteriorColor: candidate.exteriorColor,
    interiorColor: candidate.interiorColor,
    transmission: candidate.transmission,
    fuelType: candidate.fuelType,
    drivetrain: candidate.drivetrain,
    engine: candidate.engine,
  })) {
    const sanitizedValue = field === 'exteriorColor' || field === 'interiorColor'
      ? sanitizeVehicleColorField(rawValue)
      : sanitizeVehicleTextField(rawValue);
    if (normalizeTrimmedString(rawValue) && !sanitizedValue) {
      warnings.push(`suspicious_${field}_discarded`);
    }
  }

  if (candidate.carfaxUrl && !groundedCarfaxUrl) {
    warnings.push('ungrounded_carfax_url_discarded');
  }

  const incomingConfidenceSignals = countIncomingConfidenceSignals(candidate, normalizedVin, normalizedStockNumber, normalizedDealerVdpUrl);
  const existingConfidenceSignals = countExistingConfidenceSignals(existing);

  if (!existing) {
    const exactIdentitySignals = Number(Boolean(normalizedVin)) + Number(Boolean(normalizedStockNumber)) + Number(Boolean(normalizedDealerVdpUrl));
    if (exactIdentitySignals < 2) {
      blockers.push('insert_identity_incomplete');
    }
    if (incomingConfidenceSignals < 3) {
      blockers.push('insert_low_confidence_payload');
    }
  } else {
    const existingNormalizedVinRaw = normalizeVin(existing.vin);
    const existingNormalizedVin = existingNormalizedVinRaw && !isPlaceholderVin(existingNormalizedVinRaw) && existingNormalizedVinRaw.length === 17
      ? existingNormalizedVinRaw
      : null;
    const existingNormalizedStock = normalizeStockNumber(existing.normalizedStockNumber) || normalizeStockNumber(existing.stockNumber);
    const existingNormalizedVdpUrl = normalizeVdpUrl(existing.dealerVdpUrl);

    if (existingNormalizedVin && normalizedVin && existingNormalizedVin !== normalizedVin) {
      blockers.push('vin_conflict_with_existing_record');
    }
    if (existingNormalizedStock && normalizedStockNumber && existingNormalizedStock !== normalizedStockNumber) {
      blockers.push('stock_conflict_with_existing_record');
    }
    if (existingNormalizedVdpUrl && normalizedDealerVdpUrl && existingNormalizedVdpUrl !== normalizedDealerVdpUrl) {
      blockers.push('dealer_vdp_conflict_with_existing_record');
    }

    const incomingLooksDestructive =
      incomingConfidenceSignals <= 1 &&
      existingConfidenceSignals >= 3 &&
      (candidate.images.length === 0 || (candidate.price ?? 0) <= 0 || warnings.some((warning) => warning.startsWith('suspicious_')));

    if (incomingLooksDestructive) {
      blockers.push('destructive_regression_payload');
    }
  }

  return {
    allow: blockers.length === 0,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    normalizedVin,
    normalizedStockNumber,
    normalizedDealerVdpUrl,
    groundedCarfaxUrl,
    normalizedCarfaxBadges,
    fields: sanitizedFields,
  };
}
