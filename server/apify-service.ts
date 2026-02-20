import type { InsertMarketListing, DealershipApiKeys } from '@shared/schema';
import { storage } from './storage';

// ====== APIFY ACTOR CONFIGURATIONS ======
export const APIFY_ACTORS = {
  // fayoussef/autotrader-ca - Per results pricing ($0.50/1000 results)
  AUTOTRADER_CA_PER_RESULTS: 'fayoussef/autotrader-ca',
  // fayoussef/autotrader-canada - Full actor (comprehensive details)
  AUTOTRADER_CANADA_FULL: 'fayoussef/autotrader-canada',
} as const;

export type ApifyActorType = keyof typeof APIFY_ACTORS;

export interface ApifySearchParams {
  make: string;
  model: string;
  yearMin?: number;
  yearMax?: number;
  postalCode?: string;
  province?: string;
  radiusKm?: number;
  maxResults?: number;
  dealershipId?: number;
}

// Response format from fayoussef/autotrader-ca actor
export interface ApifyAutoTraderCAListing {
  url: string;
  ad_id: string;
  make: string;
  model: string;
  year: number;
  price_str: string;
  price_cad: number;
  mileage_str: string;
  mileage_km: number;
  status: string; // 'Used', 'New', 'Certified'
  posted_age: string | null;
  transmission: string;
  drivetrain: string;
  body_type: string;
  exterior_colour: string;
  fuel_type: string;
  doors: string;
  city: string;
  province: string;
  is_private_seller: boolean;
  seller_name: string;
  description: string;
  image_urls?: string[];
  all_data?: any; // Raw JSON data from AutoTrader
}

// Normalized internal listing format
export interface ApifyAutoTraderListing {
  id: string;
  url: string;
  title: string;
  price: number;
  year: number;
  make: string;
  model: string;
  trim?: string;
  mileage?: number;
  location?: string;
  city?: string;
  province?: string;
  dealer?: string;
  listingType?: string;
  imageUrl?: string;
  transmission?: string;
  drivetrain?: string;
  bodyType?: string;
  fuelType?: string;
  exteriorColor?: string;
  description?: string;
  daysOnMarket?: number;
}

export class ApifyService {
  private apiToken: string;
  private defaultActorId: string;

  constructor(apiToken: string, actorId?: string) {
    if (!apiToken) {
      throw new Error('Apify API token is required');
    }
    this.apiToken = apiToken;
    this.defaultActorId = actorId || APIFY_ACTORS.AUTOTRADER_CA_PER_RESULTS;
  }

  /**
   * Trigger AutoTrader.ca scraper run using fayoussef/autotrader-ca actor
   */
  async scrapeAutoTrader(params: ApifySearchParams, actorId?: string): Promise<ApifyAutoTraderListing[]> {
    const actor = actorId || this.defaultActorId;
    const {
      maxResults = 100
    } = params;

    try {
      // Build search object for the actor (documented schema)
      const searchInput: Record<string, any> = {
        make: params.make,
        model: params.model
      };
      
      // Add year range if specified
      if (params.yearMin) searchInput.yearFrom = params.yearMin;
      if (params.yearMax) searchInput.yearTo = params.yearMax;
      
      // Add geographic filters
      if (params.postalCode) searchInput.postalCode = params.postalCode;
      if (params.province) searchInput.province = params.province;
      if (params.radiusKm) searchInput.radiusKm = params.radiusKm;
      
      // Actor input format for fayoussef/autotrader-ca (documented schema)
      // Uses search object for filters, maxDepth=1 to stay on search results
      const input = {
        search: searchInput,
        maxDepth: 1, // Stay on search results, don't follow to seller pages
        maxItems: maxResults,
        maxRequestsPerCrawl: maxResults + 20, // Buffer for pagination
        maxConcurrency: 10
      };

      console.log(`[Apify] Starting AutoTrader.ca scrape for ${params.make} ${params.model}`);
      console.log(`[Apify] Search filters:`, JSON.stringify(searchInput));
      console.log(`[Apify] Using actor: ${actor} with maxItems: ${maxResults}`);

      // Start actor run
      const runResponse = await fetch(
        `https://api.apify.com/v2/acts/${actor}/runs?token=${this.apiToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
        }
      );

      if (!runResponse.ok) {
        const errorText = await runResponse.text();
        console.error(`[Apify] Run start error (${runResponse.status}):`, errorText);
        throw new Error(`Apify run start error: ${runResponse.status} - ${errorText}`);
      }

      const runData = await runResponse.json();
      const runId = runData.data.id;
      const defaultDatasetId = runData.data.defaultDatasetId;

      console.log(`[Apify] Run started: ${runId}, dataset: ${defaultDatasetId}`);

      // Wait for run to complete (poll status)
      let status = 'RUNNING';
      let attempts = 0;
      const maxAttempts = 120; // 10 minutes max

      while ((status === 'RUNNING' || status === 'READY') && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        
        const statusResponse = await fetch(
          `https://api.apify.com/v2/actor-runs/${runId}?token=${this.apiToken}`
        );
        
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          status = statusData.data.status;
          console.log(`[Apify] Run status: ${status} (attempt ${attempts + 1}/${maxAttempts})`);
        }
        
        attempts++;
      }

