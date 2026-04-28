export async function scrapeInventory(dealershipId: number): Promise<any[]> { return []; }
export async function scrapeVehicle(vin: string): Promise<any> { return null; }
export async function scrapeAllDealerships(..._args: unknown[]): Promise<any> { return { success: false, error: "scraper_not_configured" }; }
export async function scrapeAllDealershipsIncremental(..._args: unknown[]): Promise<any> { return { success: false, error: "scraper_not_configured" }; }

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

export async function upsertVehicleByVin(_vehicle: ScrapedVehicle): Promise<any> {
  return { action: "skipped", vehicle: null, reason: "vehicle_upsert_not_configured" };
}

export async function testBadgeDetection(): Promise<void> {
  return;
}
