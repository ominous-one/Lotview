/**
 * Vehicle Inventory Scraper - Main Orchestrator
 * 
 * This is the main entry point for the scraping system.
 * 
 * USAGE:
 * 
 * 1. To add a new dealer, simply call:
 *    addDealer({
 *      id: 4,
 *      name: 'Your Dealership Name',
 *      location: 'City',
 *      inventoryUrl: 'https://www.dealersite.com/vehicles/used/',
 *      cargurusUrl: 'https://www.cargurus.ca/Cars/m-DealerName-sp123456' // optional
 *    });
 * 
 * 2. Run full scrape:
 *    await scrapeAllDealerships();
 * 
 * 3. Run single dealer:
 *    await scrapeSingleDealer(1); // dealer ID
 */

import { 
  DealerConfig, 
  DEFAULT_DEALERS, 
  createDealerConfig,
  detectPlatform 
} from './dealer-config';
import { scrapeDealerInventory, scrapeAllDealers, ScrapedVehicle } from './dealer-scraper';
import { 
  scrapeCarGurusDealerPage, 
  enrichWithCarGurusData,
  CarGurusVehicle 
} from './cargurus-scraper';
import { CookieStore } from './cookie-store';

// Active dealers (start with defaults, can be modified at runtime)
let activeDealers: DealerConfig[] = [...DEFAULT_DEALERS];

// Cookie store for Cloudflare bypass
const cookieStore = new CookieStore();

/**
 * Add a new dealer to the scraping queue
 */
export function addDealer(options: {
  id: number;
  name: string;
  location: string;
  inventoryUrl: string;
  cargurusUrl?: string;
}): DealerConfig {
  const config = createDealerConfig(
    options.id,
    options.name,
    options.location,
    options.inventoryUrl,
    options.cargurusUrl
  );
  
  // Check for duplicate ID
  const existing = activeDealers.findIndex(d => d.id === options.id);
  if (existing >= 0) {
    activeDealers[existing] = config;
    console.log(`Updated dealer ${options.id}: ${options.name}`);
  } else {
    activeDealers.push(config);
    console.log(`Added dealer ${options.id}: ${options.name}`);
  }
  
  return config;
}

/**
 * Remove a dealer from the queue
 */
export function removeDealer(id: number): boolean {
  const index = activeDealers.findIndex(d => d.id === id);
  if (index >= 0) {
    const removed = activeDealers.splice(index, 1)[0];
    console.log(`Removed dealer ${id}: ${removed.name}`);
    return true;
  }
  return false;
}

/**
 * Get all active dealers
 */
export function getDealers(): DealerConfig[] {
  return [...activeDealers];
}

/**
 * Reset to default dealers
 */
export function resetDealers(): void {
  activeDealers = [...DEFAULT_DEALERS];
  console.log(`Reset to ${DEFAULT_DEALERS.length} default dealers`);
}

/**
 * Scrape a single dealer's inventory
 */
export async function scrapeSingleDealer(dealerId: number): Promise<{
  dealer: DealerConfig;
  vehicles: ScrapedVehicle[];
  cargurusData: CarGurusVehicle[];
}> {
  const dealer = activeDealers.find(d => d.id === dealerId);
  if (!dealer) {
    throw new Error(`Dealer ${dealerId} not found`);
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SCRAPING SINGLE DEALER: ${dealer.name}`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Step 1: Scrape dealer website
  console.log('\n=== STEP 1: DEALER WEBSITE SCRAPE ===\n');
  const dealerVehicles = await scrapeDealerInventory(dealer, cookieStore);
  
  // Step 2: Scrape CarGurus for enrichment
  let cargurusVehicles: CarGurusVehicle[] = [];
  if (dealer.cargurus) {
    console.log('\n=== STEP 2: CARGURUS ENRICHMENT ===\n');
    cargurusVehicles = await scrapeCarGurusDealerPage(dealer);
  }
  
  // Step 3: Enrich with CarGurus data
  console.log('\n=== STEP 3: DATA ENRICHMENT ===\n');
  const enrichedVehicles = enrichWithCarGurusData(dealerVehicles, cargurusVehicles);
  
  // Summary
  console.log('\n=== SCRAPE SUMMARY ===\n');
  console.log(`Dealer: ${dealer.name}`);
  console.log(`Total vehicles: ${enrichedVehicles.length}`);
  console.log(`With VIN: ${enrichedVehicles.filter(v => v.vin).length}`);
  console.log(`With price: ${enrichedVehicles.filter(v => v.price && v.price > 0).length}`);
  console.log(`With photos: ${enrichedVehicles.filter(v => v.images.length > 0).length}`);
  console.log(`Average photos: ${Math.round(enrichedVehicles.reduce((sum, v) => sum + v.images.length, 0) / enrichedVehicles.length)}`);
  console.log(`CarGurus matches: ${enrichedVehicles.filter(v => v.dealRating).length}`);
  
  return {
    dealer,
    vehicles: enrichedVehicles,
    cargurusData: cargurusVehicles
  };
}

/**
 * Scrape all active dealers
 */
export async function scrapeAllDealerships(): Promise<{
  totalVehicles: number;
  byDealer: Map<number, ScrapedVehicle[]>;
  errors: string[];
}> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SCRAPING ALL DEALERSHIPS (${activeDealers.length} dealers)`);
  console.log(`${'='.repeat(60)}\n`);
  
  const byDealer = new Map<number, ScrapedVehicle[]>();
  const errors: string[] = [];
  let totalVehicles = 0;
  
  for (const dealer of activeDealers) {
    try {
      const result = await scrapeSingleDealer(dealer.id);
      byDealer.set(dealer.id, result.vehicles);
      totalVehicles += result.vehicles.length;
      
      // Delay between dealers to be polite
      await new Promise(r => setTimeout(r, 5000));
      
    } catch (error) {
      const msg = `Failed to scrape ${dealer.name}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`✗ ${msg}`);
      errors.push(msg);
      byDealer.set(dealer.id, []);
    }
  }
  
  // Final summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SCRAPE COMPLETE`);
  console.log(`${'='.repeat(60)}\n`);
  
  console.log(`Total vehicles scraped: ${totalVehicles}`);
  for (const dealer of activeDealers) {
    const count = byDealer.get(dealer.id)?.length || 0;
    console.log(`  - ${dealer.name}: ${count} vehicles`);
  }
  
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    errors.forEach(e => console.log(`  - ${e}`));
  }
  
  return { totalVehicles, byDealer, errors };
}

