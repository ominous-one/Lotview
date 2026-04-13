import type { VehicleListing } from './browserless-unified';
import { normalizeCarfaxBadgeList } from './carfax-badge-utils';
import { normalizeGroundedCarfaxUrl, sanitizeVehicleColorField, sanitizeVehicleTextField } from './inventory-write-guardrails';
import { reconcileVehicleTruth, type VehicleTruthSample } from './scrape-truth-foundation';

export interface ObservedInventoryVehicle {
  id: number;
  vin?: string | null;
  stockNumber?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  price?: number | null;
  odometer?: number | null;
  images?: string[] | null;
  transmission?: string | null;
  drivetrain?: string | null;
  fuelType?: string | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  carfaxUrl?: string | null;
  carfaxBadges?: string[] | null;
  dealerVdpUrl?: string | null;
}

export interface DealershipReferenceSummary {
  id: number;
  label: string;
  name: string;
  slug?: string | null;
  subdomain?: string | null;
}

export interface LiveSourceReconciliationArtifact {
  generatedAt: string;
  artifactType: 'launch10-live-dealership-reconciliation';
  truthBoundary: string;
  dealership: {
    id: number;
    label: string;
    name: string;
    slug?: string | null;
    subdomain?: string | null;
    listingUrl: string;
    listingPageSignals: {
      visibleVehicleLinkCount: number;
      visibleVehicleUrls: string[];
      sampledVdpCount: number;
      matchedStoredVehicleCount: number;
      missingStoredVehicleCount: number;
      missingStoredVehicleUrlsTop10: string[];
    };
  };
  sampledVehicles: Array<{
    source: {
      vin: string | null;
      stockNumber: string | null;
      year: number | null;
      make: string | null;
      model: string | null;
      trim: string | null;
      price: number | null;
      odometer: number | null;
      photoCountObservedInDom: number | null;
      primaryPhoto: string | null;
      transmission: string | null;
      drivetrain: string | null;
      fuelType: string | null;
      exteriorColor: string | null;
      interiorColor: string | null;
      carfaxUrl: string | null;
      carfaxBadges: string[];
      carfaxSignalsPresent: boolean;
      vdpUrl: string | null;
    };
    observed: {
      vehicleId: number | null;
      matchedBy: 'dealerVdpUrl' | 'vin' | 'stockNumber' | 'unmatched';
      vin: string | null;
      stockNumber: string | null;
      year: number | null;
      make: string | null;
      model: string | null;
      trim: string | null;
      price: number | null;
      odometer: number | null;
      photoCount: number | null;
      primaryPhoto: string | null;
      transmission: string | null;
      drivetrain: string | null;
      fuelType: string | null;
      exteriorColor: string | null;
      interiorColor: string | null;
      carfaxUrl: string | null;
      carfaxBadges: string[];
      dealerVdpUrl: string | null;
    };
    reconciliationSummary: {
      status: 'match' | 'mismatch' | 'missing_in_inventory';
      blockingMismatches: string[];
    };
  }>;
}

interface ComparableVehicleTruthLike {
  vin?: string | null;
  stockNumber?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  price?: number | null;
  odometer?: number | null;
  images?: string[] | null;
  photoCountObservedInDom?: number | null;
  photoCount?: number | null;
  primaryPhoto?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  fuelType?: string | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  carfaxUrl?: string | null;
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

export function normalizeDealerVdpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.protocol}//${parsed.host}${pathname}`.toLowerCase();
  } catch {
    return normalizeText(value)?.replace(/[?#].*$/, '').replace(/\/+$/, '') ?? null;
  }
}

function normalizeHistoryBadge(value: string): string {
  const normalized = normalizeText(value) ?? value;
  if (normalized === 'no accidents') return 'No Reported Accidents';
  if (normalized === 'accidentfree') return 'No Reported Accidents';
  if (normalized === 'oneowner') return 'One Owner';
  if (normalized === 'lowkilometer') return 'Low Kilometers';
  return value;
}

function deriveSourceHistoryBadges(sourceVehicle: VehicleListing): string[] {
  return normalizeCarfaxBadgeList(
    (sourceVehicle.badges ?? [])
      .map(normalizeHistoryBadge)
      .filter((badge) =>
        ['One Owner', 'No Reported Accidents', 'Certified Pre-Owned', 'Low Kilometers', 'Service History'].includes(badge),
      ),
  );
}

export function normalizeCarfaxEvidenceUrl(value: string | null | undefined): string | null {
  return normalizeGroundedCarfaxUrl(value);
}

export function isVehicleImageProxyUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith('/api/public/vehicle-image/') || value.includes('/api/public/vehicle-image/');
}

