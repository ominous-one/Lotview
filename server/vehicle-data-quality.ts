const FRESH_INVENTORY_MS = 14 * 24 * 60 * 60 * 1000;

export interface VehicleDataQualitySignals {
  hasVin: boolean;
  hasStockNumber: boolean;
  hasExactIdentity: boolean;
  hasPrice: boolean;
  hasPhotos: boolean;
  hasOdometer: boolean;
  hasDescription: boolean;
  isSoldOrRemoved: boolean;
  isFreshForAvailability: boolean;
  qualityScore: number;
  blockers: string[];
}

export interface VehicleVerificationState {
  verified: boolean;
  blockedReason: string | null;
  signals: VehicleDataQualitySignals;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function getPhotoCount(vehicle: any): number {
  const imageSets = [vehicle?.localImages, vehicle?.images];
  const urls = imageSets
    .flatMap((images) => (Array.isArray(images) ? images : []))
    .filter((url): url is string => typeof url === "string" && url.trim().length > 0);
  return new Set(urls.map((url) => url.trim())).size;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function calculateVehicleQualityScore(vehicle: any): number {
  const signals = computeVehicleDataQualitySignals(vehicle);
  let score = 0;
  if (signals.hasExactIdentity) score += 25;
  if (signals.hasPrice) score += 20;
  if (signals.hasPhotos) score += 20;
  if (signals.hasOdometer) score += 15;
  if (signals.hasDescription) score += 10;
  if (signals.isFreshForAvailability) score += 10;
  return score;
}

export function computeVehicleDataQualitySignals(vehicle: any): VehicleDataQualitySignals {
  const hasVin = hasText(vehicle?.vin);
  const hasStockNumber = hasText(vehicle?.stockNumber) || hasText(vehicle?.normalizedStockNumber);
  const hasExactIdentity = hasVin || hasStockNumber;
  const hasPrice = typeof vehicle?.price === "number" && vehicle.price > 0;
  const hasPhotos = getPhotoCount(vehicle) > 0;
  const hasOdometer = vehicle?.odometer !== undefined && vehicle?.odometer !== null;
  const hasDescription = hasText(vehicle?.description) || hasText(vehicle?.vdpDescription) || hasText(vehicle?.highlights);
  const lifecycleStatus = String(vehicle?.lifecycleStatus ?? vehicle?.status ?? "").toUpperCase();
  const isSoldOrRemoved = Boolean(vehicle?.deletedAt) || ["SOLD", "REMOVED", "DELETED", "ARCHIVED"].includes(lifecycleStatus);
  const lastScrapedAt = parseDate(vehicle?.lastScrapedAt ?? vehicle?.updatedAt ?? vehicle?.createdAt);
  const isFreshForAvailability = Boolean(lastScrapedAt) && Date.now() - lastScrapedAt!.getTime() <= FRESH_INVENTORY_MS;
  const blockers: string[] = [];

  if (!hasExactIdentity) blockers.push("missing_vehicle_identity");
  if (isSoldOrRemoved) blockers.push("inventory_not_active");
  if (!isFreshForAvailability) blockers.push("inventory_stale");
  if (!hasPhotos) blockers.push("missing_photos");

  return {
    hasVin,
    hasStockNumber,
    hasExactIdentity,
    hasPrice,
    hasPhotos,
    hasOdometer,
    hasDescription,
    isSoldOrRemoved,
    isFreshForAvailability,
    qualityScore: (
      (hasExactIdentity ? 25 : 0) +
      (hasPrice ? 20 : 0) +
      (hasPhotos ? 20 : 0) +
      (hasOdometer ? 15 : 0) +
      (hasDescription ? 10 : 0) +
      (isFreshForAvailability ? 10 : 0)
    ),
    blockers,
  };
}

export function resolveVehicleVerificationState(vehicle: any): VehicleVerificationState {
  const signals = computeVehicleDataQualitySignals(vehicle);
  return {
    verified: signals.blockers.length === 0,
    blockedReason: signals.blockers[0] ?? null,
    signals,
  };
}

export function describeVehicleVerificationBlockReason(
  stateOrReason: VehicleVerificationState | string | null | undefined,
): string | null {
  const reason = typeof stateOrReason === "string"
    ? stateOrReason
    : stateOrReason?.blockedReason;

  if (!reason) return null;

  const labels: Record<string, string> = {
    missing_vehicle_identity: "Vehicle identity is not verified",
    inventory_not_active: "Vehicle is sold or removed",
    inventory_stale: "Inventory freshness is not verified",
    missing_photos: "Vehicle photos are missing",
  };

  return labels[reason] ?? reason.replace(/_/g, " ");
}

export function buildVehicleTruthfulnessContext(vehicle: any): string[] {
  const signals = computeVehicleDataQualitySignals(vehicle);
  const lines = [
    `Vehicle identity verified: ${signals.hasExactIdentity ? "yes" : "no"}`,
    `Inventory freshness verified: ${signals.isFreshForAvailability ? "yes" : "no"}`,
    `Photo evidence available: ${signals.hasPhotos ? "yes" : "no"}`,
  ];

  if (signals.blockers.length > 0) {
    lines.push(`Do not claim availability or condition beyond stored data. Blockers: ${signals.blockers.join(", ")}`);
  }

  return lines;
}
