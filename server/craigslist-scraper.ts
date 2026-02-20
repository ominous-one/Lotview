import puppeteer, { Browser, Page } from 'puppeteer';
import { storage } from './storage';
import type { InsertMarketListing } from '@shared/schema';
import { execSync } from 'child_process';

export interface CraigslistSearchParams {
  make: string;
  model: string;
  yearMin?: number;
  yearMax?: number;
  city?: string;
  maxResults?: number;
}

export interface CraigslistListing {
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
}

const CANADIAN_CITIES = [
  { name: 'Vancouver', subdomain: 'vancouver' },
  { name: 'Victoria', subdomain: 'victoria' },
  { name: 'Calgary', subdomain: 'calgary' },
  { name: 'Edmonton', subdomain: 'edmonton' },
  { name: 'Toronto', subdomain: 'toronto' },
  { name: 'Ottawa', subdomain: 'ottawa' },
  { name: 'Montreal', subdomain: 'montreal' },
];

export class CraigslistScraper {
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
      
      console.log(`[Craigslist] Using Chromium: ${executablePath}`);
      
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

  private buildSearchUrl(params: CraigslistSearchParams, citySubdomain: string): string {
    const query = `${params.make} ${params.model}`;
    const encodedQuery = encodeURIComponent(query);
    
    let url = `https://${citySubdomain}.craigslist.org/search/cta?query=${encodedQuery}`;
    
    if (params.yearMin) {
      url += `&min_auto_year=${params.yearMin}`;
    }
    if (params.yearMax) {
      url += `&max_auto_year=${params.yearMax}`;
    }
    
    return url;
  }

  async scrapeListings(params: CraigslistSearchParams): Promise<CraigslistListing[]> {
    await this.initialize();
    
    const allListings: CraigslistListing[] = [];
    
    const citiesToSearch = params.city
      ? CANADIAN_CITIES.filter(c => c.name.toLowerCase() === params.city?.toLowerCase())
      : CANADIAN_CITIES.slice(0, 3);
    
    for (const city of citiesToSearch) {
      const page = await this.browser!.newPage();
      
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      try {
        const searchUrl = this.buildSearchUrl(params, city.subdomain);
        console.log(`[Craigslist] Scraping ${city.name}: ${searchUrl}`);
        
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        await page.waitForSelector('.cl-search-result, .result-row, li.cl-static-search-result', { timeout: 10000 }).catch(() => {
          console.log(`[Craigslist] No listings found for ${city.name}`);
        });
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const rawListings = await page.evaluate((searchParams, cityName) => {
          const results: any[] = [];
          
          const cards = document.querySelectorAll('.cl-search-result, .result-row, li.cl-static-search-result');
          
          cards.forEach((card, index) => {
            try {
              const titleEl = card.querySelector('.titlestring, .result-title, a.posting-title');
              const priceEl = card.querySelector('.priceinfo, .result-price, .price');
              const linkEl = card.querySelector('a[href*="/cta/"], a[href*="/cto/"]') as HTMLAnchorElement;
              const metaEl = card.querySelector('.meta, .result-meta');
              const imageEl = card.querySelector('img') as HTMLImageElement;
              const dateEl = card.querySelector('time, .result-date');
              
              const title = titleEl?.textContent?.trim() || '';
              const priceText = priceEl?.textContent?.trim() || '';
              const price = parseInt(priceText.replace(/[^0-9]/g, '')) || 0;
              
              if (!title || price === 0) return;
              
              const yearMatch = title.match(/(\d{4})/);
              const year = yearMatch ? parseInt(yearMatch[1]) : 0;
              
              if (year < 2000 || year > 2030) return;
              
              const metaText = metaEl?.textContent || '';
              const mileageMatch = metaText.match(/(\d[\d,]*)\s*(k|km|mi|miles?)/i);
              let mileage = mileageMatch ? parseInt(mileageMatch[1].replace(/,/g, '')) : undefined;
              
              if (mileageMatch && mileageMatch[2].toLowerCase().startsWith('mi')) {
                mileage = Math.round((mileage || 0) * 1.60934);
              }
              
              const listingUrl = linkEl?.href || '';
              const urlParts = listingUrl.split('/');
              const externalId = urlParts[urlParts.length - 1]?.replace('.html', '') || `cl-${index}`;
              
              const imageUrl = imageEl?.src || imageEl?.dataset.src;
              
              const dateAttr = dateEl?.getAttribute('datetime');
              const postedDate = dateAttr ? new Date(dateAttr).toISOString() : null;
              
              results.push({
                externalId,
                year,
                make: searchParams.make,
                model: searchParams.model,
                title,
                price,
                mileage,
                location: cityName,
                sellerName: 'Private Seller',
                listingType: 'private',
                imageUrl,
                listingUrl,
                postedDate
              });
            } catch (e) {
              console.error('Error parsing Craigslist listing:', e);
            }
          });
          
          return results;
        }, { make: params.make, model: params.model }, city.name);
        
        for (const raw of rawListings) {
          allListings.push({
            externalId: raw.externalId,
            year: raw.year,
            make: params.make,
            model: params.model,
            trim: this.extractTrim(raw.title, params.model),
            price: raw.price,
            mileage: raw.mileage,
            location: raw.location,
            sellerName: raw.sellerName,
            listingType: raw.listingType as 'dealer' | 'private',
            imageUrl: raw.imageUrl,
            listingUrl: raw.listingUrl,
            postedDate: raw.postedDate ? new Date(raw.postedDate) : undefined
          });
        }
        
        console.log(`[Craigslist] Found ${rawListings.length} listings in ${city.name}`);
        
      } catch (error) {
        console.error(`[Craigslist] Error scraping ${city.name}:`, error);
      } finally {
        await page.close();
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`[Craigslist] Total listings found: ${allListings.length}`);
    
    const maxResults = params.maxResults || 50;
    return allListings.slice(0, maxResults);
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

  async saveListings(listings: CraigslistListing[], dealershipId: number = 1): Promise<number> {
    let savedCount = 0;
    
    for (const listing of listings) {
      try {
        const marketListing: InsertMarketListing = {
          dealershipId,
          externalId: `craigslist-${listing.externalId}`,
          source: 'craigslist',
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
        
        const alreadyExists = existing.listings.some(e => e.externalId === `craigslist-${listing.externalId}`);
        
        if (!alreadyExists) {
          await storage.createMarketListing(marketListing);
          savedCount++;
        }
      } catch (error) {
        console.error(`[Craigslist] Error saving listing ${listing.externalId}:`, error);
      }
    }
    
    console.log(`[Craigslist] Saved ${savedCount} new listings to database`);
    return savedCount;
  }

  async searchAndConvert(params: CraigslistSearchParams): Promise<InsertMarketListing[]> {
    const listings = await this.scrapeListings(params);
    
    return listings.map(listing => ({
      dealershipId: 1,
      externalId: `craigslist-${listing.externalId}`,
      source: 'craigslist',
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

export const craigslistScraper = new CraigslistScraper();