function deriveComparablePhotoCount(vehicle: ComparableVehicleTruthLike, options?: { preferObservedCount?: boolean }): number | null {
  const arrayCount = Array.isArray(vehicle.images) ? vehicle.images.length : null;
  const explicitCount = options?.preferObservedCount
    ? vehicle.photoCount ?? vehicle.photoCountObservedInDom ?? null
    : vehicle.photoCountObservedInDom ?? vehicle.photoCount ?? null;
  return explicitCount ?? arrayCount;
}

function deriveComparablePrimaryPhoto(vehicle: ComparableVehicleTruthLike): string | null {
  return (Array.isArray(vehicle.images) ? vehicle.images[0] : null) ?? vehicle.primaryPhoto ?? null;
}

export function buildComparableVehicleTruthSamples(
  sourceVehicle: ComparableVehicleTruthLike,
  observedVehicle: ComparableVehicleTruthLike,
  sourceBadges: string[] = [],
  observedBadges: string[] = [],
): { source: VehicleTruthSample; observed: VehicleTruthSample } {
  let sourcePhotoCount = deriveComparablePhotoCount(sourceVehicle);
  const observedPhotoCount = deriveComparablePhotoCount(observedVehicle, { preferObservedCount: true });

  if (
    typeof sourcePhotoCount === 'number' &&
    typeof observedPhotoCount === 'number' &&
    sourcePhotoCount > 0 &&
    observedPhotoCount >= sourcePhotoCount
  ) {
    sourcePhotoCount = observedPhotoCount;
  }

  let sourcePrimaryPhoto = deriveComparablePrimaryPhoto(sourceVehicle);
  let observedPrimaryPhoto = deriveComparablePrimaryPhoto(observedVehicle);
  if (isVehicleImageProxyUrl(observedPrimaryPhoto)) {
    sourcePrimaryPhoto = null;
    observedPrimaryPhoto = null;
  }

  return {
    source: {
      vin: sourceVehicle.vin ?? null,
      stockNumber: sourceVehicle.stockNumber ?? null,
      year: sourceVehicle.year ?? null,
      make: sourceVehicle.make ?? null,
      model: sourceVehicle.model ?? null,
      trim: sanitizeVehicleTextField(sourceVehicle.trim) ?? null,
      price: sourceVehicle.price ?? null,
      odometer: sourceVehicle.odometer ?? null,
      photoCount: sourcePhotoCount,
      primaryPhoto: sourcePrimaryPhoto,
      transmission: sanitizeVehicleTextField(sourceVehicle.transmission) ?? null,
      drivetrain: sanitizeVehicleTextField(sourceVehicle.drivetrain) ?? null,
      fuelType: sanitizeVehicleTextField(sourceVehicle.fuelType) ?? null,
      exteriorColor: sanitizeVehicleColorField(sourceVehicle.exteriorColor) ?? null,
      interiorColor: sanitizeVehicleColorField(sourceVehicle.interiorColor) ?? null,
      carfaxUrl: normalizeCarfaxEvidenceUrl(sourceVehicle.carfaxUrl),
      carfaxBadges: normalizeCarfaxBadgeList(sourceBadges),
    },
    observed: {
      vin: observedVehicle.vin ?? null,
      stockNumber: observedVehicle.stockNumber ?? null,
      year: observedVehicle.year ?? null,
      make: observedVehicle.make ?? null,
      model: observedVehicle.model ?? null,
      trim: sanitizeVehicleTextField(observedVehicle.trim) ?? null,
      price: observedVehicle.price ?? null,
      odometer: observedVehicle.odometer ?? null,
      photoCount: observedPhotoCount,
      primaryPhoto: observedPrimaryPhoto,
      transmission: sanitizeVehicleTextField(observedVehicle.transmission) ?? null,
      drivetrain: sanitizeVehicleTextField(observedVehicle.drivetrain) ?? null,
      fuelType: sanitizeVehicleTextField(observedVehicle.fuelType) ?? null,
      exteriorColor: sanitizeVehicleColorField(observedVehicle.exteriorColor) ?? null,
      interiorColor: sanitizeVehicleColorField(observedVehicle.interiorColor) ?? null,
      carfaxUrl: normalizeCarfaxEvidenceUrl(observedVehicle.carfaxUrl),
      carfaxBadges: normalizeCarfaxBadgeList(observedBadges),
    },
  };
}

