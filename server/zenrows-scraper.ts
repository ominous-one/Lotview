import * as cheerio from 'cheerio';

export interface ZenRowsConfig {
  apiKey: string;
}

export interface ZenRowsVehicleListing {
  year: number;
  make: string;
  model: string;
  trim?: string;
  type?: string;
  price: number | null;
  odometer: number | null;
  images: string[];
  badges: string[];
  location: string;
  dealership: string;
  dealershipId: number;
  description?: string;
  vin?: string;
  stockNumber?: string;
  carfaxUrl?: string;
  dealerVdpUrl?: string;
  exteriorColor?: string;
  interiorColor?: string;
  engine?: string;
  transmission?: string;
  drivetrain?: string;
  fuelType?: string;
  features?: string[];
}

export interface ZenRowsScrapeResult {
  success: boolean;
  vehicles: ZenRowsVehicleListing[];
  error?: string;
  method: 'zenrows';
  duration?: number;
  creditsUsed?: number;
}

const ZENROWS_API_URL = 'https://api.zenrows.com/v1/';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class ZenRowsScraperService {
  private apiKey: string;

  constructor(config?: ZenRowsConfig) {
    this.apiKey = config?.apiKey || process.env.ZENROWS_API_KEY || '';
    
    if (this.apiKey) {
      console.log('[ZenRows] API key configured, service ready');
    } else {
      console.log('[ZenRows] No API key configured');
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.apiKey) {
      return { success: false, message: 'No ZenRows API key configured' };
    }

    try {
      const testUrl = 'https://httpbin.org/html';
      const params = new URLSearchParams({
        url: testUrl,
        apikey: this.apiKey,
      });

      const response = await fetch(`${ZENROWS_API_URL}?${params.toString()}`);
      
      if (response.ok) {
        return { success: true, message: 'ZenRows API connection successful' };
      } else {
        const errorText = await response.text();
        return { success: false, message: `ZenRows API error: ${response.status} - ${errorText}` };
      }
    } catch (error) {
      return { 
        success: false, 
        message: `Connection error: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  async scrapeUrl(url: string, options?: {
    jsRender?: boolean;
    premiumProxy?: boolean;
    waitFor?: string;
    waitMs?: number;
  }): Promise<{ success: boolean; html?: string; error?: string }> {
    if (!this.apiKey) {
      return { success: false, error: 'No ZenRows API key configured' };
    }

    const { jsRender = true, premiumProxy = true, waitFor, waitMs } = options || {};

    try {
      console.log(`[ZenRows] Scraping URL: ${url}`);
      console.log(`[ZenRows] Options: jsRender=${jsRender}, premiumProxy=${premiumProxy}`);

      const params = new URLSearchParams({
        url,
        apikey: this.apiKey,
        js_render: jsRender.toString(),
        premium_proxy: premiumProxy.toString(),
      });

      if (waitFor) {
        params.set('wait_for', waitFor);
      }
      if (waitMs) {
        params.set('wait', waitMs.toString());
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await fetch(`${ZENROWS_API_URL}?${params.toString()}`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[ZenRows] API error: ${response.status} - ${errorText}`);
        
        if (response.status === 422) {
          return { success: false, error: `ZenRows: Site requires additional options or is blocked. Details: ${errorText}` };
        }
        
        return { success: false, error: `ZenRows API error: ${response.status} - ${errorText}` };
      }

      const html = await response.text();
      console.log(`[ZenRows] Successfully retrieved ${html.length} chars of HTML`);

      const htmlLower = html.toLowerCase();
      if (htmlLower.includes('attention required') || 
          (htmlLower.includes('checking your browser') && htmlLower.includes('cloudflare'))) {
        console.log('[ZenRows] Warning: Still received Cloudflare challenge page');
        return { success: false, error: 'Still received Cloudflare challenge page' };
      }

      return { success: true, html };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ZenRows] Scrape error: ${errorMsg}`);
      return { success: false, error: `ZenRows scrape failed: ${errorMsg}` };
    }
  }

  async scrapeDealerInventory(
    inventoryUrl: string,
    options: {
      dealershipId: number;
      dealershipName: string;
      location?: string;
      scrapeVdp?: boolean;
      maxVehicles?: number;
    }
  ): Promise<ZenRowsScrapeResult> {
    const startTime = Date.now();
    const { dealershipId, dealershipName, location = 'BC', scrapeVdp = true, maxVehicles = 200 } = options;

    console.log(`[ZenRows] Starting inventory scrape for ${dealershipName}`);
    console.log(`[ZenRows] Inventory URL: ${inventoryUrl}`);

    const listingResult = await this.scrapeUrl(inventoryUrl, {
      jsRender: true,
      premiumProxy: true,
      waitMs: 5000,
    });

    if (!listingResult.success || !listingResult.html) {
      return {
        success: false,
        vehicles: [],
        error: listingResult.error || 'Failed to scrape listing page',
        method: 'zenrows',
        duration: Date.now() - startTime,
      };
    }

    const vehicleUrls = this.extractVehicleUrls(listingResult.html, inventoryUrl);
    console.log(`[ZenRows] Found ${vehicleUrls.length} vehicle URLs`);

    const vehicles: ZenRowsVehicleListing[] = [];

    if (scrapeVdp && vehicleUrls.length > 0) {
      const urlsToScrape = vehicleUrls.slice(0, maxVehicles);
      
      for (let i = 0; i < urlsToScrape.length; i++) {
        const vdpUrl = urlsToScrape[i];
        console.log(`[ZenRows] Scraping VDP ${i + 1}/${urlsToScrape.length}: ${vdpUrl}`);

        try {
          const vdpResult = await this.scrapeUrl(vdpUrl, {
            jsRender: true,
            premiumProxy: true,
            waitMs: 3000,
          });

          if (vdpResult.success && vdpResult.html) {
            const vehicle = this.parseVdpHtml(vdpResult.html, vdpUrl, { dealershipId, dealershipName, location });
            if (vehicle) {
              vehicles.push(vehicle);
              console.log(`[ZenRows] Parsed: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
            }
          }

          await sleep(500 + Math.random() * 1000);
        } catch (error) {
          console.warn(`[ZenRows] VDP scrape error for ${vdpUrl}:`, error);
        }
      }
    } else {
      const listingVehicles = this.extractFromListingPage(listingResult.html, { dealershipId, dealershipName, location });
      vehicles.push(...listingVehicles);
    }

    return {
      success: true,
      vehicles,
      method: 'zenrows',
      duration: Date.now() - startTime,
    };
  }

  private extractVehicleUrls(html: string, baseUrl: string): string[] {
    const $ = cheerio.load(html);
    const urls: string[] = [];
    const seen = new Set<string>();

    $('a[href*="/vehicles/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.match(/\/vehicles\/\d{4}\/[a-z-]+\/[a-z0-9-]+\//i)) {
        let fullUrl = href;
        if (href.startsWith('/')) {
          try {
            const urlObj = new URL(baseUrl);
            fullUrl = `${urlObj.origin}${href}`;
          } catch {}
        }
        if (!seen.has(fullUrl)) {
          seen.add(fullUrl);
          urls.push(fullUrl);
        }
      }
    });

    return urls;
  }

  private extractFromListingPage(
    html: string,
    context: { dealershipId: number; dealershipName: string; location: string }
  ): ZenRowsVehicleListing[] {
    const $ = cheerio.load(html);
    const vehicles: ZenRowsVehicleListing[] = [];
    const processedUrls = new Set<string>();

    $('a[href*="/vehicles/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || processedUrls.has(href)) return;

      const match = href.match(/\/vehicles\/(\d{4})\/([a-z-]+)\/([a-z0-9-]+)\//i);
      if (!match) return;

      processedUrls.add(href);
      const [, yearStr, makeSlug, modelSlug] = match;
      
      const card = $(el).closest('.vehicle-card, .vehicle-item, .product-item, article, .item, .listing');
      const cardText = card.text();

      const year = parseInt(yearStr);
      const make = makeSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const model = modelSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

      let price: number | null = null;
      const priceMatch = cardText.match(/\$([0-9,]+)/);
      if (priceMatch) {
        price = parseInt(priceMatch[1].replace(/,/g, ''));
      }

      let odometer: number | null = null;
      const odometerMatch = cardText.match(/(\d+[,\d]*)\s*km/i);
      if (odometerMatch) {
        odometer = parseInt(odometerMatch[1].replace(/,/g, ''));
      }

      const images: string[] = [];
      card.find('img').each((_, img) => {
        const src = $(img).attr('src') || $(img).attr('data-src');
        if (src && src.startsWith('http') && !src.includes('placeholder') && !src.includes('no-image')) {
          images.push(src);
        }
      });

      vehicles.push({
        year,
        make,
        model,
        price,
        odometer,
        images,
        badges: [],
        location: context.location,
        dealership: context.dealershipName,
        dealershipId: context.dealershipId,
        dealerVdpUrl: href.startsWith('http') ? href : undefined,
      });
    });

    return vehicles;
  }

  private parseVdpHtml(
    html: string,
    vdpUrl: string,
    context: { dealershipId: number; dealershipName: string; location: string }
  ): ZenRowsVehicleListing | null {
    const { dealershipId, dealershipName, location } = context;

    const urlMatch = vdpUrl.match(/\/vehicles\/(\d{4})\/([a-z-]+)\/([a-z0-9-]+)\//i);
    if (!urlMatch) return null;

    const [, yearStr, makeSlug, modelSlug] = urlMatch;
    const year = parseInt(yearStr);
    const make = makeSlug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const model = modelSlug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    const $ = cheerio.load(html);
    const pageText = $('body').text();

    let price: number | null = null;
    const pricePatterns = [
      /\$\s*([\d,]+)/,
      /price[:\s]+\$?\s*([\d,]+)/i,
      /dealer\s*price[:\s]+\$?\s*([\d,]+)/i,
    ];
    for (const pattern of pricePatterns) {
      const match = pageText.match(pattern);
      if (match) {
        const p = parseInt(match[1].replace(/,/g, ''));
        if (p > 1000 && p < 500000) {
          price = p;
          break;
        }
      }
    }

    let odometer: number | null = null;
    const odometerMatch = pageText.match(/(\d{1,3}(?:,\d{3})*)\s*km/i);
    if (odometerMatch) {
      odometer = parseInt(odometerMatch[1].replace(/,/g, ''));
    }

    const images: string[] = [];
    $('img').each((_, img) => {
      const src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-lazy-src');
      if (src && src.startsWith('http') && !src.includes('placeholder') && !src.includes('logo') && !src.includes('thumbnail')) {
        if (src.includes('vehicle') || src.includes('inventory') || src.includes('car') || src.includes('auto')) {
          if (!images.includes(src)) images.push(src);
        }
      }
    });

    let vin: string | undefined;
    const vinMatch = pageText.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
    if (vinMatch) vin = vinMatch[1];

    let stockNumber: string | undefined;
    const stockMatch = pageText.match(/stock[#:\s]*([A-Z0-9-]+)/i);
    if (stockMatch) stockNumber = stockMatch[1];

    let carfaxUrl: string | undefined;
    $('a[href*="carfax"]').each((_, el) => {
      carfaxUrl = $(el).attr('href');
    });

    const badges: string[] = [];
    const lowerText = pageText.toLowerCase();
    if (/one owner|1 owner|single owner/.test(lowerText)) badges.push('One Owner');
    if (/no accidents?|accident[\s-]?free|clean history/.test(lowerText)) badges.push('No Accidents');
    if (/certified|cpo|certified pre-owned/.test(lowerText)) badges.push('Certified Pre-Owned');

    let exteriorColor: string | undefined;
    const extMatch = pageText.match(/exterior(?:\s*color)?[:\s]+([A-Za-z\s]+?)(?:\n|,|$)/i);
    if (extMatch) exteriorColor = extMatch[1].trim();

    let interiorColor: string | undefined;
    const intMatch = pageText.match(/interior(?:\s*color)?[:\s]+([A-Za-z\s]+?)(?:\n|,|$)/i);
    if (intMatch) interiorColor = intMatch[1].trim();

    let transmission: string | undefined;
    if (/automatic|auto trans/i.test(pageText)) transmission = 'Automatic';
    else if (/manual|stick shift/i.test(pageText)) transmission = 'Manual';
    else if (/cvt/i.test(pageText)) transmission = 'CVT';

    let drivetrain: string | undefined;
    if (/\bAWD\b|all[\s-]?wheel/i.test(pageText)) drivetrain = 'AWD';
    else if (/\b4WD\b|four[\s-]?wheel|4x4/i.test(pageText)) drivetrain = '4WD';
    else if (/\bFWD\b|front[\s-]?wheel/i.test(pageText)) drivetrain = 'FWD';
    else if (/\bRWD\b|rear[\s-]?wheel/i.test(pageText)) drivetrain = 'RWD';

    let type = 'SUV';
    if (/sedan/i.test(pageText)) type = 'Sedan';
    else if (/truck|pickup|crew cab/i.test(pageText)) type = 'Truck';
    else if (/hatchback/i.test(pageText)) type = 'Hatchback';
    else if (/coupe/i.test(pageText)) type = 'Coupe';
    else if (/wagon/i.test(pageText)) type = 'Wagon';
    else if (/minivan|van/i.test(pageText)) type = 'Minivan';

    return {
      year,
      make,
      model,
      type,
      price,
      odometer,
      images: images.slice(0, 20),
      badges,
      location,
      dealership: dealershipName,
      dealershipId,
      dealerVdpUrl: vdpUrl,
      vin,
      stockNumber,
      carfaxUrl,
      exteriorColor,
      interiorColor,
      transmission,
      drivetrain,
    };
  }
}

export const zenrowsService = new ZenRowsScraperService();
