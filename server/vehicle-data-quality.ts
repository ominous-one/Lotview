/**
 * Vehicle Data Quality and Verification
 *
 * These helpers are intentionally conservative. Missing or weak data blocks
 * automation instead of silently allowing uncertified posts/messages.
 */
export interface VehicleDataQualitySignals {
  hasVin: boolean;
  hasPrice: boolean;
  hasPhotos: boolean;
  hasOdometer: boolean;
  hasDescription: boolean;
  qualityScore: number;
  blockers: string[];
}

export interface VehicleVerificationState {
  verified: boolean;
  blockedReason: string | null;
  signals: VehicleDataQualitySignals;
}

export function calculateVehicleQualityScore(vehicle: any): number {
  let score = 0;
  if (vehicle?.vin) score += 20;
  if (vehicle?.price && vehicle.price > 0) score += 20;
  if (Array.isArray(vehicle?.images) && vehicle.images.length > 0) score += 20;
  if (vehicle?.odometer !== undefined && vehicle.odometer !== null) score += 20;
  if (vehicle?.description) score += 20;
  return score;
}

export function computeVehicleDataQualitySignals(vehicle: any): VehicleDataQualitySignals {
  const hasVin = Boolean(vehicle?.vin);
  const hasPrice = typeof vehicle?.price === "number" && vehicle.price > 0;
  const hasPhotos = Array.isArray(vehicle?.images) && vehicle.images.length > 0;
  const hasOdometer = vehicle?.odometer !== undefined && vehicle?.odometer !== null;
  const hasDescription = Boolean(vehicle?.description);
  const blockers: string[] = [];

  if (!hasVin) blockers.push("missing_vin");
  if (!hasPrice) blockers.push("missing_or_invalid_price");
  if (!hasPhotos) blockers.push("missing_photos");
  if (!hasOdometer) blockers.push("missing_odometer");

  return {
    hasVin,
    hasPrice,
    hasPhotos,
    hasOdometer,
    hasDescription,
    qualityScore: calculateVehicleQualityScore(vehicle),
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

export function describeVehicleVerificationBlockReason(reason: string | null | undefined): string {
  switch (reason) {
    case "missing_vin":
      return "Vehicle is missing a VIN.";
    case "missing_or_invalid_price":
      return "Vehicle is missing a valid price.";
    case "missing_photos":
      return "Vehicle is missing photos.";
    case "missing_odometer":
      return "Vehicle is missing odometer data.";
    case null:
    case undefined:
      return "Vehicle is verified.";
    default:
      return reason.replace(/_/g, " ");
  }
}