export function matchObservedVehicle(
  sourceVehicle: VehicleListing,
  observedVehicles: ObservedInventoryVehicle[],
): { vehicle: ObservedInventoryVehicle | null; matchedBy: 'dealerVdpUrl' | 'vin' | 'stockNumber' | 'unmatched' } {
  const sourceVdp = normalizeDealerVdpUrl(sourceVehicle.dealerVdpUrl);
  if (sourceVdp) {
    const byVdp = observedVehicles.find((vehicle) => normalizeDealerVdpUrl(vehicle.dealerVdpUrl) === sourceVdp);
    if (byVdp) {
      return { vehicle: byVdp, matchedBy: 'dealerVdpUrl' };
    }
  }

  const sourceVin = normalizeText(sourceVehicle.vin);
  if (sourceVin) {
    const byVin = observedVehicles.find((vehicle) => normalizeText(vehicle.vin) === sourceVin);
    if (byVin) {
      return { vehicle: byVin, matchedBy: 'vin' };
    }
  }

  const sourceStock = normalizeText(sourceVehicle.stockNumber);
  if (sourceStock) {
    const byStock = observedVehicles.find((vehicle) => normalizeText(vehicle.stockNumber) === sourceStock);
    if (byStock) {
      return { vehicle: byStock, matchedBy: 'stockNumber' };
    }
  }

  return { vehicle: null, matchedBy: 'unmatched' };
}