      if (status !== 'SUCCEEDED') {
        throw new Error(`Apify run did not complete successfully. Status: ${status}`);
      }

      // Fetch dataset results
      const datasetResponse = await fetch(
        `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${this.apiToken}&format=json&limit=${maxResults}`
      );

      if (!datasetResponse.ok) {
        throw new Error(`Failed to fetch dataset: ${datasetResponse.status}`);
      }

      const rawListings: ApifyAutoTraderCAListing[] = await datasetResponse.json();
      
      console.log(`[Apify] Retrieved ${rawListings.length} listings from dataset`);
      
      // Normalize to our internal format
      return rawListings.map(listing => this.normalizeAutoTraderCAListing(listing));
    } catch (error) {
      console.error('[Apify] Scrape error:', error);
      throw error;
    }
  }

  /**
   * Normalize AutoTrader.ca listing to internal format
   */
  private normalizeAutoTraderCAListing(raw: ApifyAutoTraderCAListing): ApifyAutoTraderListing {
    return {
      id: raw.ad_id,
      url: raw.url,
      title: `${raw.year} ${raw.make} ${raw.model}`,
      price: raw.price_cad,
      year: raw.year,
      make: raw.make,
      model: raw.model,
      mileage: raw.mileage_km,
      location: raw.city && raw.province ? `${raw.city}, ${raw.province}` : undefined,
      city: raw.city,
      province: raw.province,
      dealer: raw.seller_name,
      listingType: raw.is_private_seller ? 'private' : 'dealer',
      imageUrl: raw.image_urls?.[0],
      transmission: raw.transmission,
      drivetrain: raw.drivetrain,
      bodyType: raw.body_type,
      fuelType: raw.fuel_type,
      exteriorColor: raw.exterior_colour,
      description: raw.description,
      daysOnMarket: raw.posted_age ? parseInt(raw.posted_age) || undefined : undefined
    };
  }

  /**
   * Convert Apify listing to our database format
   */
  convertToMarketListing(listing: ApifyAutoTraderListing, dealershipId: number): InsertMarketListing {
    const listingType: 'dealer' | 'private' = 
      listing.listingType?.toLowerCase().includes('private') ? 'private' : 'dealer';

    return {
      dealershipId,
      externalId: listing.id,
      source: 'apify_autotrader',
      listingType,
      year: listing.year,
      make: listing.make.toUpperCase(),
      model: listing.model.toUpperCase(),
      trim: listing.trim || null,
      price: listing.price,
      mileage: listing.mileage || null,
      location: listing.location || 'Canada',
      postalCode: null,
      latitude: null,
      longitude: null,
      sellerName: listing.dealer || (listingType === 'private' ? 'Private Seller' : 'Dealer'),
      imageUrl: listing.imageUrl || null,
      listingUrl: listing.url,
      postedDate: new Date(),
      isActive: true
    };
  }

  /**
   * Scrape and convert to our format
   */
  async scrapeAndConvert(params: ApifySearchParams): Promise<InsertMarketListing[]> {
    const dealershipId = params.dealershipId || 1;
    const listings = await this.scrapeAutoTrader(params);
    return listings
      .filter(l => l.price > 1000) // Filter out invalid prices
      .map(l => this.convertToMarketListing(l, dealershipId));
  }

  /**
   * Get market pricing statistics from scraped data
   */
  async getMarketPricing(params: ApifySearchParams): Promise<{
    listings: ApifyAutoTraderListing[];
    stats: {
      count: number;
      minPrice: number;
      maxPrice: number;
      avgPrice: number;
      medianPrice: number;
      avgMileage: number;
      medianMileage: number;
      pricePercentile: (percentile: number) => number;
    };
  }> {
    const listings = await this.scrapeAutoTrader(params);
    
    if (listings.length === 0) {
      return {
        listings: [],
        stats: {
          count: 0,
          minPrice: 0,
          maxPrice: 0,
          avgPrice: 0,
          medianPrice: 0,
          avgMileage: 0,
          medianMileage: 0,
          pricePercentile: () => 0
        }
      };
    }

    const prices = listings.map(l => l.price).filter(p => p > 0).sort((a, b) => a - b);
    const mileages = listings.map(l => l.mileage).filter((m): m is number => m !== undefined && m > 0);
    
    const median = (arr: number[]) => {
      if (arr.length === 0) return 0;
      const mid = Math.floor(arr.length / 2);
      return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    };
    
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    
    const pricePercentile = (percentile: number): number => {
      if (prices.length === 0) return 0;
      const index = Math.ceil((percentile / 100) * prices.length) - 1;
      return prices[Math.max(0, Math.min(index, prices.length - 1))];
    };

    return {
      listings,
      stats: {
        count: listings.length,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        avgPrice: Math.round(avg(prices)),
        medianPrice: Math.round(median(prices)),
        avgMileage: Math.round(avg(mileages)),
        medianMileage: Math.round(median(mileages)),
        pricePercentile
      }
    };
  }

  /**
   * Test API connection (uses /v2/users/me endpoint)
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(
        `https://api.apify.com/v2/users/me?token=${this.apiToken}`
      );
      
      if (response.ok) {
        const data = await response.json();
        return { 
          success: true, 
          message: `Connected as: ${data.data?.username || data.data?.email || 'Apify User'}` 
        };
      } else {
        return { 
          success: false, 
          message: `API error: ${response.status}` 
        };
      }
    } catch (error) {
      return { 
        success: false, 
        message: `Connection error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
}

// ====== SERVICE MANAGEMENT ======

// Cache for service instances per dealership
const serviceCache = new Map<number, ApifyService>();

/**
 * Get Apify service for a specific dealership
 * Fetches API token from database, caches instance for performance
 */