/**
 * Validate scraped data quality
 */
export function validateVehicleData(vehicles: ScrapedVehicle[]): {
  valid: ScrapedVehicle[];
  invalid: { vehicle: ScrapedVehicle; reason: string }[];
} {
  const valid: ScrapedVehicle[] = [];
  const invalid: { vehicle: ScrapedVehicle; reason: string }[] = [];
  
  for (const vehicle of vehicles) {
    const reasons: string[] = [];
    
    // Must have price
    if (!vehicle.price || vehicle.price <= 0) {
      reasons.push('missing_price');
    }
    
    // Must have at least some photos (lowered threshold for development)
    if (!vehicle.images || vehicle.images.length < 1) {
      reasons.push('no_photos');
    }
    
    // VIN is strongly recommended
    if (!vehicle.vin) {
      // Just warn, don't invalidate
      console.log(`  ⚠ No VIN: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
    }
    
    if (reasons.length === 0) {
      valid.push(vehicle);
    } else {
      invalid.push({ 
        vehicle, 
        reason: reasons.join(', ') 
      });
    }
  }
  
  console.log(`\nValidation: ${valid.length} valid, ${invalid.length} invalid`);
  
  if (invalid.length > 0) {
    const byReason = invalid.reduce((acc, { reason }) => {
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('Invalid reasons:');
    Object.entries(byReason).forEach(([reason, count]) => {
      console.log(`  - ${reason}: ${count}`);
    });
  }
  
  return { valid, invalid };
}

/**
 * Quick test function
 */
export async function testScraper(): Promise<void> {
  console.log('Testing scraper with Olympic Hyundai Vancouver...');
  
  const dealer = activeDealers.find(d => d.id === 1);
  if (!dealer) {
    console.error('Olympic Hyundai not configured');
    return;
  }
  
  const result = await scrapeSingleDealer(1);
  
  console.log('\n--- Sample Vehicle Data ---\n');
  const sample = result.vehicles[0];
  if (sample) {
    console.log(`Vehicle: ${sample.year} ${sample.make} ${sample.model} ${sample.trim}`);
    console.log(`VIN: ${sample.vin}`);
    console.log(`Price: $${sample.price}`);
    console.log(`Odometer: ${sample.odometer} km`);
    console.log(`Photos: ${sample.images.length}`);
    console.log(`Badges: ${sample.badges.join(', ') || 'None'}`);
    console.log(`Body Type: ${sample.type}`);
    console.log(`Deal Rating: ${sample.dealRating || 'N/A'}`);
    
    if (sample.images.length > 0) {
      console.log('\nFirst 3 image URLs:');
      sample.images.slice(0, 3).forEach((url, i) => {
        console.log(`  ${i + 1}. ${url.substring(0, 80)}...`);
      });
    }
  }
  
  // Validate
  const { valid, invalid } = validateVehicleData(result.vehicles);
  console.log(`\nValidation: ${valid.length} valid, ${invalid.length} invalid`);
}

// Export types for external use
export type { DealerConfig, ScrapedVehicle, CarGurusVehicle };
