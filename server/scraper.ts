import { deduplicateAndStore, type DedupResult, type ScrapedVehicleData } from "./services/vehicle-dedup";

const SCRAPER_NOT_CONFIGURED = "scraper_not_configured";

export class ScraperNotConfiguredError extends Error {
  readonly code = SCRAPER_NOT_CONFIGURED;
  readonly status = "fail_closed";

  constructor(entrypoint: string) {
    super(`${entrypoint} is not configured for production scraping.`);
    this.name = "ScraperNotConfiguredError";
  }
}

function failClosed(entrypoint: string): never {
  throw new ScraperNotConfiguredError(entrypoint);
}

export async function scrapeInventory(_dealershipId: number): Promise<any[]> {
  failClosed("scrapeInventory");
}

export async function scrapeVehicle(_vin: string): Promise<any> {
  failClosed("scrapeVehicle");
}

export async function scrapeAllDealerships(..._args: unknown[]): Promise<any> {
  return { success: false, error: SCRAPER_NOT_CONFIGURED, status: "fail_closed" };
}

export async function scrapeAllDealershipsIncremental(..._args: unknown[]): Promise<any> {
  return { success: false, error: SCRAPER_NOT_CONFIGURED, status: "fail_closed" };
}

export interface ScrapedVehicle {
  year: number;
  make: string;
  model: string;
  trim?: string;
  type?: string;
  price?: number | null;
  odometer?: number | null;
  images?: string[];
  badges?: string[];
  location?: string;
  dealership?: string;
  dealershipId?: number;
  description?: string;
  vin?: string;
  stockNumber?: string;
  carfaxUrl?: string;
  dealerVdpUrl?: string;
  dealRating?: string;
  cargurusPrice?: number;
  cargurusUrl?: string;
}

export interface ScraperPersistenceResult {
  action: "inserted" | "updated" | "skipped";
  vehicle: { id: number } | null;
  reason?: string;
  dedup?: DedupResult;
}

function toDedupVehicle(vehicle: ScrapedVehicle): ScrapedVehicleData {
  const images = vehicle.images ?? [];

  return {
    vin: vehicle.vin ?? "",
    price: vehicle.price,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    type: vehicle.type,
    mileage: vehicle.odometer,
    odometer: vehicle.odometer,
    images,
    photos: images,
    badges: vehicle.badges ?? [],
    location: vehicle.location,
    dealership: vehicle.dealership,
    stockNumber: vehicle.stockNumber,
    sourceUrl: vehicle.dealerVdpUrl,
    sourceType: "browserless_scraper",
    sourceId: vehicle.vin ? `browserless_${vehicle.vin}` : undefined,
    data: {
      ...vehicle,
      carfaxUrl: vehicle.carfaxUrl,
      dealRating: vehicle.dealRating,
      cargurusPrice: vehicle.cargurusPrice,
      cargurusUrl: vehicle.cargurusUrl,
    },
    scrapedAt: new Date(),
  };
}

function skippedPersistence(reason: string): ScraperPersistenceResult {
  return { action: "skipped", vehicle: null, reason };
}

export async function upsertVehicleByVin(vehicle: ScrapedVehicle): Promise<ScraperPersistenceResult> {
  const dealershipId = vehicle.dealershipId;
  if (!Number.isInteger(dealershipId) || dealershipId <= 0) {
    return skippedPersistence("missing_dealership_id");
  }

  if (!vehicle.vin || vehicle.vin.trim().length === 0) {
    return skippedPersistence("missing_vin");
  }

  const dedup = await deduplicateAndStore(dealershipId, toDedupVehicle(vehicle));
  const persistedVehicle = dedup.vehicleId ? { id: dedup.vehicleId } : null;
  const reason = dedup.details.find((detail) => detail.reason)?.reason;

  if (dedup.inserted > 0) {
    return { action: "inserted", vehicle: persistedVehicle, dedup };
  }

  if (dedup.merged > 0) {
    return { action: "updated", vehicle: persistedVehicle, dedup };
  }

  return { action: "skipped", vehicle: persistedVehicle, reason, dedup };
}

export async function testBadgeDetection(): Promise<void> {
  return;
}
