import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import { sql, eq, and, inArray, lt, isNull, or } from 'drizzle-orm';
import { db } from './db';
import { storage } from './storage';
import { vehicles, vehicleViews, chatConversations } from '@shared/schema';
import { scrapeAllCarGurusDealers } from './cargurus-scraper';
import { generateVehicleDescription } from './openai';
import { scrapeAllDealerListings, scrapeDealerListingsWithCallback, scrapeDealerListingsCheckpointed, type DealerVehicleListing } from './dealer-listing-scraper';
import { matchCarGurusToDealer } from './vehicle-matcher';

// Upsert a single vehicle by VIN (or stockNumber if VIN is null)
// This enables incremental saving - each vehicle is saved immediately after scraping
export async function upsertVehicleByVin(vehicleData: ScrapedVehicle): Promise<{ action: 'inserted' | 'updated', id: number }> {
  const now = new Date();
  
  // Build the vehicle record
  const vehicleRecord = {
    dealershipId: vehicleData.dealershipId,
    year: vehicleData.year,
    make: vehicleData.make,
    model: vehicleData.model,
    trim: vehicleData.trim,
    type: vehicleData.type,
    price: vehicleData.price || 0,
    odometer: vehicleData.odometer || 0,
    images: vehicleData.images,
    badges: vehicleData.badges,
    location: vehicleData.location,
    dealership: vehicleData.dealership,
    description: vehicleData.description || `${vehicleData.year} ${vehicleData.make} ${vehicleData.model} ${vehicleData.trim}`.trim(),
    fullPageContent: vehicleData.fullPageContent || null,
    vin: vehicleData.vin || null,
    stockNumber: vehicleData.stockNumber || null,
    cargurusPrice: vehicleData.cargurusPrice || null,
    cargurusUrl: vehicleData.cargurusUrl || null,
    dealRating: vehicleData.dealRating || null,
    carfaxUrl: vehicleData.carfaxUrl || null,
    dealerVdpUrl: vehicleData.dealerVdpUrl || null,
    lastScrapedAt: now,
  };
  
  // Find existing vehicle by VIN (preferred) or by year/make/model/dealershipId combo
  let existingId: number | null = null;
  
  if (vehicleData.vin) {
    const existing = await db.select({ id: vehicles.id })
      .from(vehicles)
      .where(and(
        eq(vehicles.vin, vehicleData.vin),
        eq(vehicles.dealershipId, vehicleData.dealershipId)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      existingId = existing[0].id;
    }
  }
  
  // Fallback: match by year/make/model/dealershipId (ignore trim - it can vary between scrapes)
  if (!existingId) {
    const existing = await db.select({ id: vehicles.id })
      .from(vehicles)
      .where(and(
        eq(vehicles.year, vehicleData.year),
        eq(vehicles.make, vehicleData.make),
        eq(vehicles.model, vehicleData.model),
        eq(vehicles.dealershipId, vehicleData.dealershipId)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      existingId = existing[0].id;
    }
  }
  
  if (existingId) {
    // Update existing vehicle
    await db.update(vehicles)
      .set(vehicleRecord)
      .where(eq(vehicles.id, existingId));
    return { action: 'updated', id: existingId };
  } else {
    // Insert new vehicle
    const result = await db.insert(vehicles)
      .values(vehicleRecord)
      .returning({ id: vehicles.id });
    return { action: 'inserted', id: result[0].id };
  }
}

export interface ScrapedVehicle {
  year: number;
  make: string;
  model: string;
  trim: string;
  type: string;
  price: number | null;  // Nullable to support fallback logic
  odometer: number | null;  // Nullable to support fallback logic
  images: string[];
  badges: string[];
  location: string;
  dealership: string;
  dealershipId: number;
  description: string;
  fullPageContent?: string;
  vin?: string;
  stockNumber?: string;
  carfaxUrl?: string;
  dealerVdpUrl?: string;
  dealRating?: string;
  cargurusPrice?: number;
  cargurusUrl?: string;
}

async function resolveTargetDealershipIds(dealershipId?: number): Promise<number[]> {
  if (typeof dealershipId === 'number' && Number.isFinite(dealershipId)) {
    return [dealershipId];
  }
  try {
    const dealerships = await storage.getAllDealerships();
    return dealerships.filter(d => d.isActive).map(d => d.id);
  } catch (error) {
    console.error('[Scraper] Failed to load dealerships for scraping:', error);
    return [];
  }
}

// Individual dealership URLs (better data quality - includes Carfax links and full image galleries)
const DEALERSHIP_URLS = [
  {
    url: 'https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used',
    name: 'Olympic Hyundai Vancouver',
    dealershipId: 1,
    location: 'Vancouver'
  },
  {
    url: 'https://www.boundaryhyundai.com/vehicles/used/?st=price,desc&view=grid&sc=used',
    name: 'Boundary Hyundai Vancouver',
    dealershipId: 2,
    location: 'Burnaby'
  },
  {
    url: 'https://www.kiavancouver.com/vehicles/used/?st=year,desc&view=grid&sc=used',
    name: 'Kia Vancouver',
    dealershipId: 3,
    location: 'Vancouver'
  }
];

const BADGE_KEYWORDS = {
  oneOwner: ['one owner', '1 owner', 'single owner'],
  noAccidents: ['no accidents', 'accident free', 'clean history', 'accident-free'],
  cleanTitle: ['clean title', 'clear title'],
  certifiedPreOwned: ['certified', 'cpo', 'certified pre-owned'],
  lowKm: ['low km', 'low kilometers', 'low mileage', 'low km\'s'],
  managerSpecial: ['manager special', 'manager\'s special'],
  newArrival: ['new arrival', 'just arrived'],
  fuelEfficient: ['fuel efficient', 'great fuel economy'],
  fullyLoaded: ['fully loaded', 'loaded'],
};

// Check if vehicle has low km based on 12,000 km per year threshold
function isLowKilometers(year: number, odometer: number): boolean {
  const currentYear = new Date().getFullYear();
  const vehicleAge = Math.max(1, currentYear - year); // At least 1 year old
  const expectedMaxKm = vehicleAge * 12000; // 12,000 km per year average
  return odometer > 0 && odometer <= expectedMaxKm;
}

function detectBadges(text: string, year?: number, odometer?: number): string[] {
  const badges: string[] = [];
  const lowerText = text.toLowerCase();

  if (BADGE_KEYWORDS.oneOwner.some(keyword => lowerText.includes(keyword))) {
    badges.push('One Owner');
  }
  if (BADGE_KEYWORDS.noAccidents.some(keyword => lowerText.includes(keyword))) {
    badges.push('No Accidents');
  }
  if (BADGE_KEYWORDS.cleanTitle.some(keyword => lowerText.includes(keyword))) {
    badges.push('Clean Title');
  }
  if (BADGE_KEYWORDS.certifiedPreOwned.some(keyword => lowerText.includes(keyword))) {
    badges.push('Certified Pre-Owned');
  }
  // Low Kilometers: Calculate based on 12,000 km/year if year and odometer provided
  // Otherwise fall back to keyword detection
  if (year && odometer && isLowKilometers(year, odometer)) {
    badges.push('Low Kilometers');
  } else if (BADGE_KEYWORDS.lowKm.some(keyword => lowerText.includes(keyword))) {
    // Only use keyword detection if we don't have year/odometer data
    if (!year || !odometer) {
      badges.push('Low Kilometers');
    }
  }
  if (BADGE_KEYWORDS.managerSpecial.some(keyword => lowerText.includes(keyword))) {
    badges.push('Manager Special');
  }
  if (BADGE_KEYWORDS.newArrival.some(keyword => lowerText.includes(keyword))) {
    badges.push('New Arrival');
  }
  if (BADGE_KEYWORDS.fuelEfficient.some(keyword => lowerText.includes(keyword))) {
    badges.push('Fuel Efficient');
  }
  if (BADGE_KEYWORDS.fullyLoaded.some(keyword => lowerText.includes(keyword))) {
    badges.push('Fully Loaded');
  }

  return badges;
}

function determineBodyType(bodyStyle: string): string {
  const lowerBody = bodyStyle.toLowerCase();
  
  if (lowerBody.includes('sedan')) return 'Sedan';
  if (lowerBody.includes('suv')) return 'SUV';
  if (lowerBody.includes('truck') || lowerBody.includes('crew cab')) return 'Truck';
  if (lowerBody.includes('hatchback')) return 'Hatchback';
  if (lowerBody.includes('coupe') || lowerBody.includes('convertible')) return 'Coupe';
  if (lowerBody.includes('wagon')) return 'Wagon';
  if (lowerBody.includes('minivan') || lowerBody.includes('van')) return 'Minivan';
  
  return 'SUV'; // Default
}

async function scrapeInventoryPage(inventoryUrl: string, dealershipName: string, dealershipId: number, location: string): Promise<ScrapedVehicle[]> {
  console.log(`Launching browser for ${dealershipName}...`);
  
  // Find chromium executable
  let chromiumPath = '';
  try {
    chromiumPath = execSync('which chromium').toString().trim();
  } catch {
    chromiumPath = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
  }
  
  console.log(`Using Chromium at: ${chromiumPath}`);
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromiumPath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-software-rasterizer'
    ]
  });
  
  try {
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log(`Navigating to ${dealershipName} inventory page...`);
    await page.goto(inventoryUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    console.log('Waiting for vehicle listings to load...');
    // Wait for vehicle cards to appear
    await page.waitForSelector('a[href*="/vehicles/2"]', { timeout: 30000 });
    
    console.log('Scrolling to load all vehicles...');
    // Scroll down multiple times to trigger lazy loading
    let previousCount = 0;
    let currentCount = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 30;
    
    do {
      // Get current count of vehicles
      previousCount = currentCount;
      currentCount = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="/vehicles/2"]').length;
      });
      
      // Scroll to bottom
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      // Wait for new content to load
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      scrollAttempts++;
      console.log(`Scroll ${scrollAttempts}: Found ${currentCount} vehicle links...`);
      
    } while (currentCount > previousCount && scrollAttempts < maxScrollAttempts);
    
    console.log(`Finished scrolling. Found ${currentCount} total vehicle links.`);
    
    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('Extracting vehicle data...');
    
    const vehicles = await page.evaluate((dealershipName, dealershipId, location) => {
      const vehicleData: any[] = [];
      
      // Find all links that contain vehicle detail pages
      const links = Array.from(document.querySelectorAll('a[href*="/vehicles/2"]'));
      const processedUrls = new Set<string>();
      
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        
        // Filter for actual vehicle detail pages (year/make/model pattern)
        const match = href.match(/\/vehicles\/(\d{4})\/([a-z-]+)\/([a-z0-9-]+)\//);
        if (!match) return;
        
        // Skip duplicates
        if (processedUrls.has(href)) return;
        processedUrls.add(href);
        
        const [, yearStr, makeSlug, modelSlug] = match;
        
        // Get the containing card/element
        const card = link.closest('.vehicle-card, .vehicle-item, .product-item, article, .item, .listing') || link;
        
        const cardText = card.textContent || '';
        const heading = (card.querySelector('h1, h2, h3, h4, h5, .title, .heading') as HTMLElement)?.textContent || '';
        
        // Extract year, make, model from URL
        const year = parseInt(yearStr);
        const make = makeSlug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const model = modelSlug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        
        // Extract trim from heading
        let trim = 'Base';
        const headingParts = heading.split('|')[0].trim().split(' ');
        if (headingParts.length > 3) {
          trim = headingParts.slice(3).join(' ').trim();
        }
        if (!trim || trim.length === 0) trim = 'Base';
        
        // Extract price
        let price = 0;
        const priceElem = card.querySelector('.price, .dealer-price, [class*="price"]');
        if (priceElem) {
          const priceText = priceElem.textContent || '';
          const priceMatch = priceText.match(/\$([0-9,]+)/);
          if (priceMatch) {
            price = parseInt(priceMatch[1].replace(/,/g, ''));
          }
        }
        
        // Extract kilometers with multiple patterns
        let odometer = 0;
        // Try multiple patterns for odometer extraction
        const odometerPatterns = [
          /(\d+[,\d]*)\s*km/i,                    // Standard: "12,345 km"
          /Odometer[:\s]+(\d+[,\d]*)/i,           // Label format: "Odometer: 12345"
          /(\d+[,\d]*)\s*kilometers/i,            // Full word
          /mileage[:\s]+(\d+[,\d]*)/i,            // Mileage label
          /km[:\s]+(\d+[,\d]*)/i,                 // KM label first
        ];
        
        for (const pattern of odometerPatterns) {
          const match = cardText.match(pattern);
          if (match) {
            odometer = parseInt(match[1].replace(/,/g, ''));
            break;
          }
        }
        
        // Also try from odometer element with data attributes
        const odometerEl = card.querySelector('[data-field="odometer"], [data-field="mileage"], .odometer, .mileage');
        if (odometerEl && odometer === 0) {
          const odometerText = odometerEl.textContent || odometerEl.getAttribute('data-value') || '';
          const odometerMatch = odometerText.match(/(\d+[,\d]*)/);
          if (odometerMatch) {
            odometer = parseInt(odometerMatch[1].replace(/,/g, ''));
          }
        }
        
        // Extract body style
        let bodyStyle = 'SUV';
        const bodyStyleMatch = cardText.match(/Body Style:\s*([^\n]+)/i);
        if (bodyStyleMatch) {
          bodyStyle = bodyStyleMatch[1].trim();
        }
        
        // Extract primary image
        const img = card.querySelector('img');
        let primaryImage = 'https://via.placeholder.com/400x300?text=No+Image';
        if (img) {
          primaryImage = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || primaryImage;
        }
        
        // Get the detail page URL (relative URLs need the domain from current location)
        const detailUrl = href.startsWith('http') ? href : `${window.location.origin}${href}`;
        
        vehicleData.push({
          year,
          make,
          model,
          trim,
          bodyStyle,
          price,
          odometer,
          primaryImage,
          detailUrl,
          location: location,
          dealership: dealershipName,
          dealershipId: dealershipId,
          cardText: cardText.substring(0, 500), // For badge detection
          heading
        });
      });
      
      return vehicleData;
    }, dealershipName, dealershipId, location);
    
    console.log(`Extracted ${vehicles.length} vehicles from page`);
    console.log('Fetching detailed information for each vehicle...');
    
    // Process each vehicle and fetch detail page
    const scrapedVehicles: ScrapedVehicle[] = [];
    
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      console.log(`[${i + 1}/${vehicles.length}] Processing ${v.year} ${v.make} ${v.model}...`);
      
      // Create a new page for each vehicle to avoid detached frame issues
      let detailPage = page;
      if (i > 0) {
        try {
          detailPage = await browser.newPage();
        } catch (e) {
          console.log('  Could not create new page, reusing existing');
        }
      }
      
      try {
        // Navigate to detail page
        await detailPage.goto(v.detailUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Wait for the gallery and spec data to load (short timeout)
        try {
          await detailPage.waitForSelector('[data-gallery]', { timeout: 2000 });
        } catch (e) {
          // Silently use fallback extraction
        }
        
        // Extract detailed information
        const detailData = await detailPage.evaluate(() => {
          // Extract odometer from detail page specs
          let odometer = 0;
          const odometerPatterns = [
            /(\d+[,\d]*)\s*km/i,
            /Odometer[:\s]+(\d+[,\d]*)/i,
            /(\d+[,\d]*)\s*kilometers/i,
            /mileage[:\s]+(\d+[,\d]*)/i,
          ];
          
          // Try to find odometer in the full page text
          const pageText = document.body.textContent || '';
          for (const pattern of odometerPatterns) {
            const match = pageText.match(pattern);
            if (match) {
              odometer = parseInt(match[1].replace(/,/g, ''));
              break;
            }
          }
          
          // Also try from odometer element with data attributes
          if (odometer === 0) {
            const odometerEl = document.querySelector('[data-field="odometer"], [data-field="mileage"], .odometer, .mileage, .km');
            if (odometerEl) {
              const odometerText = odometerEl.textContent || odometerEl.getAttribute('data-value') || '';
              const odometerMatch = odometerText.match(/(\d+[,\d]*)/);
              if (odometerMatch) {
                odometer = parseInt(odometerMatch[1].replace(/,/g, ''));
              }
            }
          }
          
          // Extract all images - ONLY clean vehicle photos from thumbnail gallery
          const images: string[] = [];
          
          // Strategy 1: Target thumbnail gallery specifically (most reliable)
          // Look for thumbnail containers - these are the clickable small images below the main photo
          const thumbnailSelectors = [
            '.thumbnails img',
            '.thumb img', 
            '.thumbnail img',
            '[class*="thumb"] img',
            '[id*="thumb"] img',
            '.gallery-thumbs img',
            '.image-thumbs img',
            '[data-thumb] img',
            '.carousel-indicators img',
            '.slider-nav img',
            'a[data-slide] img',
            'a[href*="#photo"] img'
          ];
          
          for (let s = 0; s < thumbnailSelectors.length; s++) {
            const thumbs = document.querySelectorAll(thumbnailSelectors[s]);
            if (thumbs.length > 0) {
              for (let t = 0; t < thumbs.length; t++) {
                const img = thumbs[t] as HTMLImageElement;
                // Get the full-size image URL from thumbnail's src or data attributes
                let src = img.src || 
                         img.getAttribute('data-src') || 
                         img.getAttribute('data-image') ||
                         img.getAttribute('data-lazy-src') ||
                         img.getAttribute('data-full') || '';
                
                // Also check parent anchor tag for full image URL
                const parentAnchor = img.closest('a');
                if (parentAnchor) {
                  const href = parentAnchor.getAttribute('href') || '';
                  // If anchor links to an image, use that instead
                  if (href && (href.includes('.jpg') || href.includes('.jpeg') || href.includes('.png'))) {
                    src = href;
                  }
                }
                
                // Filter out watermarked/branded images
                if (src) {
                  const lowerSrc = src.toLowerCase();
                  const isClean = !lowerSrc.includes('logo') && !lowerSrc.includes('icon') && 
                                 !lowerSrc.includes('carfax') && !lowerSrc.includes('.svg') &&
                                 !lowerSrc.includes('watermark') && !lowerSrc.includes('badge');
                  
                  if (isClean) {
                    // Get high-res version
                    const highResSrc = src
                      .replace('-420x315', '-1024x786')
                      .replace('-300x225', '-1024x786')
                      .replace('-640x480', '-1024x786')
                      .replace('-150x150', '-1024x786')
                      .replace('-100x75', '-1024x786')
                      .replace('/thumbs/', '/photos/')
                      .replace('/small/', '/large/')
                      .replace('/thumb/', '/photo/');
                    
                    if (highResSrc && !images.includes(highResSrc) && highResSrc.length > 20) {
                      images.push(highResSrc);
                    }
                  }
                }
              }
              // If we found thumbnails, don't continue to fallback strategies
              if (images.length > 0) break;
            }
          }
          
          // Strategy 2: Extract from data-gallery JSON attribute (if no thumbnails found)
          if (images.length === 0) {
            const galleryEl = document.querySelector('[data-gallery]');
            if (galleryEl) {
              try {
                const galleryData = JSON.parse(galleryEl.getAttribute('data-gallery') || '[]');
                if (Array.isArray(galleryData)) {
                  for (let i = 0; i < galleryData.length; i++) {
                    const item = galleryData[i];
                    if (item.url || item.src || item.image) {
                      const url = item.url || item.src || item.image;
                      const lowerUrl = url.toLowerCase();
                      const isClean = !lowerUrl.includes('logo') && !lowerUrl.includes('icon') && 
                                     !lowerUrl.includes('carfax') && !lowerUrl.includes('.svg') &&
                                     !lowerUrl.includes('watermark') && !lowerUrl.includes('badge');
                      
                      if (isClean) {
                        const highResUrl = url
                          .replace('-420x315', '-1024x786')
                          .replace('-300x225', '-1024x786')
                          .replace('-640x480', '-1024x786')
                          .replace('-150x150', '-1024x786')
                          .replace('-100x75', '-1024x786')
                          .replace('/thumbs/', '/photos/')
                          .replace('/small/', '/large/')
                          .replace('/thumb/', '/photo/');
                        
                        if (highResUrl && !images.includes(highResUrl)) {
                          images.push(highResUrl);
                        }
                      }
                    }
                  }
                }
              } catch (e) {
                // Silent fail - continue to next strategy
              }
            }
          }
          
          // Strategy 3: Look for gallery containers (fallback)
          if (images.length < 3) {
            const galleryContainers = document.querySelectorAll('.vehicle-gallery, .image-gallery, .photos-container, .gallery, [data-images]');
            for (let c = 0; c < galleryContainers.length; c++) {
              const container = galleryContainers[c];
              const imgs = container.querySelectorAll('img');
              for (let i = 0; i < imgs.length; i++) {
                const imgEl = imgs[i] as HTMLImageElement;
                const src = imgEl.src || 
                           imgEl.getAttribute('data-src') || 
                           imgEl.getAttribute('data-lazy') || 
                           imgEl.getAttribute('data-lazy-src') || '';
                
                if (src) {
                  const lowerSrc = src.toLowerCase();
                  const isClean = !lowerSrc.includes('logo') && !lowerSrc.includes('icon') && 
                                 !lowerSrc.includes('carfax') && !lowerSrc.includes('.svg') &&
                                 !lowerSrc.includes('watermark') && !lowerSrc.includes('badge');
                  
                  if (isClean) {
                    const highResSrc = src
                      .replace('-420x315', '-1024x786')
                      .replace('-300x225', '-1024x786')
                      .replace('-640x480', '-1024x786')
                      .replace('-150x150', '-1024x786')
                      .replace('-100x75', '-1024x786')
                      .replace('/thumbs/', '/photos/')
                      .replace('/small/', '/large/')
                      .replace('/thumb/', '/photo/');
                    
                    if (highResSrc && !images.includes(highResSrc)) {
                      images.push(highResSrc);
                    }
                  }
                }
              }
            }
          }
          
          // Log image extraction results for debugging
          console.log(`  Found ${images.length} images for vehicle`)
          
          // Extract description with multiple strategies
          let description = '';
          
          // Strategy 1: Look for dedicated description sections
          const descriptionSelectors = [
            '.vehicle-description',
            '.vehicle-overview',
            '.description',
            '[data-field="description"]',
            '.product-description',
            '.car-description'
          ];
          
          for (const selector of descriptionSelectors) {
            const descEl = document.querySelector(selector);
            if (descEl && descEl.textContent && descEl.textContent.trim().length > 50) {
              description = descEl.textContent.trim();
              break;
            }
          }
          
          // Strategy 2: Look for heading + features/specs
          if (!description || description.length < 50) {
            const h1 = document.querySelector('h1');
            let descParts: string[] = [];
            
            if (h1?.textContent) {
              descParts.push(h1.textContent.trim());
            }
            
            // Extract features list
            const features: string[] = [];
            const featureElements = document.querySelectorAll('.vehicle-features li, .features-list li, [data-field="features"] li');
            featureElements.forEach((el, idx) => {
              if (idx < 8) { // Limit to 8 features for description
                const text = el.textContent?.trim();
                if (text && text.length > 2 && text.length < 100) {
                  features.push(text);
                }
              }
            });
            
            if (features.length > 0) {
              descParts.push('Features: ' + features.join(', '));
            }
            
            description = descParts.join(' | ');
          }
          
          // Strategy 3: Fallback to basic info from title/heading
          if (!description || description.length < 30) {
            const titleEl = document.querySelector('title, h1, h2');
            description = titleEl?.textContent?.trim() || '';
          }
          
          // Extract full page content for AI analysis/processing
          let fullPageContent = '';
          const contentSelectors = [
            '.vehicle-description',
            '.vehicle-details',
            '.vehicle-specs',
            '.vehicle-features',
            '.vehicle-overview',
            '[data-field]',
            '.specs-list',
            '.features-list',
            'article',
            'main'
          ];
          
          // Try to extract from common content containers
          for (const selector of contentSelectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              const text = el.textContent?.trim();
              if (text && text.length > 20 && text.length < 2000) {
                fullPageContent += text + '\n\n';
              }
            });
          }
          
          // If still no content, extract all meaningful text from body
          if (fullPageContent.length < 100) {
            const allText = document.body.innerText;
            fullPageContent = allText.slice(0, 5000); // Limit to 5000 chars
          }
          
          // Clean up description (remove extra whitespace, newlines)
          description = description.replace(/\s+/g, ' ').trim();
          if (description.length > 500) {
            description = description.slice(0, 497) + '...';
          }
          
          // Extract VIN from data-field attribute
          let vin = '';
          const vinEl = document.querySelector('[data-field="vin"]');
          if (vinEl) {
            vin = vinEl.textContent?.trim() || vinEl.getAttribute('data-value') || '';
          }
          // Fallback to regex if not found
          if (!vin) {
            const vinMatch = document.body.textContent?.match(/VIN[:\s]+([A-HJ-NPR-Z0-9]{17})/i);
            if (vinMatch) vin = vinMatch[1];
          }
          
          // Extract Stock # from data-field attribute
          let stockNumber = '';
          const stockEl = document.querySelector('[data-field="stock"]') || 
                          document.querySelector('[data-field="stockNumber"]');
          if (stockEl) {
            stockNumber = stockEl.textContent?.trim() || stockEl.getAttribute('data-value') || '';
          }
          // Fallback to regex if not found
          if (!stockNumber) {
            const stockMatch = document.body.textContent?.match(/Stock\s*#?[:\s]+([A-Z0-9]+)/i);
            if (stockMatch) stockNumber = stockMatch[1];
          }
          
          // Extract Carfax URL with multiple strategies
          let carfaxUrl = '';
          
          // Strategy 1: Look for Carfax links in common patterns
          const carfaxLink = document.querySelector('a[href*="carfax"]') as HTMLAnchorElement;
          if (carfaxLink && carfaxLink.href) {
            carfaxUrl = carfaxLink.href;
          }
          
          // Strategy 2: Check for data attributes
          if (!carfaxUrl) {
            const carfaxDataEl = document.querySelector('[data-carfax], [data-carfax-url], [data-carfax-link]');
            if (carfaxDataEl) {
              carfaxUrl = carfaxDataEl.getAttribute('data-carfax') || 
                         carfaxDataEl.getAttribute('data-carfax-url') || 
                         carfaxDataEl.getAttribute('data-carfax-link') || '';
            }
          }
          
          // Strategy 3: Look for buttons/divs with Carfax class
          if (!carfaxUrl) {
            const carfaxBtn = document.querySelector('.carfax-link, .carfax-button, .carfax-report');
            if (carfaxBtn) {
              const href = carfaxBtn.getAttribute('href') || carfaxBtn.getAttribute('data-url');
              if (href) carfaxUrl = href;
            }
          }
          
          // Strategy 4: Search all links for carfax.com URLs with VIN-specific reports
          if (!carfaxUrl) {
            const allLinks = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
            for (const link of allLinks) {
              if (link.href && (link.href.includes('carfax.com') || link.href.includes('carfax.ca'))) {
                // Prioritize VIN-specific URLs over homepage
                if (link.href.includes('/vehicle/') || link.href.includes('/vhr/') || link.href.includes('vin=')) {
                  carfaxUrl = link.href;
                  break;
                } else if (!carfaxUrl) {
                  // Store homepage as fallback, but keep looking for VIN-specific URL
                  carfaxUrl = link.href;
                }
              }
            }
          }
          
          // Filter out generic Carfax homepage URLs - prefer no URL over homepage
          if (carfaxUrl && (carfaxUrl === 'https://www.carfax.ca/' || carfaxUrl === 'https://www.carfax.com/' || carfaxUrl === 'https://carfax.ca/' || carfaxUrl === 'https://carfax.com/')) {
            carfaxUrl = '';
          }
          
          // Extract body style from specs
          let bodyStyle = '';
          const bodyStyleElem = Array.from(document.querySelectorAll('li')).find(li => 
            li.textContent?.includes('Body Style:')
          );
          if (bodyStyleElem && bodyStyleElem.textContent) {
            bodyStyle = bodyStyleElem.textContent.replace('Body Style:', '').trim();
          }
          
          // Extract trim from detail page heading or data attributes
          let trim = '';
          
          // Strategy 1: Look for trim in data-field attribute
          const trimEl = document.querySelector('[data-field="trim"]');
          if (trimEl) {
            trim = trimEl.textContent?.trim() || trimEl.getAttribute('data-value') || '';
          }
          
          // Strategy 2: Look for Trim in specs list
          if (!trim) {
            const trimSpecEl = Array.from(document.querySelectorAll('li, .spec-item, [class*="spec"]')).find(el =>
              el.textContent?.includes('Trim:') || el.textContent?.match(/^Trim\s*:/i)
            );
            if (trimSpecEl && trimSpecEl.textContent) {
              const trimMatch = trimSpecEl.textContent.match(/Trim[:\s]+(.+)/i);
              if (trimMatch) {
                trim = trimMatch[1].trim();
              }
            }
          }
          
          // Strategy 3: Extract from h1 heading (format: "2024 Make Model Trim | extras")
          if (!trim) {
            const h1 = document.querySelector('h1');
            if (h1 && h1.textContent) {
              const h1Text = h1.textContent.split('|')[0].trim();
              const parts = h1Text.split(/\s+/);
              // If we have more than 3 parts (year make model), the rest is likely trim
              if (parts.length > 3) {
                // Check if first part is a year
                const firstPart = parts[0];
                if (/^20\d{2}$/.test(firstPart)) {
                  trim = parts.slice(3).join(' ').trim();
                }
              }
            }
          }
          
          return {
            images: images.slice(0, 10), // Limit to 10 images
            description,
            fullPageContent,
            vin,
            stockNumber,
            carfaxUrl,
            bodyStyle,
            odometer,
            trim
          };
        });
        
        const type = determineBodyType(detailData.bodyStyle || v.bodyStyle);
        
        // Validate and select best trim - prefer detail page trim over card trim
        // Filter out pure numbers, single characters, or clearly invalid trims
        const validateTrim = (trim: string): string => {
          if (!trim || trim.length === 0) return '';
          // Filter out pure numbers (like "2" or "3.5")
          if (/^\d+\.?\d*$/.test(trim)) return '';
          // Filter out single characters
          if (trim.length === 1) return '';
          // Filter out very short generic strings
          if (['n/a', 'na', '-', '.', 'tbd'].includes(trim.toLowerCase())) return '';
          return trim;
        };
        
        const finalTrim = validateTrim(detailData.trim) || validateTrim(v.trim) || 'Base';
        
        const finalDescription = detailData.description || `${v.year} ${v.make} ${v.model} ${finalTrim}`.trim();
        
        // Use detail images if available, otherwise fall back to primary image
        const finalImages = detailData.images.length > 0 ? detailData.images : [v.primaryImage];
        
        // Use detail page odometer if found, otherwise fall back to card extraction
        const finalOdometer = detailData.odometer > 0 ? detailData.odometer : v.odometer;
        
        // Detect badges with year and odometer for accurate Low Kilometers calculation
        const badges = detectBadges(v.cardText + ' ' + v.heading, v.year, finalOdometer);
        
        scrapedVehicles.push({
          year: v.year,
          make: v.make,
          model: v.model,
          trim: finalTrim,
          type,
          price: v.price,
          odometer: finalOdometer,
          images: finalImages,
          badges,
          location: v.location,
          dealership: v.dealership,
          dealershipId: v.dealershipId,
          description: finalDescription,
          fullPageContent: detailData.fullPageContent || undefined,
          vin: detailData.vin || undefined,
          stockNumber: detailData.stockNumber || undefined,
          carfaxUrl: detailData.carfaxUrl || undefined
        });
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`  Error fetching details for ${v.year} ${v.make} ${v.model}:`, error);
        // Fallback to basic data - pass year and odometer for Low Kilometers calculation
        const badges = detectBadges(v.cardText + ' ' + v.heading, v.year, v.odometer);
        const type = determineBodyType(v.bodyStyle);
        
        // Validate trim in fallback case too
        const validateTrimFallback = (trim: string): string => {
          if (!trim || trim.length === 0) return '';
          if (/^\d+\.?\d*$/.test(trim)) return '';
          if (trim.length === 1) return '';
          if (['n/a', 'na', '-', '.', 'tbd'].includes(trim.toLowerCase())) return '';
          return trim;
        };
        const fallbackTrim = validateTrimFallback(v.trim) || 'Base';
        
        scrapedVehicles.push({
          year: v.year,
          make: v.make,
          model: v.model,
          trim: fallbackTrim,
          type,
          price: v.price,
          odometer: v.odometer,
          images: [v.primaryImage],
          badges,
          location: v.location,
          dealership: v.dealership,
          dealershipId: v.dealershipId,
          description: `${v.year} ${v.make} ${v.model} ${fallbackTrim}`.trim()
        });
      } finally {
        // Close the detail page if it's not the main page
        if (i > 0 && detailPage !== page) {
          try {
            await detailPage.close();
          } catch (e) {
            // Ignore close errors
          }
        }
      }
    }
    
    return scrapedVehicles;
    
  } finally {
    await browser.close();
    console.log('Browser closed');
  }
}

