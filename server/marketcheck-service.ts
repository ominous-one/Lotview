import type { InsertMarketListing, DealershipApiKeys } from '@shared/schema';
import { storage } from './storage';

export interface MarketCheckSearchParams {
  make: string;
  model: string;
  yearMin?: number;
  yearMax?: number;
  postalCode?: string;
  radiusKm?: number;
  maxResults?: number;
  dealershipId?: number;
}

export interface MarketCheckListing {
  id: string;
  vin?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  price: number;
  miles?: number;
  dealer_name?: string;
  seller_type: 'dealer' | 'private';
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  dom?: number; // Days on market
  last_seen_at?: string;
  vdp_url?: string;
  photo_url?: string;
}

export interface CompetitorListing {
  id: string;
  dealerName: string;
  price: number;
  mileage: number; // in km
  daysOnMarket: number;
  location: string;
  trim?: string;
  photoUrl?: string;
  listingUrl?: string;
}

export interface CompetitorAnalysis {
  priceRank: number; // 1-based rank (1 = cheapest)
  totalCompetitors: number;
  percentile: number; // Where this price falls (0-100, lower = cheaper)
  priceVsAverage: number; // Difference from average price
  pricePosition: 'below' | 'at' | 'above'; // Relative to market
  topCompetitors: CompetitorListing[];
  avgCompetitorPrice: number;
  avgCompetitorMileage: number;
  avgCompetitorDOM: number;
}

export interface VINPricingResult {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  retailPrice: {
    average: number;
    aboveAvg: number;
    belowAvg: number;
    min: number;
    max: number;
  };
  wholesalePrice: {
    average: number;
    clean: number;
    average_mmr: number;
    rough: number;
  };
  marketDemand: {
    daysSupply: number;
    marketVelocity: 'fast' | 'average' | 'slow';
    demandScore: number;
    listingCount: number;
  };
  competitorAnalysis?: CompetitorAnalysis;
  mileageAdjustment: number;
  confidence: 'high' | 'medium' | 'low';
  dataSource: string;
  lastUpdated: string;
}

export interface LiveMarketStats {
  totalListings: number;
  averagePrice: number;
  medianPrice: number;
  minPrice: number;
  maxPrice: number;
  averageMileage: number;
  averageDaysOnMarket: number;
  daysSupply: number;
  priceChange30Days: number;
  topDealers: {
    name: string;
    listingCount: number;
    avgPrice: number;
  }[];
}

export interface MarketCheckResponse {
  num_found: number;
  listings: MarketCheckListing[];
}