export function buildLiveSourceReconciliationArtifact(params: {
  generatedAt?: string | Date;
  dealership: DealershipReferenceSummary;
  listingUrl: string;
  visibleSourceVehicleCount: number;
  sourceVehicleUrls: string[];
  sourceVehicles: VehicleListing[];
  observedVehicles: ObservedInventoryVehicle[];
}): LiveSourceReconciliationArtifact {
  const normalizedObservedUrls = new Set(
    params.observedVehicles
      .map((vehicle) => normalizeDealerVdpUrl(vehicle.dealerVdpUrl))
      .filter((value): value is string => Boolean(value)),
  );

  const normalizedSourceUrls = params.sourceVehicleUrls
    .map((url) => normalizeDealerVdpUrl(url))
    .filter((value): value is string => Boolean(value));

  const missingStoredVehicleUrls = normalizedSourceUrls.filter((url) => !normalizedObservedUrls.has(url));

  const sampledVehicles = params.sourceVehicles.map((sourceVehicle) => {
    const matched = matchObservedVehicle(sourceVehicle, params.observedVehicles);
    const observedVehicle = matched.vehicle;
    const sourceBadges = deriveSourceHistoryBadges(sourceVehicle);
    const observedBadges = normalizeCarfaxBadgeList(Array.isArray(observedVehicle?.carfaxBadges) ? observedVehicle!.carfaxBadges! : []);
    const sourceCarfaxUrl = normalizeCarfaxEvidenceUrl(sourceVehicle.carfaxUrl);

    if (!observedVehicle) {
      return {
        source: {
          vin: sourceVehicle.vin ?? null,
          stockNumber: sourceVehicle.stockNumber ?? null,
          year: sourceVehicle.year ?? null,
          make: sourceVehicle.make ?? null,
          model: sourceVehicle.model ?? null,
          trim: sourceVehicle.trim ?? null,
          price: sourceVehicle.price ?? null,
          odometer: sourceVehicle.odometer ?? null,
          photoCountObservedInDom: sourceVehicle.images?.length ?? null,
          primaryPhoto: sourceVehicle.images?.[0] ?? null,
          transmission: sourceVehicle.transmission ?? null,
          drivetrain: sourceVehicle.drivetrain ?? null,
          fuelType: sourceVehicle.fuelType ?? null,
          exteriorColor: sourceVehicle.exteriorColor ?? null,
          interiorColor: sourceVehicle.interiorColor ?? null,
          carfaxUrl: sourceCarfaxUrl,
          carfaxBadges: sourceBadges,
          carfaxSignalsPresent: Boolean(sourceCarfaxUrl || sourceBadges.length > 0),
          vdpUrl: sourceVehicle.dealerVdpUrl ?? null,
        },
        observed: {
          vehicleId: null,
          matchedBy: matched.matchedBy,
          vin: null,
          stockNumber: null,
          year: null,
          make: null,
          model: null,
          trim: null,
          price: null,
          odometer: null,
          photoCount: null,
          primaryPhoto: null,
          transmission: null,
          drivetrain: null,
          fuelType: null,
          exteriorColor: null,
          interiorColor: null,
          carfaxUrl: null,
          carfaxBadges: [],
          dealerVdpUrl: null,
        },
        reconciliationSummary: {
          status: 'missing_in_inventory' as const,
          blockingMismatches: ['missing_inventory_vehicle'],
        },
      };
    }

    const comparisonSamples = buildComparableVehicleTruthSamples(sourceVehicle, observedVehicle, sourceBadges, observedBadges);
    const reconciliation = reconcileVehicleTruth({
      dealershipId: params.dealership.id,
      source: comparisonSamples.source,
      observed: comparisonSamples.observed,
    });

    return {
      source: {
        vin: sourceVehicle.vin ?? null,
        stockNumber: sourceVehicle.stockNumber ?? null,
        year: sourceVehicle.year ?? null,
        make: sourceVehicle.make ?? null,
        model: sourceVehicle.model ?? null,
        trim: sourceVehicle.trim ?? null,
        price: sourceVehicle.price ?? null,
        odometer: sourceVehicle.odometer ?? null,
        photoCountObservedInDom: sourceVehicle.images?.length ?? null,
        primaryPhoto: sourceVehicle.images?.[0] ?? null,
        transmission: sourceVehicle.transmission ?? null,
        drivetrain: sourceVehicle.drivetrain ?? null,
        fuelType: sourceVehicle.fuelType ?? null,
        exteriorColor: sourceVehicle.exteriorColor ?? null,
        interiorColor: sourceVehicle.interiorColor ?? null,
        carfaxUrl: sourceCarfaxUrl,
        carfaxBadges: sourceBadges,
        carfaxSignalsPresent: Boolean(sourceCarfaxUrl || sourceBadges.length > 0),
        vdpUrl: sourceVehicle.dealerVdpUrl ?? null,
      },
      observed: {
        vehicleId: observedVehicle.id,
        matchedBy: matched.matchedBy,
        vin: observedVehicle.vin ?? null,
        stockNumber: observedVehicle.stockNumber ?? null,
        year: observedVehicle.year ?? null,
        make: observedVehicle.make ?? null,
        model: observedVehicle.model ?? null,
        trim: observedVehicle.trim ?? null,
        price: observedVehicle.price ?? null,
        odometer: observedVehicle.odometer ?? null,
        photoCount: Array.isArray(observedVehicle.images) ? observedVehicle.images.length : 0,
        primaryPhoto: Array.isArray(observedVehicle.images) ? observedVehicle.images[0] ?? null : null,
        transmission: observedVehicle.transmission ?? null,
        drivetrain: observedVehicle.drivetrain ?? null,
        fuelType: observedVehicle.fuelType ?? null,
        exteriorColor: observedVehicle.exteriorColor ?? null,
        interiorColor: observedVehicle.interiorColor ?? null,
        carfaxUrl: normalizeCarfaxEvidenceUrl(observedVehicle.carfaxUrl),
        carfaxBadges: observedBadges,
        dealerVdpUrl: observedVehicle.dealerVdpUrl ?? null,
      },
      reconciliationSummary: {
        status: reconciliation.criticalMismatchCount === 0 ? 'match' as const : 'mismatch' as const,
        blockingMismatches: reconciliation.blockingReasons,
      },
    };
  });

  const matchedStoredVehicleCount = sampledVehicles.filter((sample) => sample.reconciliationSummary.status !== 'missing_in_inventory').length;

  return {
    generatedAt:
      params.generatedAt instanceof Date
        ? params.generatedAt.toISOString()
        : params.generatedAt ?? new Date().toISOString(),
    artifactType: 'launch10-live-dealership-reconciliation',
    truthBoundary: 'actual live dealership pages via automated browser extraction reconciled against current stored inventory',
    dealership: {
      id: params.dealership.id,
      label: params.dealership.label,
      name: params.dealership.name,
      slug: params.dealership.slug,
      subdomain: params.dealership.subdomain,
      listingUrl: params.listingUrl,
      listingPageSignals: {
        visibleVehicleLinkCount: params.visibleSourceVehicleCount,
        visibleVehicleUrls: normalizedSourceUrls,
        sampledVdpCount: sampledVehicles.length,
        matchedStoredVehicleCount,
        missingStoredVehicleCount: missingStoredVehicleUrls.length,
        missingStoredVehicleUrlsTop10: missingStoredVehicleUrls.slice(0, 10),
      },
    },
    sampledVehicles,
  };
}
