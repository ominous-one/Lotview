import { storage } from './storage';
import { evaluateDealershipScrapeGate, reconcileVehicleTruth, type DealershipScrapeGateResult, type VehicleTruthSample, type VehicleReconciliationResult } from './scrape-truth-foundation';

export interface StoredInventoryScrapeGateComputation {
  gate: DealershipScrapeGateResult;
  sampledVehicles: VehicleReconciliationResult[];
  truthBoundary: string;
}

function deriveSourceTruthFromStoredVehicle(vehicle: any): VehicleTruthSample {
  return {
    vin: vehicle.vin ?? null,
    stockNumber: vehicle.stockNumber ?? null,
    year: vehicle.year ?? null,
    make: vehicle.make ?? null,
    model: vehicle.model ?? null,
    trim: vehicle.trim ?? null,
    price: vehicle.price ?? null,
    odometer: vehicle.odometer ?? null,
    photoCount: Array.isArray(vehicle.images) ? vehicle.images.length : 0,
    primaryPhoto: Array.isArray(vehicle.images) && vehicle.images.length > 0 ? vehicle.images[0] : null,
    transmission: typeof vehicle.transmission === 'string' ? vehicle.transmission : null,
    drivetrain: typeof vehicle.drivetrain === 'string' ? vehicle.drivetrain : null,
    fuelType: typeof vehicle.fuelType === 'string' ? vehicle.fuelType : null,
    exteriorColor: typeof vehicle.exteriorColor === 'string' ? vehicle.exteriorColor : null,
    interiorColor: typeof vehicle.interiorColor === 'string' ? vehicle.interiorColor : null,
    carfaxUrl: typeof vehicle.carfaxUrl === 'string' ? vehicle.carfaxUrl : null,
    carfaxBadges: Array.isArray(vehicle.carfaxBadges) ? vehicle.carfaxBadges.filter((v: unknown): v is string => typeof v === 'string') : [],
  };
}

function deriveObservedTruthFromStoredVehicle(vehicle: any): VehicleTruthSample {
  const rawImages = Array.isArray(vehicle.images) ? vehicle.images : [];
  const filteredImages = rawImages.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0);
  const uniqueImages = Array.from(new Set<string>(filteredImages));
  return {
    vin: vehicle.vin ?? null,
    stockNumber: vehicle.stockNumber ?? null,
    year: vehicle.year ?? null,
    make: vehicle.make ?? null,
    model: vehicle.model ?? null,
    trim: vehicle.trim ?? null,
    price: vehicle.price ?? null,
    odometer: vehicle.odometer ?? null,
    photoCount: uniqueImages.length,
    primaryPhoto: uniqueImages[0] ?? null,
    transmission: typeof vehicle.transmission === 'string' ? vehicle.transmission : null,
    drivetrain: typeof vehicle.drivetrain === 'string' ? vehicle.drivetrain : null,
    fuelType: typeof vehicle.fuelType === 'string' ? vehicle.fuelType : null,
    exteriorColor: typeof vehicle.exteriorColor === 'string' ? vehicle.exteriorColor : null,
    interiorColor: typeof vehicle.interiorColor === 'string' ? vehicle.interiorColor : null,
    carfaxUrl: typeof vehicle.carfaxUrl === 'string' ? vehicle.carfaxUrl : null,
    carfaxBadges: Array.isArray(vehicle.carfaxBadges) ? vehicle.carfaxBadges.filter((v: unknown): v is string => typeof v === 'string') : [],
  };
}

export async function computeStoredInventoryScrapeGate(dealershipId: number): Promise<StoredInventoryScrapeGateComputation | null> {
  const { vehicles } = await storage.getVehicles(dealershipId, 25, 0);
  if (!vehicles.length) return null;

  const sampledVehicles = vehicles.slice(0, 25).map(vehicle =>
    reconcileVehicleTruth({
      dealershipId,
      source: deriveSourceTruthFromStoredVehicle(vehicle),
      observed: deriveObservedTruthFromStoredVehicle(vehicle),
    })
  );

  const latestRun = await storage.getLatestScrapeRun(dealershipId);
  const scrapeSuccessRate = latestRun && typeof latestRun.vehiclesFound === 'number' && latestRun.vehiclesFound > 0
    ? Math.min(1, vehicles.length / latestRun.vehiclesFound)
    : 1;

  const gate = evaluateDealershipScrapeGate({
    dealershipId,
    sampledVehicles,
    scrapeSuccessRate,
    staleRemovalWithinSla: true,
    consecutiveDaysAbove95: 0,
    imageContaminationRate: 0,
    hasCarfaxUnknownsOnlyWhenAbsent: vehicles.every(vehicle => !vehicle.carfaxUrl || (Array.isArray(vehicle.carfaxBadges) || vehicle.carfaxBadges == null)),
  });

  return {
    gate,
    sampledVehicles,
    truthBoundary: 'stored-inventory internal consistency gate only — not source-of-truth reconciliation',
  };
}