export class MarketCheckService {
  private apiKey: string;
  private baseUrl = 'https://api.marketcheck.com/v2';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('MarketCheck API key is required');
    }
    this.apiKey = apiKey;
  }

  /**
   * Search for vehicle listings (dealer + private party)
   */
  async searchListings(params: MarketCheckSearchParams): Promise<MarketCheckListing[]> {
    const {
      make,
      model,
      yearMin,
      yearMax,
      postalCode,
      radiusKm,
      maxResults = 100
    } = params;

    try {
      // Build query parameters
      const queryParams = new URLSearchParams({
        api_key: this.apiKey,
        make: make.toUpperCase(),
        model: model.toUpperCase(),
        rows: Math.min(maxResults, 100).toString(),
        start: '0'
      });

      // Add year range
      if (yearMin && yearMax) {
        queryParams.append('year', `${yearMin}-${yearMax}`);
      } else if (yearMin) {
        queryParams.append('year', `${yearMin}-`);
      } else if (yearMax) {
        queryParams.append('year', `-${yearMax}`);
      }

      // Add location/radius
      if (postalCode) {
        queryParams.append('zip', postalCode.replace(/\s/g, ''));
      }
      if (radiusKm) {
        // Convert km to miles for MarketCheck API
        // Cap at 100 miles max (subscription limit)
        const MAX_RADIUS_MILES = 100;
        const radiusMiles = Math.min(Math.round(radiusKm * 0.621371), MAX_RADIUS_MILES);
        if (Math.round(radiusKm * 0.621371) > MAX_RADIUS_MILES) {
          console.log(`[MarketCheck] Radius capped from ${Math.round(radiusKm * 0.621371)} to ${MAX_RADIUS_MILES} miles (subscription limit)`);
        }
        queryParams.append('radius', radiusMiles.toString());
      }

      // Search Canadian listings
      queryParams.append('country', 'CA');

      // First try: used cars only (default)
      queryParams.append('car_type', 'used');
      
      const url = `${this.baseUrl}/search/car/active?${queryParams.toString()}`;
      
      console.log(`[MarketCheck] Searching: ${make} ${model} ${yearMin}-${yearMax} (used only)`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[MarketCheck] API error (${response.status}):`, errorText);
        throw new Error(`MarketCheck API error: ${response.status}`);
      }

      const data: MarketCheckResponse = await response.json();
      
      console.log(`[MarketCheck] Found ${data.num_found} listings (used only)`);
      
      // If no results for newer model years (2024+), retry with all car types (new + used)
      const currentYear = new Date().getFullYear();
      if ((data.num_found === 0 || !data.listings?.length) && yearMin && yearMin >= currentYear - 1) {
        console.log(`[MarketCheck] No used listings for ${yearMin}+ model year, retrying with all car types...`);
        
        // Remove car_type restriction and retry
        queryParams.delete('car_type');
        const retryUrl = `${this.baseUrl}/search/car/active?${queryParams.toString()}`;
        
        const retryResponse = await fetch(retryUrl);
        
        if (retryResponse.ok) {
          const retryData: MarketCheckResponse = await retryResponse.json();
          console.log(`[MarketCheck] Retry found ${retryData.num_found} listings (all types)`);
          return retryData.listings || [];
        }
      }
      
      return data.listings || [];
    } catch (error) {
      console.error('[MarketCheck] Search error:', error);
      throw error;
    }
  }

  /**
   * Convert MarketCheck listing to our database format
   */
  convertToMarketListing(listing: MarketCheckListing, dealershipId: number): InsertMarketListing | null {
    // Validate required fields
    if (!listing.make || !listing.model) {
      console.warn(`[MarketCheck] Skipping listing ${listing.id} - missing make or model`);
      return null;
    }

    // Convert miles to kilometers
    const mileage = listing.miles ? Math.round(listing.miles * 1.60934) : null;
    
    // Build location string
    let location = '';
    if (listing.city && listing.state) {
      location = `${listing.city}, ${listing.state}`;
    } else if (listing.city) {
      location = listing.city;
    } else if (listing.state) {
      location = listing.state;
    }

    return {
      dealershipId,
      externalId: listing.id,
      source: 'marketcheck',
      listingType: listing.seller_type,
      year: listing.year,
      make: listing.make.toUpperCase(),
      model: listing.model.toUpperCase(),
      trim: listing.trim || null,
      price: listing.price,
      mileage,
      location: location || 'Canada',
      postalCode: null,
      latitude: listing.latitude ? listing.latitude.toString() : null,
      longitude: listing.longitude ? listing.longitude.toString() : null,
      sellerName: listing.dealer_name || (listing.seller_type === 'private' ? 'Private Seller' : 'Dealer'),
      imageUrl: listing.photo_url || null,
      listingUrl: listing.vdp_url || `https://marketcheck.com/listing/${listing.id}`,
      postedDate: listing.last_seen_at ? new Date(listing.last_seen_at) : null,
      isActive: true
    };
  }

  /**
   * Search and convert to our format
   */
  async searchAndConvert(params: MarketCheckSearchParams): Promise<InsertMarketListing[]> {
    const dealershipId = params.dealershipId || 1; // Default to dealership 1 for backwards compat
    const listings = await this.searchListings(params);
    return listings
      .filter(l => l.price > 0) // Filter out listings without prices
      .map(l => this.convertToMarketListing(l, dealershipId))
      .filter((l): l is InsertMarketListing => l !== null); // Filter out null results
  }

  /**
   * Get VIN-specific pricing with retail, wholesale, and market demand data
   * This combines decode + pricing + market stats for a complete valuation
   */
  async getVINPricing(vin: string, mileage?: number, postalCode?: string): Promise<VINPricingResult | null> {
    try {
      console.log(`[MarketCheck] Getting VIN pricing for ${vin}`);

      const vinDecodeUrl = `${this.baseUrl}/decode/car/${vin}/specs?api_key=${this.apiKey}`;
      const decodeResponse = await fetch(vinDecodeUrl);
      
      if (!decodeResponse.ok) {
        console.error(`[MarketCheck] VIN decode failed: ${decodeResponse.status}`);
        return null;
      }

      const decodeData = await decodeResponse.json();
      const year = parseInt(decodeData.year) || new Date().getFullYear();
      const make = decodeData.make || '';
      const model = decodeData.model || '';
      const trim = decodeData.trim || '';

      if (!make || !model) {
        console.error('[MarketCheck] Could not decode VIN - missing make/model');
        return null;
      }

      const listings = await this.searchListings({
        make,
        model,
        yearMin: year - 1,
        yearMax: year + 1,
        postalCode: postalCode || 'L4W1S9',
        radiusKm: 200,
        maxResults: 100
      });

      if (listings.length === 0) {
        console.log('[MarketCheck] No comparable listings found');
        return this.createEmptyPricingResult(vin, year, make, model, trim);
      }

      const prices = listings.map(l => l.price).filter(p => p > 0).sort((a, b) => a - b);
      const mileages = listings.map(l => l.miles || 0).filter(m => m > 0);
      const daysOnMarket = listings.map(l => l.dom || 0).filter(d => d > 0);

      const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
      const medianPrice = prices[Math.floor(prices.length / 2)];
      const minPrice = prices[0];
      const maxPrice = prices[prices.length - 1];

      const avgMileage = mileages.length > 0 
        ? Math.round(mileages.reduce((a, b) => a + b, 0) / mileages.length)
        : 50000;

      let mileageAdjustment = 0;
      if (mileage) {
        const mileageDiff = (mileage * 0.621371) - avgMileage;
        const pricePerMile = (maxPrice - minPrice) / (avgMileage * 2);
        mileageAdjustment = Math.round(mileageDiff * pricePerMile * -0.3);
      }

      const avgDOM = daysOnMarket.length > 0
        ? Math.round(daysOnMarket.reduce((a, b) => a + b, 0) / daysOnMarket.length)
        : 30;

      const daysSupply = Math.round((listings.length / 30) * avgDOM);
      
      let marketVelocity: 'fast' | 'average' | 'slow' = 'average';
      let demandScore = 50;
      
      if (avgDOM < 20 || daysSupply < 30) {
        marketVelocity = 'fast';
        demandScore = 80 + Math.min(20, (30 - avgDOM) * 2);
      } else if (avgDOM > 45 || daysSupply > 60) {
        marketVelocity = 'slow';
        demandScore = Math.max(20, 50 - (avgDOM - 45));
      } else {
        demandScore = 50 + Math.round((30 - avgDOM) * 1.5);
      }

      const p10 = prices[Math.floor(prices.length * 0.1)];
      const p25 = prices[Math.floor(prices.length * 0.25)];
      const p75 = prices[Math.floor(prices.length * 0.75)];
      const p90 = prices[Math.floor(prices.length * 0.9)];

      const wholesaleAvg = Math.round(avgPrice * 0.82);
      const wholesaleClean = Math.round(avgPrice * 0.85);
      const wholesaleRough = Math.round(avgPrice * 0.75);

      const confidence = listings.length >= 20 ? 'high' : listings.length >= 10 ? 'medium' : 'low';

      // Build competitor analysis
      const competitorAnalysis = this.buildCompetitorAnalysis(listings, avgPrice);

      return {
        vin,
        year,
        make,
        model,
        trim,
        retailPrice: {
          average: avgPrice + mileageAdjustment,
          aboveAvg: p75 + mileageAdjustment,
          belowAvg: p25 + mileageAdjustment,
          min: minPrice + mileageAdjustment,
          max: maxPrice + mileageAdjustment
        },
        wholesalePrice: {
          average: wholesaleAvg + mileageAdjustment,
          clean: wholesaleClean + mileageAdjustment,
          average_mmr: Math.round((wholesaleAvg + wholesaleClean) / 2) + mileageAdjustment,
          rough: wholesaleRough + mileageAdjustment
        },
        marketDemand: {
          daysSupply,
          marketVelocity,
          demandScore,
          listingCount: listings.length
        },
        competitorAnalysis,
        mileageAdjustment,
        confidence,
        dataSource: 'MarketCheck (53K+ dealers)',
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('[MarketCheck] VIN pricing error:', error);
      return null;
    }
  }

  /**
   * Get live market statistics for a make/model/year combination
   */
  async getLiveMarketStats(params: MarketCheckSearchParams): Promise<LiveMarketStats | null> {
    try {
      const listings = await this.searchListings(params);

      if (listings.length === 0) {
        return null;
      }

      const prices = listings.map(l => l.price).filter(p => p > 0).sort((a, b) => a - b);
      const mileages = listings.map(l => l.miles || 0).filter(m => m > 0);
      const daysOnMarket = listings.map(l => l.dom || 0).filter(d => d > 0);

      const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
      const medianPrice = prices[Math.floor(prices.length / 2)];

      const avgMileage = mileages.length > 0
        ? Math.round(mileages.reduce((a, b) => a + b, 0) / mileages.length)
        : 0;

      const avgDOM = daysOnMarket.length > 0
        ? Math.round(daysOnMarket.reduce((a, b) => a + b, 0) / daysOnMarket.length)
        : 0;

      const daysSupply = Math.round((listings.length / 30) * (avgDOM || 30));

      const dealerMap = new Map<string, { count: number; totalPrice: number }>();
      for (const listing of listings) {
        const dealer = listing.dealer_name || 'Unknown';
        if (!dealerMap.has(dealer)) {
          dealerMap.set(dealer, { count: 0, totalPrice: 0 });
        }
        const d = dealerMap.get(dealer)!;
        d.count++;
        d.totalPrice += listing.price;
      }

      const topDealers = Array.from(dealerMap.entries())
        .map(([name, data]) => ({
          name,
          listingCount: data.count,
          avgPrice: Math.round(data.totalPrice / data.count)
        }))
        .sort((a, b) => b.listingCount - a.listingCount)
        .slice(0, 10);

      return {
        totalListings: listings.length,
        averagePrice: avgPrice,
        medianPrice,
        minPrice: prices[0],
        maxPrice: prices[prices.length - 1],
        averageMileage: Math.round(avgMileage * 1.60934),
        averageDaysOnMarket: avgDOM,
        daysSupply,
        priceChange30Days: 0,
        topDealers
      };
    } catch (error) {
      console.error('[MarketCheck] Live market stats error:', error);
      return null;
    }
  }

  private buildCompetitorAnalysis(listings: MarketCheckListing[], avgPrice: number): CompetitorAnalysis | undefined {
    // Sort listings by price for ranking
    const sortedByPrice = [...listings]
      .filter(l => l.price > 0)
      .sort((a, b) => a.price - b.price);
    
    const totalCompetitors = sortedByPrice.length;
    
    // Guard against empty competitor list
    if (totalCompetitors === 0) {
      return undefined;
    }
    
    // Calculate average competitor metrics with guards
    const avgCompetitorPrice = avgPrice;
    const totalMileage = sortedByPrice.reduce((sum, l) => sum + (l.miles || 0), 0);
    const avgCompetitorMileage = Math.round((totalMileage / totalCompetitors) * 1.60934); // Convert to km
    
    const totalDOM = sortedByPrice.reduce((sum, l) => sum + (l.dom || 0), 0);
    const avgCompetitorDOM = Math.round(totalDOM / totalCompetitors);
    
    // Build top competitors list (top 10 by price - lowest first)
    const topCompetitors: CompetitorListing[] = sortedByPrice.slice(0, 10).map(l => ({
      id: l.id,
      dealerName: l.dealer_name || 'Unknown Dealer',
      price: l.price,
      mileage: Math.round((l.miles || 0) * 1.60934), // Convert to km
      daysOnMarket: l.dom || 0,
      location: l.city && l.state ? `${l.city}, ${l.state}` : (l.city || l.state || 'Unknown'),
      trim: l.trim,
      photoUrl: l.photo_url,
      listingUrl: l.vdp_url
    }));
    
    // Store sorted prices for later rank calculation
    const sortedPrices = sortedByPrice.map(l => l.price);
    
    // Calculate rank based on average retail price as default target
    const targetPrice = avgPrice;
    let priceRank = 1;
    for (const price of sortedPrices) {
      if (targetPrice > price) {
        priceRank++;
      } else {
        break;
      }
    }
    
    // Calculate percentile (0 = cheapest, 100 = most expensive)
    const percentile = Math.round((priceRank / totalCompetitors) * 100);
    
    // Calculate price vs average
    const priceVsAverage = targetPrice - avgPrice;
    
    // Determine price position
    let pricePosition: 'below' | 'at' | 'above' = 'at';
    const threshold = avgPrice * 0.05; // 5% threshold
    if (priceVsAverage < -threshold) {
      pricePosition = 'below';
    } else if (priceVsAverage > threshold) {
      pricePosition = 'above';
    }
    
    return {
      priceRank,
      totalCompetitors,
      percentile,
      priceVsAverage,
      pricePosition,
      topCompetitors,
      avgCompetitorPrice,
      avgCompetitorMileage,
      avgCompetitorDOM
    };
  }

  private createEmptyPricingResult(vin: string, year: number, make: string, model: string, trim: string): VINPricingResult {
    return {
      vin,
      year,
      make,
      model,
      trim,
      retailPrice: {
        average: 0,
        aboveAvg: 0,
        belowAvg: 0,
        min: 0,
        max: 0
      },
      wholesalePrice: {
        average: 0,
        clean: 0,
        average_mmr: 0,
        rough: 0
      },
      marketDemand: {
        daysSupply: 0,
        marketVelocity: 'average',
        demandScore: 0,
        listingCount: 0
      },
      mileageAdjustment: 0,
      confidence: 'low',
      dataSource: 'No data available',
      lastUpdated: new Date().toISOString()
    };
  }
}

// Cache for service instances per dealership
const serviceCache = new Map<number, MarketCheckService>();

/**
 * Get MarketCheck service for a specific dealership
 * Fetches API key from database, caches instance for performance
 */
export async function getMarketCheckServiceForDealership(dealershipId: number): Promise<MarketCheckService | null> {
  // Check cache first
  if (serviceCache.has(dealershipId)) {
    return serviceCache.get(dealershipId)!;
  }
  
  try {
    const apiKeys = await storage.getDealershipApiKeys(dealershipId);
    
    if (apiKeys?.marketcheckKey) {
      const service = new MarketCheckService(apiKeys.marketcheckKey);
      serviceCache.set(dealershipId, service);
      console.log(`[MarketCheck] Service initialized for dealership ${dealershipId}`);
      return service;
    } else {
      console.warn(`[MarketCheck] API key not configured for dealership ${dealershipId}`);
      return null;
    }
  } catch (error) {
    console.error(`[MarketCheck] Error loading API key for dealership ${dealershipId}:`, error);
    return null;
  }
}

/**
 * Clear cached service instance (use when API key is updated)
 */
export function clearMarketCheckCache(dealershipId?: number) {
  if (dealershipId) {
    serviceCache.delete(dealershipId);
  } else {
    serviceCache.clear();
  }
}

// Legacy singleton for backwards compatibility (uses env var or default dealership)
let marketCheckService: MarketCheckService | null = null;

export function getMarketCheckService(): MarketCheckService | null {
  if (!marketCheckService) {
    const apiKey = process.env.MARKETCHECK_API_KEY;
    if (apiKey) {
      marketCheckService = new MarketCheckService(apiKey);
      console.log('[MarketCheck] Service initialized from env');
    } else {
      console.warn('[MarketCheck] API key not configured (MARKETCHECK_API_KEY) - use getMarketCheckServiceForDealership() instead');
    }
  }
  return marketCheckService;
}
