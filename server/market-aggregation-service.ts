import { storage } from './storage';
import { db } from './db';
import { sql } from 'drizzle-orm';
import { getMarketCheckService, getMarketCheckServiceForDealership } from './marketcheck-service';
import { getApifyService, getApifyServiceForDealership } from './apify-service';
import { getBrowserlessUnifiedService, getBrowserlessUnifiedServiceForDealership } from './browserless-unified';
import { autoTraderScraper } from './autotrader-scraper';
import { kijijiScraper } from './kijiji-scraper';
import { craigslistScraper } from './craigslist-scraper';
import { cargurusScraper } from './cargurus-scraper-service';
import { deduplicateListings } from './market-deduplication';
import type { InsertMarketListing } from '@shared/schema';

export interface MarketAggregationParams {
  make: string;
  model: string;
  yearMin?: number;
  yearMax?: number;
  postalCode?: string;
  radiusKm?: number;
  maxResults?: number;
  dealershipId?: number;
  operationMetricsId?: number;
}

export interface MarketAggregationResult {
  totalListings: number;
  marketCheckCount: number;
  browserlessCount: number;
  cargurusCount: number;
  apifyCount: number;
  scraperCount: number;
  kijijiCount: number;
  craigslistCount: number;
  duplicatesRemoved: number;
  mergedRecords: number;
  success: boolean;
  errors: string[];
  sources: string[];
}

/**
 * Market Data Aggregation Service
 * 
 * Orchestrates data collection from multiple sources in priority order:
 * 1. MarketCheck API (highest quality, most reliable)
 * 2. CarGurus scraper (rich data - specs, history badges, deal ratings)
 * 3. Apify AutoTrader.ca actor (managed scraping)
 * 4. Direct Puppeteer scrapers (fallback)
 * 
 * Handles intelligent deduplication and data quality scoring.
 */
