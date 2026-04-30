export function normalizeStockNumber(stockNumber: unknown): string | null {
  if (stockNumber === null || stockNumber === undefined) return null;
  const value = String(stockNumber).trim().toUpperCase();
  if (!value) return null;

  const normalized = value.replace(/[^A-Z0-9]/g, "");
  return normalized.length > 0 ? normalized : null;
}

export function withNormalizedStockNumber<T extends Record<string, unknown>>(
  payload: T,
): T & { normalizedStockNumber?: string | null } {
  if (!Object.prototype.hasOwnProperty.call(payload, "stockNumber")) {
    return payload;
  }

  return {
    ...payload,
    normalizedStockNumber: normalizeStockNumber(payload.stockNumber),
  };
}

export type VehicleStockIdentity = {
  id?: unknown;
  vin?: unknown;
  stockNumber?: unknown;
  normalizedStockNumber?: unknown;
  status?: unknown;
  lifecycleStatus?: unknown;
  deletedAt?: unknown;
};

const INACTIVE_STATUS_VALUES = new Set(["sold", "archived", "deleted", "removed", "removed_by_sync"]);
const INACTIVE_LIFECYCLE_VALUES = new Set(["SOLD", "ARCHIVED", "DELETED", "REMOVED", "REMOVED_BY_SYNC"]);

export function isActiveVehicleStockIdentity(vehicle: VehicleStockIdentity): boolean {
  if (vehicle.deletedAt) return false;

  const status = typeof vehicle.status === "string" ? vehicle.status.trim().toLowerCase() : "";
  if (status && INACTIVE_STATUS_VALUES.has(status)) return false;

  const lifecycleStatus = typeof vehicle.lifecycleStatus === "string" ? vehicle.lifecycleStatus.trim().toUpperCase() : "";
  if (lifecycleStatus && INACTIVE_LIFECYCLE_VALUES.has(lifecycleStatus)) return false;

  return true;
}

export function vehicleNormalizedStockNumber(vehicle: VehicleStockIdentity): string | null {
  return normalizeStockNumber(vehicle.normalizedStockNumber ?? vehicle.stockNumber);
}

export function findActiveStockNumberConflict<T extends VehicleStockIdentity>(
  vehicles: T[],
  stockNumber: unknown,
  options: { excludeVehicleId?: number } = {},
): T | undefined {
  const normalizedStockNumber = normalizeStockNumber(stockNumber);
  if (!normalizedStockNumber) return undefined;

  return vehicles.find((vehicle) => {
    if (!isActiveVehicleStockIdentity(vehicle)) return false;
    if (
      options.excludeVehicleId !== undefined &&
      typeof vehicle.id === "number" &&
      vehicle.id === options.excludeVehicleId
    ) {
      return false;
    }
    return vehicleNormalizedStockNumber(vehicle) === normalizedStockNumber;
  });
}
