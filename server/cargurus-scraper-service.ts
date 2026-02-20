import puppeteer from "puppeteer";
import crypto from "crypto";
import type { InsertMarketListing } from "@shared/schema";

export interface CargurusSearchParams {
  make: string;
  model: string;
  yearMin?: number;
  yearMax?: number;
  postalCode?: string;
  radiusKm?: number;
  maxResults?: number;
  dealershipId?: number;
}

export interface CargurusVehicleData {
  vin?: string;
  externalId: string;
  listingUrl: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  price: number;
  mileage?: number;
  location?: string;
  sellerName?: string;
  imageUrl?: string;
  interiorColor?: string;
  exteriorColor?: string;
  dealRating?: string;
  dealerRating?: string;
  daysOnLot?: number;
  daysOnCarGurus?: number;
  specs?: {
    engine?: string;
    transmission?: string;
    drivetrain?: string;
    fuelType?: string;
    mpg?: string;
    bodyType?: string;
    cylinders?: string;
    horsepower?: string;
    torque?: string;
  };
  features?: string[];
  historyBadges?: string[];
  marketAvailabilityCount?: number;
  priceHistory?: Array<{ date: string; price: number }>;
  dealerInfo?: {
    name?: string;
    rating?: number;
    reviewCount?: number;
    phone?: string;
    address?: string;
  };
  vehicleDescription?: string;
  carfaxUrl?: string;
  detailsEnriched?: boolean;
}

export interface CargurusDetailResult {
  success: boolean;
  data?: Partial<CargurusVehicleData>;
  error?: string;
  responseTimeMs: number;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--single-process'
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function generateVehicleHash(vehicle: {
  make: string;
  model: string;
  year: number;
  trim?: string | null;
  sellerName?: string | null;
  mileage?: number | null;
}): string {
  const normalized = [
    vehicle.make.toLowerCase().trim(),
    vehicle.model.toLowerCase().trim(),
    vehicle.year.toString(),
    (vehicle.trim || '').toLowerCase().trim(),
    (vehicle.sellerName || '').toLowerCase().trim().replace(/[^a-z0-9]/g, ''),
    vehicle.mileage ? Math.floor(vehicle.mileage / 1000).toString() : ''
  ].join('|');
  
  return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 16);
}

export function calculateSourceConfidence(vehicle: CargurusVehicleData): number {
  let score = 0;
  
  if (vehicle.vin) score += 20;
  if (vehicle.price > 0) score += 15;
  if (vehicle.mileage && vehicle.mileage > 0) score += 10;
  if (vehicle.interiorColor) score += 5;
  if (vehicle.exteriorColor) score += 5;
  if (vehicle.sellerName) score += 5;
  if (vehicle.imageUrl) score += 5;
  if (vehicle.dealRating) score += 5;
  if (vehicle.specs && Object.keys(vehicle.specs).length > 0) score += 10;
  if (vehicle.features && vehicle.features.length > 0) score += 5;
  if (vehicle.historyBadges && vehicle.historyBadges.length > 0) score += 10;
  if (vehicle.location) score += 5;
  
  return Math.min(100, score);
}

export class CargurusScraper {
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 2000;

