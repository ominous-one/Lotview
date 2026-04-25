import puppeteer, { Browser, Page } from 'puppeteer';
import { storage } from './storage';
import type { DealershipApiKeys } from '@shared/schema';

export interface BrowserlessConfig {
  apiKey: string;
  endpoint?: string;
}

export interface BrowserlessScrapeResult {
  success: boolean;
  vehicles: any[];
  error?: string;
}

const DEFAULT_ENDPOINT = 'wss://chrome.browserless.io';

export class BrowserlessService {
  private apiKey: string;
  private endpoint: string;

  constructor(config: BrowserlessConfig) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint || DEFAULT_ENDPOINT;
  }

  private getConnectionUrl(): string {
    return `${this.endpoint}?token=${this.apiKey}`;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const browser = await puppeteer.connect({
        browserWSEndpoint: this.getConnectionUrl(),
      });

      const page = await browser.newPage();
      await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
      const title = await page.title();
      await browser.close();

      return {
        success: true,
        message: `Connected to Browserless. Test page title: ${title}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async scrapeInventoryUrl(
    inventoryUrl: string,
    options: { timeout?: number; maxVehicles?: number } = {}
  ): Promise<BrowserlessScrapeResult> {
    const { timeout = 60000, maxVehicles = 200 } = options;
    let browser: Browser | null = null;

    try {
      console.log(`[Browserless] Connecting to cloud browser...`);
      browser = await puppeteer.connect({
        browserWSEndpoint: this.getConnectionUrl(),
      });

      const page = await browser.newPage();
      
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      console.log(`[Browserless] Navigating to ${inventoryUrl}...`);
      await page.goto(inventoryUrl, {
        waitUntil: 'networkidle2',
        timeout,
      });

      console.log(`[Browserless] Waiting for vehicle listings...`);
      await page.waitForSelector('a[href*="/vehicles/"]', { timeout: 30000 }).catch(() => {
        console.log('[Browserless] No vehicle links found with standard selector, trying alternatives...');
      });

      console.log(`[Browserless] Scrolling to load lazy content...`);
      let previousCount = 0;
      let currentCount = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 20;

      do {
        previousCount = currentCount;
        currentCount = await page.evaluate(() => {
          return document.querySelectorAll('a[href*="/vehicles/"]').length;
        });

        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(resolve => setTimeout(resolve, 1500));
        scrollAttempts++;
        
        if (currentCount >= maxVehicles) break;
      } while (currentCount > previousCount && scrollAttempts < maxScrollAttempts);

      console.log(`[Browserless] Found ${currentCount} vehicle links after ${scrollAttempts} scrolls`);

      const vehicles = await page.evaluate(() => {
        const vehicleData: any[] = [];
        const links = Array.from(document.querySelectorAll('a[href*="/vehicles/"]'));
        const processedUrls = new Set<string>();

        links.forEach(link => {
          const href = link.getAttribute('href');
          if (!href) return;

          const match = href.match(/\/vehicles\/(\d{4})\/([a-z-]+)\/([a-z0-9-]+)\//);
          if (!match) return;

          if (processedUrls.has(href)) return;
          processedUrls.add(href);

          const [, yearStr, makeSlug, modelSlug] = match;
          const card = link.closest('.vehicle-card, .vehicle-item, .product-item, article, .item, .listing') || link;
          const cardText = card.textContent || '';

          const year = parseInt(yearStr);
          const make = makeSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          const model = modelSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

          let price = 0;
          const priceElem = card.querySelector('.price, .dealer-price, [class*="price"]');
          if (priceElem) {
            const priceMatch = priceElem.textContent?.match(/\$([0-9,]+)/);
            if (priceMatch) price = parseInt(priceMatch[1].replace(/,/g, ''));
          }

          let odometer = 0;
          const odometerMatch = cardText.match(/(\d+[,\d]*)\s*km/i);
          if (odometerMatch) odometer = parseInt(odometerMatch[1].replace(/,/g, ''));

          const img = card.querySelector('img');
          const primaryImage = img?.src || img?.getAttribute('data-src') || '';
          
          // Try to get all images on the card (some dealers show multiple thumbnails)
          const allImages: string[] = [];
          const imgElements = card.querySelectorAll('img');
          imgElements.forEach((imgEl: Element) => {
            const src = (imgEl as HTMLImageElement).src || imgEl.getAttribute('data-src');
            if (src && src.startsWith('http') && !src.includes('placeholder') && !src.includes('no-image')) {
              allImages.push(src);
            }
          });

          const detailUrl = href.startsWith('http') ? href : `${window.location.origin}${href}`;
          
          // Try to extract stock number from card text
          let stockNumber: string | null = null;
          const stockMatch = cardText.match(/stock[#:\s]*([A-Z0-9-]+)/i);
          if (stockMatch) stockNumber = stockMatch[1];

          vehicleData.push({
            year,
            make,
            model,
            price,
            odometer,
            primaryImage,
            images: allImages,
            detailUrl,
            cardText: cardText.substring(0, 500),
            stockNumber,
          });
        });

        return vehicleData;
      });

      console.log(`[Browserless] Extracted ${vehicles.length} vehicles`);
      await browser.close();

      return {
        success: true,
        vehicles,
      };
    } catch (error) {
      console.error('[Browserless] Scrape error:', error);
      if (browser) {
        try { await browser.close(); } catch {}
      }
      return {
        success: false,
        vehicles: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

const serviceCache = new Map<number, BrowserlessService>();

export async function getBrowserlessServiceForDealership(
  dealershipId: number
): Promise<BrowserlessService | null> {
  if (serviceCache.has(dealershipId)) {
    return serviceCache.get(dealershipId)!;
  }

  try {
    const apiKeys = await storage.getDealershipApiKeys(dealershipId);
    if (apiKeys?.browserlessApiKey) {
      const service = new BrowserlessService({ apiKey: apiKeys.browserlessApiKey });
      serviceCache.set(dealershipId, service);
      console.log(`[Browserless] Service initialized for dealership ${dealershipId}`);
      return service;
    }
    return null;
  } catch (error) {
    console.error(`[Browserless] Error loading API key for dealership ${dealershipId}:`, error);
    return null;
  }
}

let globalBrowserlessService: BrowserlessService | null = null;

export function getGlobalBrowserlessService(): BrowserlessService | null {
  if (!globalBrowserlessService) {
    const apiKey = process.env.BROWSERLESS_API_KEY;
    if (apiKey) {
      globalBrowserlessService = new BrowserlessService({ apiKey });
      console.log('[Browserless] Global service initialized from env');
    }
  }
  return globalBrowserlessService;
}

export function clearBrowserlessCache(dealershipId?: number): void {
  if (dealershipId) {
    serviceCache.delete(dealershipId);
  } else {
    serviceCache.clear();
    globalBrowserlessService = null;
  }
}
