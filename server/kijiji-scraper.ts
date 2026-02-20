import puppeteer, { Browser, Page } from 'puppeteer';
import { storage } from './storage';
import type { InsertMarketListing } from '@shared/schema';
import { execSync } from 'child_process';

export interface KijijiSearchParams {
  make: string;
  model: string;
  yearMin?: number;
  yearMax?: number;
  postalCode?: string;
  radiusKm?: number;
  maxResults?: number;
}

export interface KijijiListing {
  externalId: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  price: number;
  mileage?: number;
  location: string;
  sellerName: string;
  listingType: 'dealer' | 'private';
  imageUrl?: string;
  listingUrl: string;
  postedDate?: Date;
  description?: string;
}

export class KijijiScraper {
  private browser: Browser | null = null;

  async initialize() {
    if (!this.browser) {
      let executablePath: string | undefined;
      
      try {
        executablePath = execSync('which chromium 2>/dev/null || which chromium-browser 2>/dev/null', { encoding: 'utf8' }).trim();
      } catch {
        try {
          executablePath = execSync('find /nix/store -name chromium -type f -path "*/bin/chromium" 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
        } catch {
          throw new Error('Chromium executable not found.');
        }
      }
      
      if (!executablePath) {
        throw new Error('Chromium executable not found in PATH or Nix store');
      }
      
      console.log(`[Kijiji] Using Chromium: ${executablePath}`);
      
      this.browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer'
        ]
      });
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private buildSearchUrl(params: KijijiSearchParams): string {
    const baseUrl = 'https://www.kijijiautos.ca/cars/';
    
    const makeSlug = params.make.toLowerCase().replace(/\s+/g, '-');
    const modelSlug = params.model.toLowerCase().replace(/\s+/g, '-');
    
    let url = `${baseUrl}${makeSlug}/${modelSlug}/`;
    
    const queryParams: string[] = [];
    
    if (params.yearMin) {
      queryParams.push(`ymin=${params.yearMin}`);
    }
    if (params.yearMax) {
      queryParams.push(`ymax=${params.yearMax}`);
    }
    if (params.radiusKm) {
      queryParams.push(`radius=${params.radiusKm}`);
    }
    if (params.postalCode) {
      queryParams.push(`address=${encodeURIComponent(params.postalCode)}`);
    }
    
    if (queryParams.length > 0) {
      url += '?' + queryParams.join('&');
    }
    
    return url;
  }

  async scrapeListings(params: KijijiSearchParams): Promise<KijijiListing[]> {
    await this.initialize();
    
    const listings: KijijiListing[] = [];
    const page = await this.browser!.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    try {
      const searchUrl = this.buildSearchUrl(params);
      console.log(`[Kijiji] Scraping: ${searchUrl}`);
      
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      
      await page.waitForSelector('[data-testid="srp-listing-card"], .listing-card, article', { timeout: 15000 }).catch(() => {
        console.log('[Kijiji] No listing cards found, page may have changed structure');
      });
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const rawListings = await page.evaluate((searchParams) => {
        const results: any[] = [];
        
        const cards = document.querySelectorAll('[data-testid="srp-listing-card"], .listing-card, article[data-qa="listing-item"], .search-result');
        
        cards.forEach((card) => {
          try {
            const titleEl = card.querySelector('h2, h3, [data-testid="listing-title"], .title');
            const priceEl = card.querySelector('[data-testid="listing-price"], .price, .amount');
            const linkEl = card.querySelector('a[href*="/cars/"]') as HTMLAnchorElement;
            const mileageEl = card.querySelector('[data-testid="listing-mileage"], .mileage, [class*="mileage"]');
            const locationEl = card.querySelector('[data-testid="listing-location"], .location, [class*="location"]');
            const imageEl = card.querySelector('img') as HTMLImageElement;
            const sellerEl = card.querySelector('[data-testid="dealer-name"], .dealer-name, [class*="dealer"]');
            
            const title = titleEl?.textContent?.trim() || '';
            const priceText = priceEl?.textContent?.trim() || '';
            const price = parseInt(priceText.replace(/[^0-9]/g, '')) || 0;
            
            if (!title || price === 0) return;
            
            const yearMatch = title.match(/^(\d{4})/);
            const year = yearMatch ? parseInt(yearMatch[1]) : 0;
            
            if (year < 2000 || year > 2030) return;
            
            const mileageText = mileageEl?.textContent?.trim() || '';
            const mileageMatch = mileageText.match(/(\d[\d,]*)\s*(km|miles?)/i);
            const mileage = mileageMatch ? parseInt(mileageMatch[1].replace(/,/g, '')) : undefined;
            
            const location = locationEl?.textContent?.trim() || 'Canada';
            const imageUrl = imageEl?.src || imageEl?.dataset.src;
            const listingUrl = linkEl?.href || '';
            const sellerName = sellerEl?.textContent?.trim() || '';
            
            const isDealer = sellerName.toLowerCase().includes('dealer') || 
                            card.querySelector('[data-testid="dealer-badge"], .dealer-badge') !== null;
            
            const urlParts = listingUrl.split('/');
            const externalId = urlParts[urlParts.length - 1] || `kijiji-${Date.now()}-${Math.random()}`;
            
            results.push({
              externalId,
              year,
              make: searchParams.make,
              model: searchParams.model,
              title,
              price,
              mileage,
              location,
              sellerName: sellerName || (isDealer ? 'Dealer' : 'Private Seller'),
              listingType: isDealer ? 'dealer' : 'private',
              imageUrl,
              listingUrl
            });
          } catch (e) {
            console.error('Error parsing Kijiji listing:', e);
          }
        });
        
        return results;
      }, { make: params.make, model: params.model });
      
      for (const raw of rawListings) {
        listings.push({
          externalId: raw.externalId,
          year: raw.year,
          make: params.make,
          model: params.model,
          trim: this.extractTrim(raw.title, params.model),
          price: raw.price,
          mileage: raw.mileage,
          location: raw.location,
          sellerName: raw.sellerName,
          listingType: raw.listingType,
          imageUrl: raw.imageUrl,
          listingUrl: raw.listingUrl,
          postedDate: new Date()
        });
      }
      
      console.log(`[Kijiji] Found ${listings.length} listings`);
      
    } catch (error) {
      console.error('[Kijiji] Scraping error:', error);
    } finally {
      await page.close();
    }
    
    const maxResults = params.maxResults || 50;
    return listings.slice(0, maxResults);
  }

