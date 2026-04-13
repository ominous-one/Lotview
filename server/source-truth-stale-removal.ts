import { normalizeDealerVdpUrl, type ObservedInventoryVehicle } from './live-source-reconciliation';

export interface SourceTruthComparableVehicle extends Pick<
  ObservedInventoryVehicle,
  'id' | 'dealerVdpUrl' | 'year' | 'make' | 'model' | 'trim'
> {
  missedScrapeCount?: number | null;
}

export interface SourceTruthStaleRemovalDecision {
  safeToApply: boolean;
  blockedReason: string | null;
  visibleSourceVehicleCount: number;
  comparableInventoryCount: number;
  matchedVehicleCount: number;
  staleVehicleCount: number;
  staleRatio: number;
  foundVehicleIds: number[];
  staleVehicles: SourceTruthComparableVehicle[];
}

const DEFAULT_MIN_VISIBLE_SOURCE_VEHICLE_COUNT = 15;
const DEFAULT_MAX_STALE_DELETION_RATIO = 0.5;

export function assessSourceTruthStaleRemoval(params: {
  visibleSourceVehicleUrls: string[];
  observedVehicles: SourceTruthComparableVehicle[];
  minVisibleSourceVehicleCount?: number;
  maxDeletionRatio?: number;
}): SourceTruthStaleRemovalDecision {
  const minVisibleSourceVehicleCount = params.minVisibleSourceVehicleCount ?? DEFAULT_MIN_VISIBLE_SOURCE_VEHICLE_COUNT;
  const maxDeletionRatio = params.maxDeletionRatio ?? DEFAULT_MAX_STALE_DELETION_RATIO;

  const normalizedSourceVehicleUrls = Array.from(
    new Set(
      params.visibleSourceVehicleUrls
        .map((url) => normalizeDealerVdpUrl(url))
        .filter((url): url is string => Boolean(url)),
    ),
  );

  if (normalizedSourceVehicleUrls.length === 0) {
    return {
      safeToApply: false,
      blockedReason: 'no_source_vehicle_urls',
      visibleSourceVehicleCount: 0,
      comparableInventoryCount: 0,
      matchedVehicleCount: 0,
      staleVehicleCount: 0,
      staleRatio: 0,
      foundVehicleIds: [],
      staleVehicles: [],
    };
  }

  if (normalizedSourceVehicleUrls.length < minVisibleSourceVehicleCount) {
    return {
      safeToApply: false,
      blockedReason: 'source_vehicle_count_below_threshold',
      visibleSourceVehicleCount: normalizedSourceVehicleUrls.length,
      comparableInventoryCount: 0,
      matchedVehicleCount: 0,
      staleVehicleCount: 0,
      staleRatio: 0,
      foundVehicleIds: [],
      staleVehicles: [],
    };
  }

  const sourceUrlSet = new Set(normalizedSourceVehicleUrls);
  const comparableInventory = params.observedVehicles.filter((vehicle) => normalizeDealerVdpUrl(vehicle.dealerVdpUrl));

  if (comparableInventory.length === 0) {
    return {
      safeToApply: false,
      blockedReason: 'observed_inventory_missing_vdp_urls',
      visibleSourceVehicleCount: normalizedSourceVehicleUrls.length,
      comparableInventoryCount: 0,
      matchedVehicleCount: 0,
      staleVehicleCount: 0,
      staleRatio: 0,
      foundVehicleIds: [],
      staleVehicles: [],
    };
  }

  const foundVehicleIds: number[] = [];
  const staleVehicles: SourceTruthComparableVehicle[] = [];

  for (const vehicle of comparableInventory) {
    const normalizedObservedUrl = normalizeDealerVdpUrl(vehicle.dealerVdpUrl);
    if (!normalizedObservedUrl) continue;

    if (sourceUrlSet.has(normalizedObservedUrl)) {
      foundVehicleIds.push(vehicle.id);
      continue;
    }

    staleVehicles.push(vehicle);
  }

  const staleRatio = comparableInventory.length > 0 ? staleVehicles.length / comparableInventory.length : 0;
  const blockedReason = staleRatio > maxDeletionRatio ? 'stale_deletion_ratio_above_threshold' : null;

  return {
    safeToApply: !blockedReason,
    blockedReason,
    visibleSourceVehicleCount: normalizedSourceVehicleUrls.length,
    comparableInventoryCount: comparableInventory.length,
    matchedVehicleCount: foundVehicleIds.length,
    staleVehicleCount: staleVehicles.length,
    staleRatio,
    foundVehicleIds,
    staleVehicles,
  };
}