export class MarketAggregationService {
  /**
   * Fetch market data from all available sources
   */
  async aggregateMarketData(params: MarketAggregationParams): Promise<MarketAggregationResult> {
    const result: MarketAggregationResult = {
      totalListings: 0,
      marketCheckCount: 0,
      browserlessCount: 0,
      cargurusCount: 0,
      apifyCount: 0,
      scraperCount: 0,
      kijijiCount: 0,
      craigslistCount: 0,
      duplicatesRemoved: 0,
      mergedRecords: 0,
      success: true,
      errors: [],
      sources: []
    };

    const { operationMetricsId } = params;
    const allListings: InsertMarketListing[] = [];
    const dealershipId = params.dealershipId || 1;

    try {
      console.log(`[MarketAggregation] Starting data collection for ${params.make} ${params.model}${params.dealershipId ? ` (dealership ${params.dealershipId})` : ''}`);

      // 1. Try MarketCheck API (highest priority - rank 1)
    const marketCheckService = params.dealershipId 
      ? await getMarketCheckServiceForDealership(params.dealershipId)
      : getMarketCheckService();
      
    if (marketCheckService) {
      try {
        console.log('[MarketAggregation] Fetching from MarketCheck API...');
        const marketCheckListings = await marketCheckService.searchAndConvert(params);
        
        for (const listing of marketCheckListings) {
          listing.dataSourceRank = 1;
          allListings.push(listing);
          result.marketCheckCount++;
        }
        
        console.log(`[MarketAggregation] MarketCheck: ${result.marketCheckCount} listings`);
        if (result.marketCheckCount > 0) result.sources.push('marketcheck');
      } catch (error) {
        console.error('[MarketAggregation] MarketCheck error:', error);
        result.errors.push(`MarketCheck: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      console.log('[MarketAggregation] MarketCheck API not configured (optional)');
    }

      // 2. Try Browserless unified scraper (priority rank 2 - CarGurus + AutoTrader)
      const browserlessService = params.dealershipId
        ? await getBrowserlessUnifiedServiceForDealership(params.dealershipId)
        : getBrowserlessUnifiedService();

      if (browserlessService) {
        try {
          console.log('[MarketAggregation] Fetching from Browserless (CarGurus + AutoTrader)...');
          const browserlessResult = await browserlessService.scrapeMarketComparables({
        make: params.make,
        model: params.model,
        yearMin: params.yearMin,
        yearMax: params.yearMax,
        postalCode: params.postalCode || 'V6B2W2',
        radiusKm: params.radiusKm || 100,
        maxResults: params.maxResults || 50,
      });

      if (browserlessResult.success && browserlessResult.listings.length > 0) {
        for (const listing of browserlessResult.listings) {
          if (!listing.year || !listing.make || !listing.model) continue;
          
          const source = listing.cargurusUrl ? 'cargurus_browserless' : 'autotrader_browserless';
          const listingUrl = listing.cargurusUrl || listing.dealerVdpUrl || '';
          const externalId = listing.vin 
            ? `browserless_${listing.vin}`
            : `browserless_${source}_${listing.year}_${listing.make.toLowerCase().replace(/\s+/g, '_')}_${listing.model.toLowerCase().replace(/\s+/g, '_')}_${listing.price || 0}`;
          
          const marketListing: InsertMarketListing = {
            dealershipId,
            externalId,
            source,
            listingType: listing.sellerType || 'dealer',
            year: listing.year,
            make: listing.make,
            model: listing.model,
            trim: listing.trim || null,
            price: listing.price ?? 0,
            mileage: listing.odometer ?? null,
            location: listing.location || 'British Columbia',
            postalCode: null,
            latitude: null,
            longitude: null,
            sellerName: listing.dealership || 'Unknown Dealer',
            imageUrl: listing.images?.[0] ?? null,
            listingUrl: listingUrl,
            postedDate: null,
            isActive: true,
            dataSourceRank: 2,
            exteriorColor: listing.exteriorColor || null,
            interiorColor: listing.interiorColor || null,
          };
          allListings.push(marketListing);
          result.browserlessCount++;
        }
          console.log(`[MarketAggregation] Browserless: ${result.browserlessCount} listings`);
          if (result.browserlessCount > 0) result.sources.push('browserless');
        }
        } catch (error) {
          console.error('[MarketAggregation] Browserless error:', error);
          result.errors.push(`Browserless: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        console.log('[MarketAggregation] Browserless not configured (optional)');
      }

      // 3. Try CarGurus scraper as fallback (priority rank 3 - rich data)
    if (result.browserlessCount === 0) {
      try {
        console.log('[MarketAggregation] Fetching from CarGurus fallback...');
        const cargurusListings = await cargurusScraper.searchAndConvert({
          ...params,
          dealershipId,
          maxResults: Math.floor((params.maxResults || 50) / 2)
        });

        for (const listing of cargurusListings) {
          allListings.push(listing);
          result.cargurusCount++;
        }

        console.log(`[MarketAggregation] CarGurus: ${result.cargurusCount} listings`);
        if (result.cargurusCount > 0) result.sources.push('cargurus');
      } catch (error) {
        console.error('[MarketAggregation] CarGurus error:', error);
        result.errors.push(`CarGurus: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // 4. Try Apify AutoTrader.ca actor (priority rank 4)
    const apifyService = params.dealershipId 
      ? await getApifyServiceForDealership(params.dealershipId)
      : getApifyService();
      
    if (apifyService) {
      try {
        console.log('[MarketAggregation] Fetching from Apify AutoTrader.ca...');
        const apifyListings = await apifyService.scrapeAndConvert(params);
        
        for (const listing of apifyListings) {
          listing.dataSourceRank = 3;
          allListings.push(listing);
          result.apifyCount++;
        }
        
        console.log(`[MarketAggregation] Apify: ${result.apifyCount} listings`);
        if (result.apifyCount > 0) result.sources.push('apify');
      } catch (error) {
        console.error('[MarketAggregation] Apify error:', error);
        result.errors.push(`Apify: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      console.log('[MarketAggregation] Apify service not configured (optional)');
    }

    // 4. Try direct Puppeteer scraper (fallback - rank 4)
    // Trigger fallback when: no listings at all, OR fewer than 20 premium listings
    const premiumListingsCount = result.marketCheckCount + result.cargurusCount + result.apifyCount;
    if (allListings.length === 0 || premiumListingsCount < 20) {
      try {
        console.log('[MarketAggregation] Using fallback Puppeteer scraper...');
        const scraperParams = {
          make: params.make,
          model: params.model,
          yearMin: params.yearMin,
          yearMax: params.yearMax,
          postalCode: params.postalCode,
          radiusKm: params.radiusKm,
          maxResults: params.maxResults || 50
        };
        
        const scraperListings = await autoTraderScraper.scrapeListings(scraperParams);
        
        for (const scraperListing of scraperListings) {
          const listing: InsertMarketListing = {
            dealershipId,
            externalId: scraperListing.externalId,
            source: 'autotrader_scraper',
            listingType: scraperListing.listingType,
            year: scraperListing.year,
            make: scraperListing.make,
            model: scraperListing.model,
            trim: scraperListing.trim || null,
            price: scraperListing.price,
            mileage: scraperListing.mileage || null,
            location: scraperListing.location || 'Canada',
            postalCode: null,
            latitude: null,
            longitude: null,
            sellerName: scraperListing.sellerName,
            imageUrl: scraperListing.imageUrl || null,
            listingUrl: scraperListing.listingUrl,
            postedDate: scraperListing.postedDate || null,
            isActive: true,
            dataSourceRank: 4
          };
          
          allListings.push(listing);
          result.scraperCount++;
        }
        
        console.log(`[MarketAggregation] Scraper: ${result.scraperCount} listings`);
        if (result.scraperCount > 0) result.sources.push('autotrader');
      } catch (error) {
        console.error('[MarketAggregation] Scraper error:', error);
        result.errors.push(`Scraper: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      console.log('[MarketAggregation] Skipping scraper (sufficient premium data)');
    }

    // 5. Try Kijiji Autos scraper (rank 5)
    try {
      console.log('[MarketAggregation] Fetching from Kijiji Autos...');
      const kijijiListings = await kijijiScraper.searchAndConvert({
        make: params.make,
        model: params.model,
        yearMin: params.yearMin,
        yearMax: params.yearMax,
        postalCode: params.postalCode,
        radiusKm: params.radiusKm,
        maxResults: Math.floor((params.maxResults || 50) / 2)
      });
      
      for (const listing of kijijiListings) {
        listing.dealershipId = dealershipId;
        listing.dataSourceRank = 5;
        allListings.push(listing);
        result.kijijiCount++;
      }
      
      console.log(`[MarketAggregation] Kijiji: ${result.kijijiCount} listings`);
      if (result.kijijiCount > 0) result.sources.push('kijiji');
    } catch (error) {
      console.error('[MarketAggregation] Kijiji error:', error);
      result.errors.push(`Kijiji: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 6. Try Craigslist scraper (rank 6)
    try {
      console.log('[MarketAggregation] Fetching from Craigslist...');
      const craigslistListings = await craigslistScraper.searchAndConvert({
        make: params.make,
        model: params.model,
        yearMin: params.yearMin,
        yearMax: params.yearMax,
        maxResults: Math.floor((params.maxResults || 50) / 3)
      });
      
      for (const listing of craigslistListings) {
        listing.dealershipId = dealershipId;
        listing.dataSourceRank = 6;
        allListings.push(listing);
        result.craigslistCount++;
      }
      
      console.log(`[MarketAggregation] Craigslist: ${result.craigslistCount} listings`);
      if (result.craigslistCount > 0) result.sources.push('craigslist');
    } catch (error) {
      console.error('[MarketAggregation] Craigslist error:', error);
      result.errors.push(`Craigslist: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Deduplicate all collected listings
    console.log(`[MarketAggregation] Deduplicating ${allListings.length} listings...`);
    const deduped = deduplicateListings(allListings);
    result.duplicatesRemoved = deduped.duplicatesRemoved;
    result.mergedRecords = deduped.mergedRecords;
    
    console.log(`[MarketAggregation] After dedup: ${deduped.uniqueListings.length} unique (${deduped.duplicatesRemoved} removed, ${deduped.mergedRecords} merged)`);

    // Fetch existing listings to avoid re-inserting
    const listingUrls = deduped.uniqueListings.map(l => l.listingUrl);
    let existingUrls = new Set<string>();
    try {
      const existingListings = await storage.getMarketListingsByUrls(dealershipId, listingUrls);
      existingUrls = new Set(existingListings.map(l => l.listingUrl));
    } catch (error) {
      console.error('[MarketAggregation] Error fetching existing listings:', error);
    }
    
    // Save only new listings
    let savedCount = 0;
    for (const listing of deduped.uniqueListings) {
      if (!existingUrls.has(listing.listingUrl)) {
        try {
          await storage.createMarketListing(listing);
          savedCount++;
        } catch (error) {
          if (error instanceof Error && (error.message.includes('unique') || error.message.includes('duplicate key'))) {
            console.log(`[MarketAggregation] Listing already exists (race condition): ${listing.listingUrl}`);
          } else {
            console.error(`[MarketAggregation] Error saving listing:`, error);
          }
        }
      }
    }

      result.totalListings = savedCount;
      result.success = result.totalListings > 0 || result.errors.length === 0;

      console.log(`[MarketAggregation] Complete: ${result.totalListings} new listings saved`);
      console.log(`[MarketAggregation] Breakdown: MarketCheck=${result.marketCheckCount}, CarGurus=${result.cargurusCount}, Apify=${result.apifyCount}, Scraper=${result.scraperCount}, Kijiji=${result.kijijiCount}, Craigslist=${result.craigslistCount}`);
      
      if (result.errors.length > 0) {
        console.log(`[MarketAggregation] Errors: ${result.errors.join(', ')}`);
      }

    } catch (error) {
      console.error('[MarketAggregation] Fatal error during aggregation:', error);
      result.success = false;
      result.errors.push(`Fatal: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Update operation metrics if tracking ID was provided
      if (operationMetricsId) {
        try {
          await db.execute(sql`
            UPDATE operation_metrics 
            SET 
              status = ${result.success ? 'completed' : 'failed'},
              completed_at = NOW(),
              result_summary = ${JSON.stringify({
                totalListings: result.totalListings,
                sources: result.sources,
                errors: result.errors.length
              })}
            WHERE id = ${operationMetricsId}
          `);
        } catch (metricsError) {
          console.error('[MarketAggregation] Failed to update operation metrics:', metricsError);
        }
      }
    }

    return result;
  }
}

// Export singleton instance
export const marketAggregationService = new MarketAggregationService();