export async function scrapeAllDealerships(dealershipId?: number): Promise<number> {
  console.log('Starting comprehensive inventory scrape (DEALER-FIRST APPROACH)...');
  
  try {
    // STEP 1: Scrape dealer websites for COMPLETE vehicle data (PRIMARY SOURCE)
    console.log('\n=== STEP 1: SCRAPING DEALER WEBSITES FOR COMPLETE VEHICLE DATA ===\n');
    let dealerVehicles: any[] = [];
    
    try {
      dealerVehicles = await scrapeAllDealerListings(dealershipId);
      console.log(`✓ Scraped ${dealerVehicles.length} vehicles from dealer websites`);
      console.log(`  - Complete data: price, photos, description, badges, trim, etc.`);
    } catch (error) {
      console.error('✗ Dealer website scraping failed:', error);
      throw error; // Dealer data is now primary, fail if it fails
    }
    
    if (dealerVehicles.length === 0) {
      console.log('⚠ No vehicles scraped from dealer websites');
      return 0;
    }
    
    // STEP 2: Scrape CarGurus for enrichment data (deal ratings, CarGurus price)
    console.log('\n=== STEP 2: SCRAPING CARGURUS FOR ENRICHMENT DATA ===\n');
    let cargurusVehicles: any[] = [];
    
    try {
      cargurusVehicles = await scrapeAllCarGurusDealers();
      if (dealershipId) {
        cargurusVehicles = cargurusVehicles.filter(v => v.dealershipId === dealershipId);
      }
      console.log(`✓ Scraped ${cargurusVehicles.length} vehicles from CarGurus for enrichment`);
    } catch (error) {
      console.error('⚠ CarGurus scraping failed:', error);
      // Continue without CarGurus enrichment - dealer data is still usable
      console.log('  Continuing with dealer data only (no deal ratings)');
    }
    
    // STEP 3: Match and enrich dealer vehicles with CarGurus data
    console.log('\n=== STEP 3: ENRICHING DEALER VEHICLES WITH CARGURUS DATA ===\n');
    
    const enrichedVehicles = dealerVehicles.map((dealerVehicle) => {
      // Start with dealer vehicle as base (dealer data is authoritative)
      // CRITICAL: Keep price/odometer nullable until validation (don't default to 0)
      let enrichedVehicle: ScrapedVehicle = {
        year: dealerVehicle.year,
        make: dealerVehicle.make,
        model: dealerVehicle.model,
        trim: dealerVehicle.trim,
        type: dealerVehicle.type,
        price: dealerVehicle.price ?? null, // Keep nullable, fallback to CarGurus if needed
        odometer: dealerVehicle.odometer ?? null, // Keep nullable, fallback to CarGurus if needed
        images: dealerVehicle.images || [],
        badges: dealerVehicle.badges || [],
        location: dealerVehicle.location,
        dealership: dealerVehicle.dealershipName,
        dealershipId: dealerVehicle.dealershipId,
        description: dealerVehicle.description || '',
        vin: dealerVehicle.vin || undefined,
        stockNumber: dealerVehicle.stockNumber || undefined,
        dealerVdpUrl: dealerVehicle.vdpUrl || undefined,
      };
      
      // Try to match with CarGurus for enrichment
      if (cargurusVehicles.length > 0) {
        // Find matching CarGurus vehicle
        let cgMatch = null;
        
        // Strategy 1: VIN matching (most reliable)
        if (dealerVehicle.vin) {
          cgMatch = cargurusVehicles.find(cg => 
            cg.vin && cg.vin.toLowerCase().trim() === dealerVehicle.vin.toLowerCase().trim() &&
            cg.dealershipId === dealerVehicle.dealershipId
          );
          
          if (cgMatch) {
            console.log(`  ✓ VIN Match: ${dealerVehicle.year} ${dealerVehicle.make} ${dealerVehicle.model}`);
          }
        }
        
        // Strategy 2: Year + Make + Model + Odometer proximity
        if (!cgMatch) {
          const sameDealerCgVehicles = cargurusVehicles.filter(
            cg => cg.dealershipId === dealerVehicle.dealershipId
          );
          
          const candidates = sameDealerCgVehicles.filter(cg => {
            // Year must match
            if (cg.year !== dealerVehicle.year) return false;
            
            // Make must match (normalize)
            const cgMake = cg.make.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
            const dealerMake = dealerVehicle.make.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
            if (cgMake !== dealerMake) return false;
            
            // Model must match (normalize and allow partial)
            const cgModel = cg.model.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
            const dealerModel = dealerVehicle.model.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
            if (!cgModel.includes(dealerModel) && !dealerModel.includes(cgModel)) return false;
            
            // Odometer within 5000km
            if (dealerVehicle.odometer && cg.odometer) {
              const odometerDiff = Math.abs(cg.odometer - dealerVehicle.odometer);
              if (odometerDiff > 5000) return false;
            }
            
            return true;
          });
          
          if (candidates.length > 0) {
            // Pick best match by odometer proximity
            cgMatch = candidates.sort((a, b) => {
              const aDiff = dealerVehicle.odometer && a.odometer 
                ? Math.abs(a.odometer - dealerVehicle.odometer) 
                : 999999;
              const bDiff = dealerVehicle.odometer && b.odometer 
                ? Math.abs(b.odometer - dealerVehicle.odometer) 
                : 999999;
              return aDiff - bDiff;
            })[0];
            
            if (cgMatch) {
              console.log(`  ✓ Details Match: ${dealerVehicle.year} ${dealerVehicle.make} ${dealerVehicle.model}`);
            }
          }
        }
        
        // Enrich with CarGurus data if match found
        if (cgMatch) {
          enrichedVehicle.dealRating = cgMatch.dealRating;
          enrichedVehicle.cargurusPrice = cgMatch.price;
          enrichedVehicle.cargurusUrl = cgMatch.cargurusUrl;
          enrichedVehicle.carfaxUrl = cgMatch.carfaxUrl || enrichedVehicle.carfaxUrl;
          
          // CRITICAL: Use CarGurus data as fallback if dealer data is missing
          if ((enrichedVehicle.price === null || enrichedVehicle.price === 0) && cgMatch.price) {
            console.log(`  ⚠ Fallback: CarGurus price (dealer missing): ${dealerVehicle.year} ${dealerVehicle.make} ${dealerVehicle.model} - $${cgMatch.price}`);
            enrichedVehicle.price = cgMatch.price;
          }
          
          if ((enrichedVehicle.odometer === null || enrichedVehicle.odometer === 0) && cgMatch.odometer) {
            console.log(`  ⚠ Fallback: CarGurus odometer (dealer missing): ${dealerVehicle.year} ${dealerVehicle.make} ${dealerVehicle.model} - ${cgMatch.odometer}km`);
            enrichedVehicle.odometer = cgMatch.odometer;
          }
          
          // Use CarGurus images as fallback/supplement
          if (cgMatch.images && cgMatch.images.length > 0) {
            // Helper to normalize image URLs (strip query params for deduplication)
            const normalizeImageUrl = (url: string): string => {
              try {
                const urlObj = new URL(url);
                // Return base URL without query params or fragments
                return `${urlObj.origin}${urlObj.pathname}`;
              } catch {
                // If URL parsing fails, return original
                return url;
              }
            };
            
            // Merge dealer + CarGurus images with smart deduplication
            const dealerNormalized = enrichedVehicle.images.map((url: string) => ({ original: url, normalized: normalizeImageUrl(url) }));
            const cgNormalized = cgMatch.images.map((url: string) => ({ original: url, normalized: normalizeImageUrl(url) }));
            
            // Create a Set of normalized dealer URLs for quick lookup
            const dealerNormalizedSet = new Set(dealerNormalized.map((img: any) => img.normalized));
            
            // Add CarGurus images that aren't already in dealer set (by normalized URL)
            const uniqueCgImages = cgNormalized
              .filter((img: any) => !dealerNormalizedSet.has(img.normalized))
              .map((img: any) => img.original);
            
            const mergedImages = [...enrichedVehicle.images, ...uniqueCgImages];
            const originalCount = enrichedVehicle.images.length;
            const addedCount = uniqueCgImages.length;
            
            if (addedCount > 0) {
              console.log(`  ⚠ Merged images: ${dealerVehicle.year} ${dealerVehicle.make} ${dealerVehicle.model} - ${originalCount} dealer + ${addedCount} unique CarGurus = ${mergedImages.length} total`);
              enrichedVehicle.images = mergedImages;
            }
          }
          
          // Log price differences > $500
          if (dealerVehicle.price && cgMatch.price) {
            const priceDiff = Math.abs(dealerVehicle.price - cgMatch.price);
            if (priceDiff > 500) {
              console.log(`  ⚠ Price Difference: ${dealerVehicle.year} ${dealerVehicle.make} ${dealerVehicle.model}`);
              console.log(`    Dealer: $${dealerVehicle.price} | CarGurus: $${cgMatch.price} | Diff: $${priceDiff}`);
            }
          }
        } else {
          console.log(`  ⚠ No CarGurus Match: ${dealerVehicle.year} ${dealerVehicle.make} ${dealerVehicle.model}`);
        }
      }
      
      return enrichedVehicle;
    });
    
    const enrichedCount = enrichedVehicles.filter(v => v.dealRating || v.cargurusPrice).length;
    console.log(`\n✓ Enriched ${enrichedCount}/${dealerVehicles.length} vehicles with CarGurus data (${Math.round(enrichedCount / dealerVehicles.length * 100)}%)`);
    
    // Validate and filter vehicles with required data
    console.log('\n=== VALIDATING VEHICLE DATA ===\n');
    const skippedVehicles: Array<{reason: string; vehicle: string; dealershipId: number; vin?: string; stock?: string}> = [];
    
    const validVehicles = enrichedVehicles.filter(v => {
      const vehicleId = `${v.year} ${v.make} ${v.model}`;
      
      // CRITICAL: Require positive price (dealer or CarGurus fallback)
      if (!v.price || v.price <= 0) {
        const skip = {
          reason: 'missing_price',
          vehicle: vehicleId,
          dealershipId: v.dealershipId,
          vin: v.vin,
          stock: v.stockNumber
        };
        skippedVehicles.push(skip);
        console.log(`  ✗ SKIP (no price): ${vehicleId} [VIN: ${v.vin || 'N/A'}, Stock: ${v.stockNumber || 'N/A'}]`);
        return false;
      }
      
      // Warn about missing odometer but don't skip (CarGurus often provides this)
      if (!v.odometer || v.odometer <= 0) {
        console.log(`  ⚠ WARNING (no odometer): ${vehicleId} - will proceed anyway`);
        // Don't skip - odometer can be added later
      }
      
      // Minimum photo requirement: Set to 1 to allow vehicles with limited images
      // Production recommendation: Increase to 5-15 for better listing quality
      const MIN_PHOTOS_REQUIRED = 1;
      if (!v.images || v.images.length < MIN_PHOTOS_REQUIRED) {
        const skip = {
          reason: `insufficient_photos_${v.images?.length || 0}`,
          vehicle: vehicleId,
          dealershipId: v.dealershipId,
          vin: v.vin,
          stock: v.stockNumber
        };
        skippedVehicles.push(skip);
        console.log(`  ✗ SKIP (< ${MIN_PHOTOS_REQUIRED} photos): ${vehicleId} [${v.images?.length || 0} photos, VIN: ${v.vin || 'N/A'}]`);
        return false;
      }
      
      return true;
    });
    
    // Log structured metrics for skipped vehicles
    if (skippedVehicles.length > 0) {
      console.log(`\n⚠ SKIPPED ${skippedVehicles.length}/${enrichedVehicles.length} VEHICLES:`);
      const reasonCounts = skippedVehicles.reduce((acc, skip) => {
        acc[skip.reason] = (acc[skip.reason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      Object.entries(reasonCounts).forEach(([reason, count]) => {
        console.log(`  - ${reason}: ${count} vehicles`);
      });
    }
    console.log(`\n✓ ${validVehicles.length}/${enrichedVehicles.length} vehicles passed validation`);
    
    // STEP 4: Generate AI-powered descriptions for all vehicles
    console.log('\n=== STEP 4: GENERATING AI DESCRIPTIONS ===\n');
    const vehiclesWithDescriptions = await Promise.all(
      validVehicles.map(async (vehicle) => {
        try {
          const aiDescription = await generateVehicleDescription({
            year: vehicle.year,
            make: vehicle.make,
            model: vehicle.model,
            trim: vehicle.trim,
            type: vehicle.type,
            price: vehicle.price!, // Safe: validated in filter above
            odometer: vehicle.odometer!, // Safe: validated in filter above
            badges: vehicle.badges,
            dealership: vehicle.dealership,
            location: vehicle.location,
            rawDescription: vehicle.description,
            fullPageContent: vehicle.fullPageContent
          });
          
          return {
            ...vehicle,
            description: aiDescription
          };
        } catch (error) {
          console.error(`Failed to generate description for ${vehicle.year} ${vehicle.make} ${vehicle.model}:`, error);
          // Keep original description on error
          return vehicle;
        }
      })
    );
    
    console.log(`✓ Generated AI descriptions for ${vehiclesWithDescriptions.length} vehicles`);
    
    // STEP 5: Save to database
    console.log('\n=== STEP 5: SAVING TO DATABASE ===\n');
    
    // Clear existing inventory (delete views first to avoid foreign key constraint)
    if (dealershipId) {
      await db.delete(vehicleViews).where(eq(vehicleViews.dealershipId, dealershipId));
      await db.delete(vehicles).where(eq(vehicles.dealershipId, dealershipId));
    } else {
      await db.execute(sql`TRUNCATE TABLE vehicle_views, vehicles RESTART IDENTITY CASCADE`);
    }
    
    // Insert new inventory (filter out any vehicles with null price/odometer)
    const validForInsert = vehiclesWithDescriptions.filter(v => v.price !== null && v.odometer !== null);
    if (validForInsert.length > 0) {
      await db.insert(vehicles).values(validForInsert as any);
    }
    
    console.log(`\n✓ Successfully scraped and saved ${vehiclesWithDescriptions.length} vehicles (DEALER-FIRST)`);
    const vehiclesByDealership = vehiclesWithDescriptions.reduce((acc, vehicle) => {
      if (!acc[vehicle.dealershipId]) {
        acc[vehicle.dealershipId] = { name: vehicle.dealership, count: 0 };
      }
      acc[vehicle.dealershipId].count += 1;
      return acc;
    }, {} as Record<number, { name: string; count: number }>);
    Object.entries(vehiclesByDealership).forEach(([id, info]) => {
      console.log(`  - ${info.name || `Dealership ${id}`}: ${info.count} vehicles`);
    });
    console.log(`  - Dealer data (primary): price, photos, description, badges`);
    console.log(`  - CarGurus enrichment: ${enrichedCount} vehicles with deal ratings`);
    console.log(`  - AI descriptions: ${vehiclesWithDescriptions.length} vehicles`);
    
    return vehiclesWithDescriptions.length;
  } catch (error) {
    console.error('✗ Scraping failed:', error);
    throw error;
  }
}

export async function testBadgeDetection() {
  const testDescriptions = [
    "One owner vehicle with clean history. No accidents reported.",
    "Certified pre-owned with low kilometers. Accident free!",
    "Clean title, single owner, excellent condition",
    "Manager Special | Low Km's | New Arrival",
    "Great fuel economy on this used vehicle"
  ];

  console.log('\n=== Badge Detection Test ===');
  testDescriptions.forEach((desc, i) => {
    const badges = detectBadges(desc);
    console.log(`\nTest ${i + 1}: "${desc}"`);
    console.log(`Detected badges: ${badges.join(', ') || 'None'}`);
  });
}

// NEW: Incremental scraping that saves each vehicle immediately
// This prevents data loss when the scraper is interrupted
// Also removes vehicles that are no longer on the source website (sold)
export async function scrapeAllDealershipsIncremental(dealershipId?: number): Promise<number> {
  console.log('Starting INCREMENTAL inventory scrape (saves each vehicle immediately)...');
  const targetDealershipIds = await resolveTargetDealershipIds(dealershipId);
  if (targetDealershipIds.length === 0) {
    console.warn('?s? No active dealerships found for incremental scrape');
    return 0;
  }

  let totalVehicles = 0;
  for (const targetId of targetDealershipIds) {
    try {
      totalVehicles += await scrapeDealershipIncrementally(targetId);
    } catch (error) {
      console.error(`?o- Incremental scraping failed for dealership ${targetId}:`, error);
    }
  }

  return totalVehicles;
}

async function scrapeDealershipIncrementally(targetDealershipId: number): Promise<number> {
  console.log(`Starting INCREMENTAL inventory scrape for dealership ${targetDealershipId}...`);
  
  // Track scrape start time to identify stale vehicles
  const scrapeStartTime = new Date();
  
  // Track which dealerships were successfully scraped (have at least 1 vehicle)
  const scrapedDealershipIds = new Set<number>();
  
  try {
    // Callback that saves each vehicle as it's scraped
    const onVehicleSaved = async (listing: DealerVehicleListing) => {
      // Track this dealership as successfully scraped
      scrapedDealershipIds.add(listing.dealershipId);
      
      // Convert listing to ScrapedVehicle format
      const vehicleData: ScrapedVehicle = {
        year: listing.year,
        make: listing.make,
        model: listing.model,
        trim: listing.trim,
        type: listing.type,
        price: listing.price,
        odometer: listing.odometer,
        images: listing.images,
        badges: listing.badges,
        location: listing.location,
        dealership: listing.dealershipName,
        dealershipId: listing.dealershipId,
        description: listing.description,
        vin: listing.vin || undefined,
        stockNumber: listing.stockNumber || undefined,
        dealerVdpUrl: listing.vdpUrl,
      };
      
      return await upsertVehicleByVin(vehicleData);
    };
    
    // Use checkpointed scraper for crash recovery and resume capability
    const result = await scrapeDealerListingsCheckpointed(onVehicleSaved, undefined, targetDealershipId);
    
    console.log(`\n✓ CHECKPOINTED SCRAPE COMPLETE (Dealership ${targetDealershipId})`);
    console.log(`  - Total: ${result.total} vehicles`);
    console.log(`  - New: ${result.inserted} vehicles`);
    console.log(`  - Updated: ${result.updated} vehicles`);
    console.log(`  - Resumed from checkpoint: ${result.resumed ? 'Yes' : 'No'}`);
    console.log(`  - Dealerships scraped: ${scrapedDealershipIds.size}`);
    
    // STEP: Remove sold vehicles (those not found in this scrape)
    // Only delete from dealerships that were successfully scraped
    // This prevents deleting all vehicles if a dealership scrape fails
    if (result.total > 0 && scrapedDealershipIds.size > 0) {
      console.log('\n=== CLEANING UP SOLD VEHICLES ===');
      
      const dealershipIdsArray = Array.from(scrapedDealershipIds);
      console.log(`Checking dealerships: ${dealershipIdsArray.join(', ')}`);
      console.log(`Scrape start time: ${scrapeStartTime.toISOString()}`);
      
      // SAFETY CHECK: Get current vehicle count for these dealerships
      // This prevents mass deletion if a scrape has issues (e.g., filtering problems, partial failures)
      const existingVehicleCount = await db.select({ count: sql<number>`count(*)` })
        .from(vehicles)
        .where(inArray(vehicles.dealershipId, dealershipIdsArray));
      
      const currentCount = Number(existingVehicleCount[0]?.count || 0);
      const scrapedCount = result.total;
      const deletionThreshold = 0.3; // Only proceed if we scraped at least 30% of existing inventory
      
      console.log(`Current inventory: ${currentCount} vehicles, Scraped: ${scrapedCount} vehicles`);
      
      // If we scraped significantly fewer vehicles than exist, skip deletion to prevent data loss
      if (currentCount > 10 && scrapedCount < currentCount * deletionThreshold) {
        console.log(`⚠ SAFETY CHECK TRIGGERED: Scraped only ${scrapedCount}/${currentCount} vehicles (${Math.round(scrapedCount/currentCount*100)}%)`);
        console.log(`  Skipping stale vehicle cleanup to prevent accidental data loss.`);
        console.log(`  This may indicate: scraper issues, website changes, or filtering problems.`);
        console.log(`  To force cleanup, manually trigger with at least ${Math.ceil(currentCount * deletionThreshold)} vehicles scraped.`);
      } else {
        // Find vehicles whose lastScrapedAt is before the scrape start time
        // ONLY for dealerships that were successfully scraped
        // Also grab lastScrapedAt for debugging
        const staleVehicles = await db.select({ 
          id: vehicles.id, 
          vin: vehicles.vin, 
          year: vehicles.year, 
          make: vehicles.make, 
          model: vehicles.model,
          trim: vehicles.trim,
          dealershipId: vehicles.dealershipId,
          lastScrapedAt: vehicles.lastScrapedAt
        })
          .from(vehicles)
          .where(
            and(
              inArray(vehicles.dealershipId, dealershipIdsArray),
              or(
                lt(vehicles.lastScrapedAt, scrapeStartTime),
                isNull(vehicles.lastScrapedAt)
              )
            )
          );
        
        if (staleVehicles.length > 0) {
          // Another safety check: Don't delete more than 50% of inventory at once
          const maxDeletions = Math.floor(currentCount * 0.5);
          if (staleVehicles.length > maxDeletions && currentCount > 10) {
            console.log(`⚠ SAFETY CHECK: Would delete ${staleVehicles.length} of ${currentCount} vehicles (${Math.round(staleVehicles.length/currentCount*100)}%)`);
            console.log(`  Capping deletions to ${maxDeletions} vehicles to prevent accidental mass deletion.`);
            console.log(`  Remaining stale vehicles will be caught in subsequent scrapes.`);
          }
          
          const vehiclesToDelete = staleVehicles.slice(0, maxDeletions);
          
          console.log(`Found ${staleVehicles.length} vehicles no longer on source website (deleting ${vehiclesToDelete.length}):`);
          for (const v of vehiclesToDelete) {
            const lastScrape = v.lastScrapedAt ? v.lastScrapedAt.toISOString() : 'never';
            console.log(`  - ${v.year} ${v.make} ${v.model} ${v.trim} (VIN: ${v.vin || 'N/A'}) [Dealership ${v.dealershipId}] Last scraped: ${lastScrape}`);
          }
          
          // Delete stale vehicles (first delete related records to avoid foreign key constraints)
          const staleIds = vehiclesToDelete.map(v => v.id);
          
          // Delete related chat conversations first
          await db.delete(chatConversations).where(inArray(chatConversations.vehicleId, staleIds));
          
          // Delete related vehicle views
          await db.delete(vehicleViews).where(inArray(vehicleViews.vehicleId, staleIds));
          
          // Now delete the vehicles
          await db.delete(vehicles).where(inArray(vehicles.id, staleIds));
          
          console.log(`✓ Removed ${vehiclesToDelete.length} sold/stale vehicles`);
        } else {
          console.log('✓ No stale vehicles to remove');
          
          // Debug: Show sample of recently scraped vehicles for this dealership
          const sampleVehicles = await db.select({ 
            year: vehicles.year, 
            make: vehicles.make, 
            model: vehicles.model,
            lastScrapedAt: vehicles.lastScrapedAt
          })
            .from(vehicles)
            .where(inArray(vehicles.dealershipId, dealershipIdsArray))
            .limit(5);
          
          console.log(`Sample of vehicles in scraped dealerships:`);
          for (const v of sampleVehicles) {
            console.log(`  - ${v.year} ${v.make} ${v.model} - Last scraped: ${v.lastScrapedAt?.toISOString() || 'never'}`);
          }
        }
      }
    }
    
    return result.total;
  } catch (error) {
    console.error('✗ Incremental scraping failed:', error);
    throw error;
  }
}
