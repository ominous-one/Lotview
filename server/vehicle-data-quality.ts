/**
 * Stub: Vehicle Data Quality
 */
export function calculateVehicleQualityScore(vehicle: any): number {
  let score = 0;
  if (vehicle.vin) score += 20;
  if (vehicle.price && vehicle.price > 0) score += 20;
  if (vehicle.images && vehicle.images.length > 0) score += 20;
  if (vehicle.odometer !== undefined) score += 20;
  if (vehicle.description) score += 20;
  return score;
}