export async function getApifyServiceForDealership(dealershipId: number): Promise<ApifyService | null> {
  // Check cache first
  if (serviceCache.has(dealershipId)) {
    return serviceCache.get(dealershipId)!;
  }
  
  try {
    const apiKeys = await storage.getDealershipApiKeys(dealershipId);
    
    if (apiKeys?.apifyToken) {
      const service = new ApifyService(apiKeys.apifyToken, apiKeys.apifyActorId || undefined);
      serviceCache.set(dealershipId, service);
      console.log(`[Apify] Service initialized for dealership ${dealershipId}${apiKeys.apifyActorId ? ` with actor ${apiKeys.apifyActorId}` : ''}`);
      return service;
    } else {
      console.warn(`[Apify] API token not configured for dealership ${dealershipId}`);
      return null;
    }
  } catch (error) {
    console.error(`[Apify] Error loading API token for dealership ${dealershipId}:`, error);
    return null;
  }
}

/**
 * Clear cached service instance (use when API token is updated)
 */
export function clearApifyCache(dealershipId?: number) {
  if (dealershipId) {
    serviceCache.delete(dealershipId);
  } else {
    serviceCache.clear();
  }
}

/**
 * Get global Apify service (from environment variables - super admin only)
 */
let globalApifyService: ApifyService | null = null;

export function getGlobalApifyService(): ApifyService | null {
  if (!globalApifyService) {
    const apiToken = process.env.APIFY_API_TOKEN;
    const actorId = process.env.APIFY_AUTOTRADER_ACTOR_ID;
    
    if (apiToken) {
      globalApifyService = new ApifyService(apiToken, actorId);
      console.log('[Apify] Global service initialized from env', actorId ? `with actor ${actorId}` : 'with default actor');
    } else {
      console.warn('[Apify] Global API token not configured (APIFY_API_TOKEN)');
    }
  }
  return globalApifyService;
}

// Legacy alias for backwards compatibility
export function getApifyService(): ApifyService | null {
  return getGlobalApifyService();
}