  private extractTrim(title: string, model: string): string | undefined {
    const modelIndex = title.toLowerCase().indexOf(model.toLowerCase());
    if (modelIndex === -1) return undefined;
    
    const afterModel = title.substring(modelIndex + model.length).trim();
    const trimMatch = afterModel.match(/^([A-Za-z0-9\-\s]+)/);
    
    if (trimMatch && trimMatch[1].trim().length > 0) {
      return trimMatch[1].trim().substring(0, 50);
    }
    
    return undefined;
  }

  async saveListings(listings: KijijiListing[], dealershipId: number = 1): Promise<number> {
    let savedCount = 0;
    
    for (const listing of listings) {
      try {
        const marketListing: InsertMarketListing = {
          dealershipId,
          externalId: `kijiji-${listing.externalId}`,
          source: 'kijiji',
          listingType: listing.listingType,
          year: listing.year,
          make: listing.make,
          model: listing.model,
          trim: listing.trim || null,
          price: listing.price,
          mileage: listing.mileage || null,
          location: listing.location,
          postalCode: null,
          latitude: null,
          longitude: null,
          sellerName: listing.sellerName,
          imageUrl: listing.imageUrl || null,
          listingUrl: listing.listingUrl,
          postedDate: listing.postedDate || null,
          isActive: true
        };
        
        const existing = await storage.getMarketListings(dealershipId, {
          make: listing.make,
          model: listing.model
        });
        
        const alreadyExists = existing.listings.some(e => e.externalId === `kijiji-${listing.externalId}`);
        
        if (!alreadyExists) {
          await storage.createMarketListing(marketListing);
          savedCount++;
        }
      } catch (error) {
        console.error(`[Kijiji] Error saving listing ${listing.externalId}:`, error);
      }
    }
    
    console.log(`[Kijiji] Saved ${savedCount} new listings to database`);
    return savedCount;
  }

  async searchAndConvert(params: KijijiSearchParams): Promise<InsertMarketListing[]> {
    const listings = await this.scrapeListings(params);
    
    return listings.map(listing => ({
      dealershipId: 1,
      externalId: `kijiji-${listing.externalId}`,
      source: 'kijiji',
      listingType: listing.listingType,
      year: listing.year,
      make: listing.make,
      model: listing.model,
      trim: listing.trim || null,
      price: listing.price,
      mileage: listing.mileage || null,
      location: listing.location,
      postalCode: null,
      latitude: null,
      longitude: null,
      sellerName: listing.sellerName,
      imageUrl: listing.imageUrl || null,
      listingUrl: listing.listingUrl,
      postedDate: listing.postedDate || null,
      isActive: true
    }));
  }
}

export const kijijiScraper = new KijijiScraper();