  private async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      await sleep(this.minRequestInterval - timeSinceLastRequest);
    }
    
    this.lastRequestTime = Date.now();
  }

  async searchListings(params: CargurusSearchParams): Promise<CargurusVehicleData[]> {
    const startTime = Date.now();
    let browser = null;
    const results: CargurusVehicleData[] = [];
    
    try {
      await this.throttle();
      
      console.log(`[CarGurus Scraper] Searching for ${params.yearMin || ''}-${params.yearMax || ''} ${params.make} ${params.model}`);
      
      browser = await puppeteer.launch({
        headless: true,
        args: PUPPETEER_ARGS
      });
      
      const page = await browser.newPage();
      await page.setUserAgent(USER_AGENT);
      
      const postalCode = params.postalCode || 'V6H';
      const radius = params.radiusKm || 500;
      
      let searchUrl = `https://www.cargurus.ca/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action?zip=${encodeURIComponent(postalCode)}&showNegotiable=true&sortDir=ASC&sourceContext=carGurusHomePageModel&distance=${radius}&sortType=DEAL_SCORE&stkTypId=28881`;
      
      searchUrl += `&mkId=${encodeURIComponent(params.make)}`;
      searchUrl += `&mdId=${encodeURIComponent(params.model)}`;
      
      if (params.yearMin) {
        searchUrl += `&minYear=${params.yearMin}`;
      }
      if (params.yearMax) {
        searchUrl += `&maxYear=${params.yearMax}`;
      }
      
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(2000);
      
      const pageData = await page.evaluate(() => {
        const listings: any[] = [];
        
        try {
          const nextDataScript = document.querySelector('script#__NEXT_DATA__');
          if (nextDataScript && nextDataScript.textContent) {
            const nextData = JSON.parse(nextDataScript.textContent);
            const searchResults = nextData?.props?.pageProps?.listings ||
                                 nextData?.props?.pageProps?.searchResults?.listings ||
                                 nextData?.props?.pageProps?.searchResponse?.listings ||
                                 [];
            
            for (const listing of searchResults) {
              listings.push({
                id: listing.id?.toString() || listing.listingId?.toString(),
                vin: listing.vin,
                year: listing.year,
                make: listing.makeName || listing.make,
                model: listing.modelName || listing.model,
                trim: listing.trimName || listing.trim,
                price: listing.price || listing.listPrice,
                mileage: listing.mileage,
                location: listing.dealerCity ? `${listing.dealerCity}, ${listing.dealerState || listing.dealerProvince}` : undefined,
                sellerName: listing.dealerName || listing.dealer?.name,
                dealerRating: listing.dealerRating?.toString() || listing.dealer?.rating?.toString(),
                imageUrl: listing.mainPictureUrl || listing.pictureUrl || listing.imageUrl,
                listingUrl: listing.url || listing.listingUrl,
                dealRating: listing.dealRating || listing.dealType,
                interiorColor: listing.interiorColor || listing.interior_color,
                exteriorColor: listing.exteriorColor || listing.exterior_color || listing.color,
                engine: listing.engine || listing.engineDescription,
                transmission: listing.transmission || listing.transmissionDescription,
                drivetrain: listing.drivetrain || listing.driveType,
                fuelType: listing.fuelType,
                mpg: listing.mpgCity && listing.mpgHighway ? `${listing.mpgCity}/${listing.mpgHighway}` : undefined,
                bodyType: listing.bodyType || listing.bodyStyle,
                accidentFree: listing.accidentFree,
                oneOwner: listing.oneOwner || listing.singleOwner,
                personalUse: listing.personalUse,
                serviceRecords: listing.serviceRecords,
                dealerInventoryCount: listing.dealerInventoryCount,
                daysOnLot: listing.daysOnLot || listing.days_on_lot || listing.daysAtDealer || listing.listingAge,
                daysOnCarGurus: listing.daysOnCarGurus || listing.daysOnSite || listing.listingDuration
              });
            }
          }
        } catch (e) {
          console.error('Error parsing __NEXT_DATA__:', e);
        }
        
        return listings;
      });
      
      const maxResults = params.maxResults || 50;
      
      for (const data of pageData.slice(0, maxResults)) {
        if (!data.year || !data.make || !data.model || !data.price) {
          continue;
        }
        
        const specs: CargurusVehicleData['specs'] = {};
        if (data.engine) specs.engine = data.engine;
        if (data.transmission) specs.transmission = data.transmission;
        if (data.drivetrain) specs.drivetrain = data.drivetrain;
        if (data.fuelType) specs.fuelType = data.fuelType;
        if (data.mpg) specs.mpg = data.mpg;
        if (data.bodyType) specs.bodyType = data.bodyType;
        
        const historyBadges: string[] = [];
        if (data.accidentFree) historyBadges.push('Accident-Free');
        if (data.oneOwner) historyBadges.push('One-Owner');
        if (data.personalUse) historyBadges.push('Personal Use');
        if (data.serviceRecords) historyBadges.push('Service Records');
        
        let listingUrl = data.listingUrl || '';
        if (listingUrl && !listingUrl.startsWith('http')) {
          listingUrl = `https://www.cargurus.ca${listingUrl}`;
        }
        
        const vehicle: CargurusVehicleData = {
          vin: data.vin,
          externalId: data.id || `cg-${data.year}-${data.make}-${data.model}-${Date.now()}`,
          listingUrl: listingUrl || `https://www.cargurus.ca/Cars/l-Used-${data.make}-${data.model}-${data.id}`,
          year: parseInt(data.year),
          make: data.make,
          model: data.model,
          trim: data.trim,
          price: parseInt(data.price),
          mileage: data.mileage ? parseInt(data.mileage) : undefined,
          location: data.location,
          sellerName: data.sellerName,
          imageUrl: data.imageUrl,
          interiorColor: data.interiorColor,
          exteriorColor: data.exteriorColor,
          dealRating: data.dealRating,
          dealerRating: data.dealerRating,
          daysOnLot: data.daysOnLot ? parseInt(data.daysOnLot) : undefined,
          daysOnCarGurus: data.daysOnCarGurus ? parseInt(data.daysOnCarGurus) : undefined,
          specs: Object.keys(specs).length > 0 ? specs : undefined,
          historyBadges: historyBadges.length > 0 ? historyBadges : undefined,
          marketAvailabilityCount: data.dealerInventoryCount
        };
        
        results.push(vehicle);
      }
      
      const responseTime = Date.now() - startTime;
      console.log(`[CarGurus Scraper] Found ${results.length} vehicles in ${responseTime}ms`);
      
      return results;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error(`[CarGurus Scraper] Failed after ${responseTime}ms:`, error instanceof Error ? error.message : 'Unknown error');
      return results;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async getListingDetails(listingUrl: string): Promise<CargurusDetailResult> {
    const startTime = Date.now();
    let browser = null;
    
    try {
      await this.throttle();
      
      console.log(`[CarGurus Detail] Fetching details from: ${listingUrl}`);
      
      browser = await puppeteer.launch({
        headless: true,
        args: PUPPETEER_ARGS
      });
      
      const page = await browser.newPage();
      await page.setUserAgent(USER_AGENT);
      
      await page.goto(listingUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(2000);
      
      const detailData = await page.evaluate(() => {
        const result: any = {};
        
        try {
          const nextDataScript = document.querySelector('script#__NEXT_DATA__');
          if (nextDataScript && nextDataScript.textContent) {
            const nextData = JSON.parse(nextDataScript.textContent);
            const listing = nextData?.props?.pageProps?.listing ||
                           nextData?.props?.pageProps?.vdp?.listing ||
                           nextData?.props?.pageProps?.vehicleDetails ||
                           nextData?.props?.pageProps;
            
            if (listing) {
              result.vin = listing.vin;
              result.year = listing.year;
              result.make = listing.makeName || listing.make;
              result.model = listing.modelName || listing.model;
              result.trim = listing.trimName || listing.trim || listing.trimDescription;
              result.price = listing.price || listing.listPrice;
              result.mileage = listing.mileage || listing.miles;
              
              result.interiorColor = listing.interiorColor || listing.interiorColorName;
              result.exteriorColor = listing.exteriorColor || listing.exteriorColorName || listing.color;
              
              result.daysOnLot = listing.daysOnLot || listing.daysAtDealer || listing.listingAge;
              result.daysOnCarGurus = listing.daysOnCarGurus || listing.daysOnSite;
              
              result.specs = {
                engine: listing.engine || listing.engineDescription,
                transmission: listing.transmission || listing.transmissionDescription,
                drivetrain: listing.drivetrain || listing.driveType,
                fuelType: listing.fuelType || listing.fuelTypePrimary,
                bodyType: listing.bodyType || listing.bodyStyle,
                cylinders: listing.cylinders?.toString() || listing.engineCylinders?.toString(),
                horsepower: listing.horsepower?.toString() || listing.engineHP?.toString(),
                torque: listing.torque?.toString()
              };
              
              if (listing.mpgCity && listing.mpgHighway) {
                result.specs.mpg = `${listing.mpgCity}/${listing.mpgHighway}`;
              }
              
              result.dealRating = listing.dealRating || listing.dealType;
              
              const features: string[] = [];
              if (listing.features && Array.isArray(listing.features)) {
                for (const f of listing.features) {
                  if (typeof f === 'string') features.push(f);
                  else if (f?.name) features.push(f.name);
                  else if (f?.description) features.push(f.description);
                }
              }
              if (listing.highlightedFeatures && Array.isArray(listing.highlightedFeatures)) {
                for (const f of listing.highlightedFeatures) {
                  if (typeof f === 'string') features.push(f);
                  else if (f?.name) features.push(f.name);
                }
              }
              result.features = features;
              
              const historyBadges: string[] = [];
              if (listing.accidentFree === true) historyBadges.push('Accident-Free');
              if (listing.oneOwner === true || listing.singleOwner === true) historyBadges.push('One-Owner');
              if (listing.personalUse === true) historyBadges.push('Personal Use');
              if (listing.serviceRecords === true) historyBadges.push('Service Records');
              if (listing.cleanTitle === true) historyBadges.push('Clean Title');
              result.historyBadges = historyBadges;
              
              if (listing.priceHistory && Array.isArray(listing.priceHistory)) {
                result.priceHistory = listing.priceHistory.map((ph: any) => ({
                  date: ph.date || ph.timestamp,
                  price: ph.price || ph.amount
                }));
              }
              
              const dealer = listing.dealer || {};
              result.dealerInfo = {
                name: dealer.name || listing.dealerName,
                rating: dealer.rating || listing.dealerRating,
                reviewCount: dealer.reviewCount || dealer.numReviews,
                phone: dealer.phone || dealer.phoneNumber,
                address: dealer.address || (dealer.city ? `${dealer.city}, ${dealer.state || dealer.province}` : undefined)
              };
              
              result.vehicleDescription = listing.description || listing.sellerComments;
              result.carfaxUrl = listing.carfaxUrl || listing.carfaxReportUrl;
              result.imageUrl = listing.mainPictureUrl || listing.pictureUrl;
              result.sellerName = dealer.name || listing.dealerName;
              result.location = dealer.city ? `${dealer.city}, ${dealer.state || dealer.province}` : undefined;
            }
          }
        } catch (e) {
          console.error('Error parsing detail page __NEXT_DATA__:', e);
        }
        
        return result;
      });
      
      const responseTimeMs = Date.now() - startTime;
      
      if (detailData && (detailData.vin || detailData.year)) {
        console.log(`[CarGurus Detail] Successfully extracted details in ${responseTimeMs}ms`);
        return {
          success: true,
          data: {
            ...detailData,
            specs: Object.keys(detailData.specs || {}).some((k: string) => detailData.specs[k]) ? detailData.specs : undefined,
            features: detailData.features?.length > 0 ? detailData.features : undefined,
            historyBadges: detailData.historyBadges?.length > 0 ? detailData.historyBadges : undefined,
            detailsEnriched: true
          },
          responseTimeMs
        };
      }
      
      return {
        success: false,
        error: 'No listing data found on page',
        responseTimeMs
      };
      
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      console.error(`[CarGurus Detail] Failed after ${responseTimeMs}ms:`, error instanceof Error ? error.message : 'Unknown error');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTimeMs
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async enrichWithDetails(vehicles: CargurusVehicleData[], maxEnrich: number = 10): Promise<CargurusVehicleData[]> {
    const toEnrich = vehicles.slice(0, maxEnrich);
    const enriched: CargurusVehicleData[] = [];
    
    console.log(`[CarGurus Enrichment] Enriching ${toEnrich.length} vehicles with detail data`);
    
    for (const vehicle of toEnrich) {
      if (!vehicle.listingUrl) {
        enriched.push(vehicle);
        continue;
      }
      
      const detailResult = await this.getListingDetails(vehicle.listingUrl);
      
      if (detailResult.success && detailResult.data) {
        const mergedSpecs = {
          ...vehicle.specs,
          ...detailResult.data.specs
        };
        
        const mergedFeatures = [
          ...(vehicle.features || []),
          ...(detailResult.data.features || [])
        ];
        const uniqueFeatures = [...new Set(mergedFeatures)];
        
        const mergedBadges = [
          ...(vehicle.historyBadges || []),
          ...(detailResult.data.historyBadges || [])
        ];
        const uniqueBadges = [...new Set(mergedBadges)];
        
        enriched.push({
          ...vehicle,
          vin: detailResult.data.vin || vehicle.vin,
          trim: detailResult.data.trim || vehicle.trim,
          interiorColor: detailResult.data.interiorColor || vehicle.interiorColor,
          exteriorColor: detailResult.data.exteriorColor || vehicle.exteriorColor,
          daysOnLot: detailResult.data.daysOnLot || vehicle.daysOnLot,
          daysOnCarGurus: detailResult.data.daysOnCarGurus || vehicle.daysOnCarGurus,
          specs: Object.keys(mergedSpecs).length > 0 ? mergedSpecs : undefined,
          features: uniqueFeatures.length > 0 ? uniqueFeatures : undefined,
          historyBadges: uniqueBadges.length > 0 ? uniqueBadges : undefined,
          priceHistory: detailResult.data.priceHistory,
          dealerInfo: detailResult.data.dealerInfo,
          vehicleDescription: detailResult.data.vehicleDescription,
          carfaxUrl: detailResult.data.carfaxUrl,
          detailsEnriched: true
        });
      } else {
        enriched.push(vehicle);
      }
    }
    
    const remaining = vehicles.slice(maxEnrich);
    
    console.log(`[CarGurus Enrichment] Enriched ${enriched.filter(v => v.detailsEnriched).length}/${toEnrich.length} vehicles successfully`);
    
    return [...enriched, ...remaining];
  }

  async searchAndConvert(params: CargurusSearchParams): Promise<InsertMarketListing[]> {
    const vehicles = await this.searchListings(params);
    const dealershipId = params.dealershipId || 1;
    
    return vehicles.map(vehicle => {
      const confidence = calculateSourceConfidence(vehicle);
      const hash = generateVehicleHash({
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        trim: vehicle.trim,
        sellerName: vehicle.sellerName,
        mileage: vehicle.mileage
      });
      
      const listing: InsertMarketListing = {
        dealershipId,
        externalId: vehicle.externalId,
        source: 'cargurus',
        listingType: vehicle.sellerName?.toLowerCase().includes('private') ? 'private' : 'dealer',
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim || null,
        price: vehicle.price,
        mileage: vehicle.mileage || null,
        location: vehicle.location || 'Canada',
        postalCode: params.postalCode || null,
        latitude: null,
        longitude: null,
        sellerName: vehicle.sellerName || null,
        imageUrl: vehicle.imageUrl || null,
        listingUrl: vehicle.listingUrl,
        postedDate: null,
        isActive: true,
        interiorColor: vehicle.interiorColor || null,
        exteriorColor: vehicle.exteriorColor || null,
        vin: vehicle.vin || null,
        colorScrapedAt: vehicle.interiorColor || vehicle.exteriorColor ? new Date() : null,
        sourceConfidence: confidence,
        specsJson: vehicle.specs ? JSON.stringify(vehicle.specs) : null,
        featuresJson: vehicle.features ? JSON.stringify(vehicle.features) : null,
        marketAvailabilityCount: vehicle.marketAvailabilityCount || null,
        dataSourceRank: 2,
        vehicleHash: hash,
        dealerRating: vehicle.dealerRating || null,
        historyBadges: vehicle.historyBadges ? JSON.stringify(vehicle.historyBadges) : null,
        daysOnLot: vehicle.daysOnLot || null
      };
      
      return listing;
    });
  }
}

export const cargurusScraper = new CargurusScraper();
