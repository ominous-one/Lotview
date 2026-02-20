/**
 * ULTIMATE VEHICLE SCRAPER - MAIN MODULE
 * =======================================
 * 
 * Production-grade scraper with:
 * - PRECISION image extraction (only actual vehicle photos)
 * - Maximum resolution image URLs
 * - VIN validation
 * - Quality scoring
 * 
 * Usage:
 *   npm install
 *   npx ts-node scraper-main.ts
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs/promises';

import { 
  extractVehicleImages, 
  validateImages,
  ExtractedImage,
  ExtractionResult 
} from './precision-image-extractor';

// Apply stealth plugin
puppeteerExtra.use(StealthPlugin());

// =============================================================================
// TYPES
// =============================================================================

export interface DealerConfig {
  name: string;
  inventoryUrl: string;
  domain: string;
}

export interface ScrapedVehicle {
  // Identifiers
  vin: string | null;
  stockNumber: string | null;
  
  // Vehicle Info
  year: number;
  make: string;
  model: string;
  trim: string;
  bodyType: string;
  
  // Pricing
  price: number | null;
  
  // Mileage
  odometer: number | null;
  odometerUnit: 'km' | 'mi';
  
  // IMAGES - The Main Event
  images: Array<{
    url: string;
    confidence: 'high' | 'medium' | 'low';
    matchesVin: boolean;
  }>;
  imageCount: number;
  imageQuality: 'excellent' | 'good' | 'fair' | 'poor';
  
  // Other
  description: string;
  badges: string[];
  vdpUrl: string;
  
  // Quality
  dataQualityScore: number;
}

// =============================================================================
// DATA EXTRACTION SCRIPT
// =============================================================================

function getDataExtractionScript(): string {
  return `(function() {
    const result = {
      vin: null,
      stockNumber: null,
      price: null,
      odometer: null,
      odometerUnit: 'km',
      year: null,
      make: null,
      model: null,
      trim: null,
      bodyType: null,
      description: '',
      pageText: ''
    };
    
    const pageText = document.body?.innerText || '';
    result.pageText = pageText.substring(0, 10000);
    
    // VIN
    const vinMatch = pageText.match(/VIN[:\\s#]*([A-HJ-NPR-Z0-9]{17})/i);
    if (vinMatch) result.vin = vinMatch[1].toUpperCase();
    
    // Also check data attributes
    const vinEl = document.querySelector('[data-vin]');
    if (!result.vin && vinEl) {
      const v = vinEl.getAttribute('data-vin');
      if (v && /^[A-HJ-NPR-Z0-9]{17}$/i.test(v)) result.vin = v.toUpperCase();
    }
    
    // Stock Number
    const stockMatch = pageText.match(/Stock[\\s#:]*([A-Z0-9-]+)/i);
    if (stockMatch) result.stockNumber = stockMatch[1];
    
    // Price (avoid payment amounts)
    const priceSelectors = [
      '.price-block__price--primary',
      '.price-block__price',
      '.vehicle-price',
      '[data-field="price"]',
      '[itemprop="price"]',
      '.selling-price'
    ];
    
    for (const sel of priceSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        // Check it's not in a payment context
        const text = el.textContent || '';
        const parent = el.parentElement?.textContent || '';
        if (/payment|weekly|monthly|finance/i.test(parent)) continue;
        
        const match = text.match(/\\$?\\s*([0-9,]+)/);
        if (match) {
          const val = parseInt(match[1].replace(/,/g, ''));
          if (val >= 2000 && val <= 500000) {
            result.price = val;
            break;
          }
        }
      }
    }
    
    // Odometer
    const odoMatch = pageText.match(/([0-9,]+)\\s*(km|kilometers?|mi|miles?)/i);
    if (odoMatch) {
      const val = parseInt(odoMatch[1].replace(/,/g, ''));
      if (val > 0 && val < 500000) {
        result.odometer = val;
        result.odometerUnit = /mi/i.test(odoMatch[2]) ? 'mi' : 'km';
      }
    }
    
    // Year/Make/Model from title
    const h1 = document.querySelector('h1')?.textContent || document.title || '';
    const ymmMatch = h1.match(/(\\d{4})\\s+([A-Za-z]+)\\s+([A-Za-z0-9]+)/);
    if (ymmMatch) {
      result.year = parseInt(ymmMatch[1]);
      result.make = ymmMatch[2];
      result.model = ymmMatch[3];
    }
    
    // Description
    const descEl = document.querySelector('[class*="description"], [itemprop="description"]');
    if (descEl) {
      result.description = (descEl.textContent || '').trim().substring(0, 2000);
    }
    
    return result;
  })()`;
}

// =============================================================================
// BADGE DETECTION
// =============================================================================

function detectBadges(text: string): string[] {
  const badges: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/\b(one owner|1 owner)\b/i, 'One Owner'],
    [/\b(no accidents?|accident[- ]free)\b/i, 'No Accidents'],
    [/\b(certified|cpo)\b/i, 'Certified Pre-Owned'],
    [/\b(low km|low mileage)\b/i, 'Low Kilometers'],
    [/\b(clean title)\b/i, 'Clean Title'],
    [/\b(warranty)\b/i, 'Warranty'],
    [/\b(navigation|nav)\b/i, 'Navigation'],
    [/\b(leather)\b/i, 'Leather Interior'],
    [/\b(sunroof|moonroof)\b/i, 'Sunroof'],
    [/\b(awd|4wd|all[- ]wheel)\b/i, 'AWD/4WD'],
  ];
  
  for (const [pattern, badge] of patterns) {
    if (pattern.test(text)) badges.push(badge);
  }
  
  return [...new Set(badges)];
}

function detectBodyType(text: string): string {
  const patterns: Array<[RegExp, string]> = [
    [/\bsedan\b/i, 'Sedan'],
    [/\b(suv|crossover)\b/i, 'SUV'],
    [/\b(truck|pickup)\b/i, 'Truck'],
    [/\bhatchback\b/i, 'Hatchback'],
    [/\bcoupe\b/i, 'Coupe'],
    [/\bwagon\b/i, 'Wagon'],
    [/\b(minivan|van)\b/i, 'Minivan'],
  ];
  
  for (const [pattern, type] of patterns) {
    if (pattern.test(text)) return type;
  }
  
  return 'SUV';
}

// =============================================================================
// MAIN SCRAPER CLASS
// =============================================================================

export class VehicleScraper {
  private browser: Browser | null = null;
  
  async init(): Promise<void> {
    this.browser = await puppeteerExtra.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080'
      ]
    });
  }
  
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
  
  private async createPage(): Promise<Page> {
    if (!this.browser) throw new Error('Browser not initialized');
    
    const page = await this.browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );
    
    return page;
  }
  
  /**
   * Scrape a single VDP page
   */
  async scrapeVDP(page: Page, vdpUrl: string): Promise<ScrapedVehicle | null> {
    try {
      // Navigate to VDP
      await page.goto(vdpUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 2000));
      
      // Check for Cloudflare
      const isCloudflare = await page.evaluate(() => 
        document.body?.textContent?.includes('Checking your browser')
      );
      
      if (isCloudflare) {
        console.log('    ⚠ Cloudflare detected, waiting...');
        await new Promise(r => setTimeout(r, 15000));
      }
      
      // Extract basic data first (we need VIN for image validation)
      const data = await page.evaluate(getDataExtractionScript()) as any;
      
      console.log(`    VIN: ${data.vin || 'N/A'}, Stock: ${data.stockNumber || 'N/A'}`);
      
      // PRECISION IMAGE EXTRACTION
      const imageResult = await extractVehicleImages(page, data.vin, data.stockNumber);
      
      // Validate images
      const { valid: validImages, confidence } = validateImages(
        imageResult.images,
        data.vin,
        data.stockNumber
      );
      
      console.log(`    Images: ${validImages.length} valid (confidence: ${confidence})`);
      
      // Build vehicle object
      const vehicle: ScrapedVehicle = {
        vin: data.vin,
        stockNumber: data.stockNumber,
        year: data.year || 0,
        make: data.make || '',
        model: data.model || '',
        trim: data.trim || 'Base',
        bodyType: detectBodyType(data.pageText),
        price: data.price,
        odometer: data.odometer,
        odometerUnit: data.odometerUnit,
        images: validImages.map(img => ({
          url: img.url,
          confidence: img.confidence,
          matchesVin: img.matchesVin
        })),
        imageCount: validImages.length,
        imageQuality: this.rateImageQuality(validImages.length),
        description: data.description,
        badges: detectBadges(data.pageText),
        vdpUrl,
        dataQualityScore: this.calculateQualityScore(data, validImages)
      };
      
      return vehicle;
      
    } catch (error) {
      console.error(`    ✗ Error: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  
  private rateImageQuality(count: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (count >= 20) return 'excellent';
    if (count >= 10) return 'good';
    if (count >= 5) return 'fair';
    return 'poor';
  }
  
  private calculateQualityScore(data: any, images: ExtractedImage[]): number {
    let score = 0;
    if (data.vin) score += 25;
    if (data.price) score += 25;
    if (data.odometer) score += 15;
    if (images.length >= 20) score += 20;
    else if (images.length >= 10) score += 15;
    else if (images.length >= 5) score += 10;
    if (data.description?.length > 100) score += 10;
    if (images.some(i => i.matchesVin)) score += 5;
    return Math.min(100, score);
  }
  
  /**
   * Scrape all vehicles from a dealer
   */
  async scrapeDealer(dealer: DealerConfig): Promise<ScrapedVehicle[]> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`SCRAPING: ${dealer.name}`);
    console.log(`${'='.repeat(60)}\n`);
    
    const vehicles: ScrapedVehicle[] = [];
    let page = await this.createPage();
    
    try {
      // Navigate to inventory
      console.log(`Loading inventory: ${dealer.inventoryUrl}`);
      await page.goto(dealer.inventoryUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      
      // Handle Cloudflare
      const isCloudflare = await page.evaluate(() => 
        document.body?.textContent?.includes('Checking your browser')
      );
      if (isCloudflare) {
        console.log('Cloudflare detected, waiting...');
        await new Promise(r => setTimeout(r, 15000));
      }
      
      // Scroll to load all vehicles
      console.log('Loading all vehicles...');
      let prevCount = 0;
      let stable = 0;
      
      for (let i = 0; i < 30; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(r => setTimeout(r, 2000));
        
        const count = await page.evaluate(() => 
          document.querySelectorAll('a[href*="/vehicles/2"]').length
        );
        
        if (count === prevCount) {
          stable++;
          if (stable >= 3) break;
        } else {
          stable = 0;
        }
        prevCount = count;
      }
      
      // Extract VDP URLs
      const vdpUrls = await page.evaluate((domain) => {
        const links = document.querySelectorAll('a[href*="/vehicles/2"]');
        const urls: string[] = [];
        const seen = new Set<string>();
        
        links.forEach(link => {
          const href = link.getAttribute('href');
          if (!href) return;
          
          // Match VDP pattern
          if (/\/vehicles\/\d{4}\/[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/\d+/i.test(href)) {
            const full = href.startsWith('http') ? href : 'https://' + domain + href;
            const base = full.split('?')[0];
            if (!seen.has(base)) {
              seen.add(base);
              urls.push(full);
            }
          }
        });
        
        return urls;
      }, dealer.domain);
      
      console.log(`Found ${vdpUrls.length} vehicles\n`);
      
      // Scrape each VDP
      const REFRESH_INTERVAL = 10;
      
      for (let i = 0; i < vdpUrls.length; i++) {
        const url = vdpUrls[i];
        
        // Extract label from URL
        const match = url.match(/\/vehicles\/(\d{4})\/([^\/]+)\/([^\/]+)\//);
        const label = match 
          ? `${match[1]} ${match[2]} ${match[3]}`.replace(/-/g, ' ')
          : `Vehicle ${i + 1}`;
        
        console.log(`[${i + 1}/${vdpUrls.length}] ${label}`);
        
        // Refresh page periodically
        if (i > 0 && i % REFRESH_INTERVAL === 0) {
          console.log('  🔄 Refreshing page...');
          const cookies = await page.cookies();
          await page.close();
          page = await this.createPage();
          await page.setCookie(...cookies);
        }
        
        const vehicle = await this.scrapeVDP(page, url);
        
        if (vehicle) {
          vehicles.push(vehicle);
          console.log(`    ✓ $${vehicle.price || 'N/A'} | ${vehicle.imageCount} images | Score: ${vehicle.dataQualityScore}/100`);
        }
        
        // Human-like delay
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
      }
      
    } finally {
      await page.close();
    }
    
    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('SCRAPE SUMMARY');
    console.log(`${'='.repeat(60)}`);
    console.log(`Total vehicles: ${vehicles.length}`);
    console.log(`With VIN: ${vehicles.filter(v => v.vin).length}`);
    console.log(`With price: ${vehicles.filter(v => v.price).length}`);
    console.log(`With 10+ images: ${vehicles.filter(v => v.imageCount >= 10).length}`);
    console.log(`With 20+ images: ${vehicles.filter(v => v.imageCount >= 20).length}`);
    
    const avgImages = vehicles.reduce((sum, v) => sum + v.imageCount, 0) / vehicles.length;
    const avgScore = vehicles.reduce((sum, v) => sum + v.dataQualityScore, 0) / vehicles.length;
    console.log(`Average images: ${avgImages.toFixed(1)}`);
    console.log(`Average quality: ${avgScore.toFixed(1)}/100`);
    
    return vehicles;
  }
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

async function main() {
  const scraper = new VehicleScraper();
  
  try {
    await scraper.init();
    
    const vehicles = await scraper.scrapeDealer({
      name: 'Olympic Hyundai Vancouver',
      inventoryUrl: 'https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used',
      domain: 'www.olympichyundaivancouver.com'
    });
    
    // Save results
    await fs.writeFile(
      'scraped-vehicles.json',
      JSON.stringify(vehicles, null, 2),
      'utf-8'
    );
    
    console.log('\n✓ Results saved to scraped-vehicles.json');
    
    // Show sample
    if (vehicles.length > 0) {
      console.log('\n=== SAMPLE VEHICLE ===\n');
      const sample = vehicles[0];
      console.log(`${sample.year} ${sample.make} ${sample.model}`);
      console.log(`VIN: ${sample.vin}`);
      console.log(`Price: $${sample.price?.toLocaleString()}`);
      console.log(`Odometer: ${sample.odometer?.toLocaleString()} ${sample.odometerUnit}`);
      console.log(`Images: ${sample.imageCount}`);
      console.log(`Quality Score: ${sample.dataQualityScore}/100`);
      
      if (sample.images.length > 0) {
        console.log('\nFirst 3 image URLs:');
        sample.images.slice(0, 3).forEach((img, i) => {
          console.log(`  ${i + 1}. [${img.confidence}] ${img.url.substring(0, 70)}...`);
        });
      }
    }
    
  } finally {
    await scraper.close();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { VehicleScraper };
