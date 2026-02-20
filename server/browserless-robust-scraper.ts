import { storage } from './storage';
import { upsertVehicleByVin, type ScrapedVehicle } from './scraper';
import {
  getBrowserlessUnifiedService,
  getBrowserlessUnifiedServiceForDealership,
  type VehicleListing,
} from './browserless-unified';
import type { InsertScrapeRun } from '@shared/schema';
import { db } from './db';
import { vehicles, scrapeSources } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { logInfo, logWarn, logError } from './error-utils';

interface RobustScrapeResult {
  success: boolean;
  vehiclesFound: number;
  vehiclesInserted: number;
  vehiclesUpdated: number;
  vehiclesSkipped: number;
  method: 'browserless' | 'local_puppeteer';
  error?: string;
  duration?: number;
  sources?: string[];
}

function convertListingToScrapedVehicle(listing: VehicleListing): ScrapedVehicle {
  return {
    year: listing.year,
    make: listing.make,
    model: listing.model,
    trim: listing.trim || 'Base',
    type: listing.type || 'SUV',
    price: listing.price,
    odometer: listing.odometer,
    images: listing.images || [],
    badges: listing.badges || [],
    location: listing.location,
    dealership: listing.dealership,
    dealershipId: listing.dealershipId,
    description: listing.description || `${listing.year} ${listing.make} ${listing.model}`,
    vin: listing.vin,
    stockNumber: listing.stockNumber,
    carfaxUrl: listing.carfaxUrl,
    dealerVdpUrl: listing.dealerVdpUrl,
    dealRating: listing.dealRating,
    cargurusPrice: listing.cargurusPrice,
    cargurusUrl: listing.cargurusUrl,
  };
}

