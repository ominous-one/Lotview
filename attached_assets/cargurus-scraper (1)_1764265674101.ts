/**
 * CarGurus Scraper
 * 
 * Scrapes enrichment data from CarGurus dealer pages including:
 * - Deal ratings (Great Deal, Good Deal, etc.)
 * - Market pricing comparison
 * - Additional photos
 * - VIN matching for dealer vehicles
 */

import { execSync } from 'child_process';
import puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';
import { DealerConfig } from './dealer-config';
import { randomDelay } from './browser-utils';

export interface CarGurusVehicle {
  vin: string | null;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  odometer: number;
  images: string[];
  dealRating: string | null;
  cargurusUrl: string;
  stockNumber: string | null;
}

/**
 * Get Chromium path
 */
function getChromiumPath(): string {
  try {
    return execSync('which chromium').toString().trim();
  } catch {
    return '/usr/bin/chromium';
  }
}

/**
 * Extract listing data from CarGurus VDP page
 */
async function extractCarGurusListing(
  page: Page,
  listingUrl: string
): Promise<CarGurusVehicle | null> {
  try {
    // Inject fetch interceptor to capture API data
    await page.evaluateOnNewDocument(() => {
      (window as any).__cargurusData = null;
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        const url = typeof args[0] === 'string' ? args[0] : 
                    args[0] instanceof URL ? args[0].toString() : 
                    (args[0] as Request).url;
        
        if (url.includes('listing') || url.includes('vehicle') || url.includes('detail')) {
          try {
            const clone = response.clone();
            const json = await clone.json();
            if (json && (json.listing || json.vin || json.dealerPrice)) {
              (window as any).__cargurusData = json;
            }
          } catch {}
        }
        return response;
      };
    });
    
    await page.goto(listingUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    
    // Try to get intercepted API data
    let listingData = await page.evaluate(() => (window as any).__cargurusData);
    
    // Fallback: try __NEXT_DATA__
    if (!listingData) {
      listingData = await page.evaluate(() => {
        try {
          const script = document.querySelector('script#__NEXT_DATA__');
          if (script?.textContent) {
            const data = JSON.parse(script.textContent);
            
            // Search common paths
            const paths = [
              data?.props?.pageProps?.listing,
              data?.props?.pageProps?.listingDetail,
              data?.props?.pageProps?.data?.listing,
            ];
            
            // Also check Apollo state
            const apollo = data?.props?.pageProps?.apolloState;
            if (apollo) {
              for (const key of Object.keys(apollo)) {
                const item = apollo[key];
                if (item?.vin || item?.dealerPrice || item?.photos) {
                  paths.push(item);
                }
              }
            }
            
            return paths.find(p => p && (p.vin || p.year));
          }
        } catch {}
        return null;
      });
    }
    
    // Extract from API data if available
    if (listingData) {
      const listing = listingData.listing || listingData.listingDetail || listingData;
      
      // Extract images
      const images: string[] = [];
      const photoSources = [
        listing.media?.photoGallery?.photos,
        listing.photos,
        listing.pictureUrls,
        listing.images
      ];
      
      for (const source of photoSources) {
        if (Array.isArray(source)) {
          for (const photo of source) {
            let imgUrl = typeof photo === 'string' ? photo : 
                         photo?.url || photo?.pictureUrl || '';
            
            if (imgUrl.includes('cargurus.com/images/forsale/')) {
              const clean = imgUrl.split('?')[0];
              const full = `${clean}?io=true&width=2048&height=1536&fit=bounds&format=jpg`;
              if (!images.includes(full)) {
                images.push(full);
              }
            }
          }
        }
      }
      
      return {
        vin: listing.vin || null,
        year: listing.year || parseInt(listing.modelYear),
        make: listing.make || listing.makeName,
        model: listing.model || listing.modelName,
        trim: listing.trim || listing.trimName || 'Base',
        price: listing.dealerPrice || listing.price || listing.askingPrice || 0,
        odometer: listing.mileage || listing.odometer || 0,
        images,
        dealRating: listing.dealRating || listing.dealBadge || null,
        cargurusUrl: listingUrl,
        stockNumber: listing.stockNumber || listing.stock || null
      };
    }
    
    // Fallback: DOM scraping
    const domData = await page.evaluate(() => {
      const text = document.body?.textContent || '';
      
      // Extract VIN
      const vinMatch = text.match(/VIN[:\s]*([A-HJ-NPR-Z0-9]{17})/i);
      
      // Extract price
      let price = 0;
      const priceEl = document.querySelector('[class*="price"]');
      if (priceEl) {
        const match = priceEl.textContent?.match(/\$?\s*([0-9,]+)/);
        if (match) price = parseInt(match[1].replace(/,/g, ''));
      }
      
      // Extract year/make/model from title
      const title = document.querySelector('h1')?.textContent || '';
      const ymm = title.match(/(\d{4})\s+([A-Za-z]+)\s+(.+)/);
      
      // Extract deal rating
      let dealRating = null;
      const ratingEl = document.querySelector('[class*="deal"]');
      if (ratingEl) {
        const ratingText = ratingEl.textContent || '';
        if (/great|good|fair|high|overpriced/i.test(ratingText)) {
          dealRating = ratingText.trim();
        }
      }
      
      // Extract images
      const images: string[] = [];
      document.querySelectorAll('img[src*="cargurus.com/images/forsale"]').forEach(img => {
        const src = (img as HTMLImageElement).src;
        if (src && !images.includes(src)) {
          images.push(src);
        }
      });
      
      return {
        vin: vinMatch ? vinMatch[1] : null,
        year: ymm ? parseInt(ymm[1]) : 0,
        make: ymm ? ymm[2] : '',
        model: ymm ? ymm[3] : '',
        price,
        dealRating,
        images
      };
    });
    
    if (domData.year && domData.make) {
      return {
        vin: domData.vin,
        year: domData.year,
        make: domData.make,
        model: domData.model,
        trim: 'Base',
        price: domData.price,
        odometer: 0,
        images: domData.images,
        dealRating: domData.dealRating,
        cargurusUrl: listingUrl,
        stockNumber: null
      };
    }
    
    return null;
    
  } catch (error) {
    console.log(`    ✗ Error extracting listing: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Scrape CarGurus dealer page
 */
export async function scrapeCarGurusDealerPage(
  dealer: DealerConfig
): Promise<CarGurusVehicle[]> {
  if (!dealer.cargurus) {
    console.log(`  No CarGurus config for ${dealer.name}, skipping`);
    return [];
  }
  
  console.log(`\n  Scraping CarGurus for ${dealer.name}...`);
  console.log(`  URL: ${dealer.cargurus.dealerPageUrl}`);
  
  const chromiumPath = getChromiumPath();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromiumPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  
  const vehicles: CarGurusVehicle[] = [];
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    await page.goto(dealer.cargurus.dealerPageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for React to render
    console.log(`    Waiting for listings to load...`);
    try {
      await page.waitForFunction(
        () => {
          const text = document.body?.textContent || '';
          return text.includes('$') && text.includes('km') && /\d{4}\s+[A-Z]/i.test(text);
        },
        { timeout: 20000 }
      );
      console.log(`    ✓ Listings loaded`);
    } catch {
      console.log(`    ⚠ Timeout waiting for listings`);
      await browser.close();
      return vehicles;
    }
    
    // Scroll to load all listings
    let prevHeight = 0;
    for (let i = 0; i < 10; i++) {
      const height = await page.evaluate(() => document.body.scrollHeight);
      if (height === prevHeight) break;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 1500));
      prevHeight = height;
    }
    
    // Extract listing URLs
    const listingUrls = await page.evaluate(() => {
      const urls: string[] = [];
      const links = document.querySelectorAll('a[href*="listing="]');
      
      links.forEach(link => {
        const href = link.getAttribute('href') || '';
        const match = href.match(/listing=(\d+)/);
        if (match) {
          const url = `https://www.cargurus.ca/Cars/link/${match[1]}`;
          if (!urls.includes(url)) urls.push(url);
        }
      });
      
      return urls;
    });
    
    console.log(`    Found ${listingUrls.length} listings`);
    
    // IMPORTANT: Reuse a single page for all VDP scraping to prevent connection errors
    // Close the listing page and create a fresh one for VDPs
    await page.close();
    const vdpPage = await browser.newPage();
    await vdpPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    
    let successCount = 0;
    const REFRESH_INTERVAL = 15;
    
    for (let i = 0; i < listingUrls.length; i++) {
      const url = listingUrls[i];
      console.log(`    [${i + 1}/${listingUrls.length}] Scraping ${url.split('/').pop()}`);
      
      // Refresh page periodically
      if (i > 0 && i % REFRESH_INTERVAL === 0) {
        console.log(`      🔄 Refreshing page...`);
        await vdpPage.goto('about:blank');
        await new Promise(r => setTimeout(r, 500));
      }
      
      try {
        const vehicle = await extractCarGurusListing(vdpPage, url);
        if (vehicle) {
          vehicles.push(vehicle);
          successCount++;
          console.log(`      ✓ ${vehicle.year} ${vehicle.make} ${vehicle.model} - ${vehicle.dealRating || 'No rating'}`);
        }
      } catch (error) {
        console.log(`      ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      await randomDelay(800, 1200);
    }
    
    await vdpPage.close();
    console.log(`    ✓ Scraped ${successCount}/${listingUrls.length} vehicles`);
    
  } finally {
    await browser.close();
  }
  
  return vehicles;
}

/**
 * Match CarGurus vehicles to dealer vehicles by VIN
 */
export function matchCarGurusToDealer<T extends { vin: string | null; year: number; make: string; model: string }>(
  dealerVehicles: T[],
  cargurusVehicles: CarGurusVehicle[]
): Map<string, { dealer: T; cargurus: CarGurusVehicle }> {
  const matches = new Map<string, { dealer: T; cargurus: CarGurusVehicle }>();
  
  // Create VIN lookup
  const cgByVin = new Map<string, CarGurusVehicle>();
  for (const cg of cargurusVehicles) {
    if (cg.vin) {
      cgByVin.set(cg.vin.toUpperCase(), cg);
    }
  }
  
  // Match by VIN (primary)
  for (const dealer of dealerVehicles) {
    if (dealer.vin) {
      const vinUpper = dealer.vin.toUpperCase();
      const cgMatch = cgByVin.get(vinUpper);
      if (cgMatch) {
        matches.set(vinUpper, { dealer, cargurus: cgMatch });
      }
    }
  }
  
  console.log(`  VIN matching: ${matches.size}/${dealerVehicles.length} vehicles matched`);
  
  return matches;
}

/**
 * Enrich dealer vehicles with CarGurus data
 */
export function enrichWithCarGurusData<T extends { 
  vin: string | null; 
  year: number; 
  make: string; 
  model: string;
  price: number | null;
  odometer: number | null;
  images: string[];
  dealRating?: string | null;
  cargurusPrice?: number | null;
  cargurusUrl?: string | null;
}>(
  dealerVehicles: T[],
  cargurusVehicles: CarGurusVehicle[]
): T[] {
  const matches = matchCarGurusToDealer(dealerVehicles, cargurusVehicles);
  
  return dealerVehicles.map(vehicle => {
    if (!vehicle.vin) return vehicle;
    
    const match = matches.get(vehicle.vin.toUpperCase());
    if (!match) return vehicle;
    
    const cg = match.cargurus;
    const enriched = { ...vehicle };
    
    // Add CarGurus-specific data
    enriched.dealRating = cg.dealRating;
    enriched.cargurusPrice = cg.price;
    enriched.cargurusUrl = cg.cargurusUrl;
    
    // Use CarGurus price as fallback if dealer price missing
    if (!enriched.price && cg.price > 0) {
      enriched.price = cg.price;
      console.log(`    ⚠ Using CG price for ${vehicle.year} ${vehicle.make} ${vehicle.model}: $${cg.price}`);
    }
    
    // Use CarGurus odometer as fallback
    if (!enriched.odometer && cg.odometer > 0) {
      enriched.odometer = cg.odometer;
      console.log(`    ⚠ Using CG odometer for ${vehicle.year} ${vehicle.make} ${vehicle.model}: ${cg.odometer}km`);
    }
    
    // Merge images (avoid duplicates)
    if (cg.images.length > 0) {
      const existingNormalized = new Set(enriched.images.map(url => url.split('?')[0]));
      const newImages = cg.images.filter(url => !existingNormalized.has(url.split('?')[0]));
      
      if (newImages.length > 0) {
        enriched.images = [...enriched.images, ...newImages];
        console.log(`    ⚠ Added ${newImages.length} CG images for ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
      }
    }
    
    return enriched;
  });
}