export async function runBrowserlessInventoryScrape(
  options: {
    dealershipId?: number;
    sourceId?: number;
    triggeredBy?: 'scheduler' | 'manual' | 'webhook';
    scrapeVdp?: boolean;
  } = {}
): Promise<RobustScrapeResult> {
  const { dealershipId, sourceId, triggeredBy = 'manual', scrapeVdp = true } = options;
  const startTime = Date.now();

  logInfo('[Browserless Robust] Starting inventory scrape', {
    service: 'scraper',
    method: 'browserless',
    dealershipId,
    sourceId,
    triggeredBy,
  });

  const runData: InsertScrapeRun = {
    dealershipId: dealershipId || null,
    scrapeType: 'incremental',
    scrapeMethod: 'browserless',
    status: 'running',
    triggeredBy,
  };

  const run = await storage.createScrapeRun(runData);

  try {
    const browserlessService = dealershipId
      ? await getBrowserlessUnifiedServiceForDealership(dealershipId)
      : getBrowserlessUnifiedService();

    const connectionTest = await browserlessService.testConnection();
    if (!connectionTest.success) {
      throw new Error(`Browserless connection failed: ${connectionTest.message}`);
    }

    logInfo('[Browserless Robust] Connection test passed', {
      service: 'scraper',
      method: connectionTest.method,
    });

    let sources;
    if (sourceId) {
      sources = await db
        .select()
        .from(scrapeSources)
        .where(and(eq(scrapeSources.id, sourceId), eq(scrapeSources.isActive, true)));
    } else if (dealershipId) {
      sources = await db
        .select()
        .from(scrapeSources)
        .where(and(eq(scrapeSources.dealershipId, dealershipId), eq(scrapeSources.isActive, true)));
    } else {
      sources = await db.select().from(scrapeSources).where(eq(scrapeSources.isActive, true));
    }

    if (sources.length === 0) {
      throw new Error('No active scrape sources configured');
    }

    logInfo('[Browserless Robust] Found scrape sources', {
      service: 'scraper',
      sourceCount: sources.length,
    });

    let totalFound = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    const scrapedSources: string[] = [];
    let usedMethod: 'browserless' | 'local_puppeteer' = 'browserless';

    for (const source of sources) {
      logInfo('[Browserless Robust] Scraping source', {
        service: 'scraper',
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl,
      });

      try {
        const result = await browserlessService.scrapeDealerInventory(source.sourceUrl, {
          dealershipId: source.dealershipId,
          dealershipName: source.sourceName,
          location: source.sourceName.includes('Vancouver')
            ? 'Vancouver'
            : source.sourceName.includes('Burnaby')
            ? 'Burnaby'
            : 'BC',
          scrapeVdp,
          maxVehicles: 200,
          timeout: 120000,
        });

        usedMethod = result.method;

        if (result.success && result.vehicles.length > 0) {
          scrapedSources.push(source.sourceName);
          totalFound += result.vehicles.length;

          logInfo('[Browserless Robust] Found vehicles from source', {
            service: 'scraper',
            sourceName: source.sourceName,
            vehicleCount: result.vehicles.length,
            method: result.method,
          });

          for (const listing of result.vehicles) {
            try {
              if (!listing.year || !listing.make || !listing.model) {
                totalSkipped++;
                continue;
              }

              const vehicleData = convertListingToScrapedVehicle(listing);
              const saved = await upsertVehicleByVin(vehicleData);

              if (saved.action === 'inserted') {
                totalInserted++;
              } else {
                totalUpdated++;
              }
            } catch (saveError) {
              logWarn('[Browserless Robust] Failed to save vehicle', {
                service: 'scraper',
                error: saveError instanceof Error ? saveError.message : String(saveError),
                vehicle: `${listing.year} ${listing.make} ${listing.model}`,
              });
              totalSkipped++;
            }
          }

          await db
            .update(scrapeSources)
            .set({
              lastScrapedAt: new Date(),
              vehicleCount: result.vehicles.length,
            })
            .where(eq(scrapeSources.id, source.id));
        } else {
          logWarn('[Browserless Robust] Source scrape failed or found no vehicles', {
            service: 'scraper',
            sourceName: source.sourceName,
            error: result.error,
          });
        }
      } catch (sourceError) {
        logError(
          '[Browserless Robust] Error scraping source',
          sourceError instanceof Error ? sourceError : new Error(String(sourceError)),
          { service: 'scraper', sourceName: source.sourceName }
        );
      }
    }

    const duration = Date.now() - startTime;

    await storage.updateScrapeRun(run.id, {
      status: totalFound > 0 ? 'success' : 'failed',
      scrapeMethod: usedMethod,
      vehiclesFound: totalFound,
      vehiclesInserted: totalInserted,
      vehiclesUpdated: totalUpdated,
      durationMs: duration,
      completedAt: new Date(),
    });

    const result: RobustScrapeResult = {
      success: totalFound > 0,
      vehiclesFound: totalFound,
      vehiclesInserted: totalInserted,
      vehiclesUpdated: totalUpdated,
      vehiclesSkipped: totalSkipped,
      method: usedMethod,
      duration,
      sources: scrapedSources,
    };

    logInfo('[Browserless Robust] Scrape completed', {
      service: 'scraper',
      ...result,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    await storage.updateScrapeRun(run.id, {
      status: 'failed',
      scrapeMethod: 'browserless',
      errorMessage,
      durationMs: duration,
      completedAt: new Date(),
    });

    logError('[Browserless Robust] Scrape failed', error instanceof Error ? error : new Error(errorMessage), {
      service: 'scraper',
    });

    return {
      success: false,
      vehiclesFound: 0,
      vehiclesInserted: 0,
      vehiclesUpdated: 0,
      vehiclesSkipped: 0,
      method: 'browserless',
      error: errorMessage,
      duration,
    };
  }
}

export async function runMarketAnalysisScrape(
  searchParams: {
    make: string;
    model: string;
    yearMin?: number;
    yearMax?: number;
    postalCode?: string;
    radiusKm?: number;
    maxResults?: number;
  },
  dealershipId?: number
): Promise<{
  success: boolean;
  cargurusListings: VehicleListing[];
  autotraderListings: VehicleListing[];
  combinedCount: number;
  error?: string;
}> {
  const startTime = Date.now();

  logInfo('[Browserless Market] Starting market analysis scrape', {
    service: 'scraper',
    make: searchParams.make,
    model: searchParams.model,
    yearMin: searchParams.yearMin,
    yearMax: searchParams.yearMax,
  });

  try {
    const browserlessService = dealershipId
      ? await getBrowserlessUnifiedServiceForDealership(dealershipId)
      : getBrowserlessUnifiedService();

    const [cargurusResult, autotraderResult] = await Promise.all([
      browserlessService.scrapeCarGurus(searchParams),
      browserlessService.scrapeAutoTrader(searchParams),
    ]);

    const duration = Date.now() - startTime;

    logInfo('[Browserless Market] Market scrape completed', {
      service: 'scraper',
      cargurusCount: cargurusResult.listings.length,
      autotraderCount: autotraderResult.listings.length,
      cargurusSuccess: cargurusResult.success,
      autotraderSuccess: autotraderResult.success,
      duration,
    });

    return {
      success: cargurusResult.success || autotraderResult.success,
      cargurusListings: cargurusResult.listings,
      autotraderListings: autotraderResult.listings,
      combinedCount: cargurusResult.listings.length + autotraderResult.listings.length,
      error:
        !cargurusResult.success && !autotraderResult.success
          ? `CarGurus: ${cargurusResult.error}, AutoTrader: ${autotraderResult.error}`
          : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logError('[Browserless Market] Market scrape failed', error instanceof Error ? error : new Error(errorMessage), {
      service: 'scraper',
    });

    return {
      success: false,
      cargurusListings: [],
      autotraderListings: [],
      combinedCount: 0,
      error: errorMessage,
    };
  }
}

export async function testBrowserlessConnection(dealershipId?: number): Promise<{
  success: boolean;
  message: string;
  method: string;
  apiKeyConfigured: boolean;
}> {
  try {
    const browserlessService = dealershipId
      ? await getBrowserlessUnifiedServiceForDealership(dealershipId)
      : getBrowserlessUnifiedService();

    const result = await browserlessService.testConnection();

    return {
      success: result.success,
      message: result.message,
      method: result.method,
      apiKeyConfigured: !!process.env.BROWSERLESS_API_KEY,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      method: 'failed',
      apiKeyConfigured: !!process.env.BROWSERLESS_API_KEY,
    };
  }
}
