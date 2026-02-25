import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { execSync } from 'child_process';
import { cookieStore } from './cloudflare-bypass/cookie-store';
import { proxyManager } from './cloudflare-bypass/proxy-manager';
import { generateRandomFingerprint, applyFingerprint, randomDelay, isCloudflareChallenge, humanLikeScroll } from './cloudflare-bypass/browser-utils';
import {
  extractVehicleImages,
  validateImages,
  calculateImageQualityRating,
  calculateDataQualityScore,
  type ExtractedImage
} from './precision-image-extractor';
import { storage } from './storage';
import type { ScrapeQueue, InsertScrapeQueue } from '@shared/schema';
import { BrowserlessUnifiedService } from './browserless-unified';
import * as cheerio from 'cheerio';

// Apply stealth plugin to evade bot detection
puppeteer.use(StealthPlugin());

interface DealerConfig {
  name: string;
  url: string;
  domain: string;
  dealershipId: number;
  location: string;
  filterGroupId?: number | null;
}

// Fallback configs if database is empty (for backwards compatibility)
const FALLBACK_DEALER_CONFIGS: DealerConfig[] = [
  {
    name: 'Olympic Hyundai Vancouver',
    url: 'https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used',
    domain: 'olympichyundaivancouver.com',
    dealershipId: 2,
    location: 'Vancouver'
  }
];

// Get dealer configs from database scrape_sources table
async function getDealerConfigsFromDb(dealershipId?: number): Promise<DealerConfig[]> {
  try {
    const sources = dealershipId
      ? await storage.getActiveScrapeSources(dealershipId)
      : await storage.getAllActiveScrapeSources();
    
    if (sources.length === 0) {
      if (dealershipId) {
        console.warn(`  ⚠ No active scrape sources configured for dealership ${dealershipId}`);
        return FALLBACK_DEALER_CONFIGS.filter(config => config.dealershipId === dealershipId);
      }
      console.log("  ℹ No active scrape sources in database, using fallback config");
      return FALLBACK_DEALER_CONFIGS;
    }
    
    return sources.map(source => {
      const urlObj = new URL(source.sourceUrl);
      return {
        name: source.sourceName,
        url: source.sourceUrl,
        domain: urlObj.hostname.replace('www.', ''),
        dealershipId: source.dealershipId,
        location: source.sourceName.includes("Vancouver") ? "Vancouver" : 
                  source.sourceName.includes("Burnaby") ? "Burnaby" : "BC",
        filterGroupId: source.filterGroupId || null,
      };
    });
  } catch (error) {
    console.error("  ⚠ Error loading scrape sources from database:", error);
    console.log("  ℹ Falling back to default dealer configs");
    const fallback = dealershipId
      ? FALLBACK_DEALER_CONFIGS.filter(config => config.dealershipId === dealershipId)
      : FALLBACK_DEALER_CONFIGS;
    return fallback;
  }
}

export interface DealerVehicleListing {
  vin: string | null;
  year: number;
  make: string;
  model: string;
  trim: string;
  odometer: number | null;
  price: number | null;
  images: string[];
  description: string;
  badges: string[];
  type: string;
  stockNumber: string | null;
  vdpUrl: string;
  dealershipId: number;
  dealershipName: string;
  location: string;
  imageQuality: 'excellent' | 'good' | 'fair' | 'poor';
  dataQualityScore: number;
  // Extended VDP fields
  exteriorColor: string | null;
  interiorColor: string | null;
  transmission: string | null;
  drivetrain: string | null;
  fuelType: string | null;
  carfaxUrl: string | null;
  carfaxBadges: string[];
  techSpecs: string | null;
  highlights: string | null;
  vdpDescription: string | null;
}

function parsePrice(priceText: string): number | null {
  const priceMatch = priceText.match(/\$?\s*([0-9,]+)/);
  if (priceMatch) {
    const price = parseInt(priceMatch[1].replace(/,/g, ''));
    if (price >= 1000 && price <= 500000) {
      return price;
    }
  }
  return null;
}

function parseOdometer(odoText: string): number | null {
  const odoMatch = odoText.match(/([0-9,]+)\s*(km|kilometers?)/i);
  if (odoMatch) {
    return parseInt(odoMatch[1].replace(/,/g, ''));
  }
  return null;
}

function parseYear(text: string): number | null {
  const yearMatch = text.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    return parseInt(yearMatch[1]);
  }
  return null;
}

// Helper function to determine body type from text
function determineBodyType(text: string): string {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('sedan')) return 'Sedan';
  if (lowerText.includes('suv') || lowerText.includes('sport utility')) return 'SUV';
  if (lowerText.includes('truck') || lowerText.includes('pickup')) return 'Truck';
  if (lowerText.includes('hatchback')) return 'Hatchback';
  if (lowerText.includes('coupe') || lowerText.includes('convertible')) return 'Coupe';
  if (lowerText.includes('wagon')) return 'Wagon';
  if (lowerText.includes('minivan') || lowerText.includes('van')) return 'Minivan';
  
  return 'SUV'; // Default
}

// Check if vehicle has low km based on 12,000 km per year threshold
function isLowKilometers(year: number, odometer: number): boolean {
  const currentYear = new Date().getFullYear();
  const vehicleAge = Math.max(1, currentYear - year); // At least 1 year old
  const expectedMaxKm = vehicleAge * 12000; // 12,000 km per year average
  return odometer > 0 && odometer <= expectedMaxKm;
}

// Check if a vehicle appears to be NEW (not used) based on various indicators
// This function uses multiple signals to accurately detect new cars
// scrapingUsedInventory: if true, we're scraping from a /used/ page so trust the dealership's classification
function isLikelyNewVehicle(year: number, odometer: number | null, rawOdometerKm: number | null, isNewCondition: boolean, scrapingUsedInventory: boolean = false): boolean {
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  
  // PRIMARY: If the page explicitly says it's new (from DOM/text detection)
  // This is the most reliable signal - even on used inventory pages, if the VDP says "New", skip it
  if (isNewCondition) {
    console.log(`    ⚠ NEW CAR DETECTED: Page explicitly indicates "New" condition`);
    return true;
  }
  
  // If scraping from a /used/ or /preowned/ URL, trust the dealership's classification
  // Don't use heuristics like odometer or year to second-guess them
  // Demo vehicles, trade-ins, and returns often have very low mileage but are legitimately "used"
  if (scrapingUsedInventory) {
    // Only skip if the VDP explicitly says "New" (handled above)
    // Otherwise, trust that everything on the used inventory page is used
    return false;
  }
  
  // If it's next year's model, it's definitely new (dealerships often list next year models early)
  if (year === nextYear) {
    console.log(`    ⚠ NEW CAR DETECTED: Year ${year} is next year's model`);
    return true;
  }
  
  // Check raw odometer (before the 500km filter was applied)
  // New cars typically have very low odometer readings (0-100 km typically, up to 500 km max)
  if (rawOdometerKm !== null && rawOdometerKm < 500) {
    console.log(`    ⚠ NEW CAR DETECTED: Raw odometer ${rawOdometerKm} km is under 500 km threshold`);
    return true;
  }
  
  // If it's current year AND no odometer data at all, it's suspicious
  // But we need to be careful - some used cars just don't have odometer listed
  // Only flag if year is current AND odometer is completely missing (not just filtered)
  if (year === currentYear && odometer === null && rawOdometerKm === null) {
    // This is a soft signal - log but don't automatically reject
    // The isNewCondition check is more reliable
    console.log(`    ⚡ WARNING: Current year ${year} with no odometer data - may be new or used with missing data`);
    // Return false to avoid false positives - let the isNewCondition check handle it
  }
  
  return false;
}

// Helper function to detect badges from text
function detectBadges(text: string, year?: number, odometer?: number): string[] {
  const badges: string[] = [];
  const lowerText = text.toLowerCase();
  
  if (/\b(one owner|1 owner|single owner)\b/.test(lowerText)) {
    badges.push('One Owner');
  }
  if (/\b(no accidents?|accident free|clean history|accident-free)\b/.test(lowerText)) {
    badges.push('No Accidents');
  }
  if (/\b(clean title|clear title)\b/.test(lowerText)) {
    badges.push('Clean Title');
  }
  if (/\b(certified pre-?owned|cpo\b|hyundai certified|manufacturer certified|factory certified)\b/.test(lowerText)) {
    badges.push('Certified Pre-Owned');
  }
  // Low Kilometers: Calculate based on 12,000 km/year if year and odometer provided
  if (year && odometer && isLowKilometers(year, odometer)) {
    badges.push('Low Kilometers');
  } else if (/\b(low km|low kilometers|low mileage|low km's)\b/.test(lowerText)) {
    // Only use keyword detection if we don't have year/odometer data
    if (!year || !odometer) {
      badges.push('Low Kilometers');
    }
  }
  
  return badges;
}

interface VehicleDetailData {
  vin: string | null;
  price: number | null;
  odometer: number | null;
  rawOdometerKm: number | null; // Raw odometer value before filtering (for new car detection)
  isNewCondition: boolean; // Whether the page indicates this is a "New" vehicle
  images: string[];
  trim: string;
  description: string;
  badges: string[];
  type: string;
  stockNumber: string | null;
  imageQuality: 'excellent' | 'good' | 'fair' | 'poor';
  dataQualityScore: number;
  // Extended VDP fields
  exteriorColor: string | null;
  interiorColor: string | null;
  engine: string | null;
  transmission: string | null;
  drivetrain: string | null;
  fuelType: string | null;
  carfaxUrl: string | null;
  carfaxBadges: string[];
  bodyStyle: string | null;
  highlights: string | null;
  vdpDescription: string | null;
  techSpecs: string | null; // JSON string
}

// Scrape VDP using an existing page (reuses page instead of creating new ones)
async function scrapeVehicleDetailPage(page: any, vdpUrl: string, retries = 2): Promise<VehicleDetailData> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Navigate to VDP using existing page
      await page.goto(vdpUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      
      // Wait for the page to be fully interactive
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Check for Cloudflare challenge on VDP page
      const isChallenged = await isCloudflareChallenge(page);
      if (isChallenged) {
        console.log('    ⚠ Cloudflare challenge on VDP, waiting...');
        // Wait for challenge to resolve
        for (let i = 0; i < 15; i++) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          if (!(await isCloudflareChallenge(page))) {
            console.log('    ✓ VDP challenge resolved');
            break;
          }
        }
      }
      
      // Wait for dynamic content to render
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Debug: Log that we're about to extract data
      const pageUrl = await page.url();
      console.log(`    → VDP loaded: ${pageUrl}`);
      
      // Click through gallery carousel to load all images (Alpine.js lazy loading)
      try {
        // Click gallery next button multiple times to load all images
        const nextButtonSelectors = [
          '.photo-gallery__arrow--next',
          '.mobile-slider__arrow--next', 
          '[class*="gallery"] [class*="next"]',
          '[class*="slider"] [class*="next"]',
          '.swiper-button-next',
          '.slick-next'
        ];
        
        for (const selector of nextButtonSelectors) {
          const nextBtn = await page.$(selector);
          if (nextBtn) {
            // Click through 50 images to ensure all are loaded
            // IMPROVED: 150ms delay (was 100ms) + visibility check before each click
            for (let clickCount = 0; clickCount < 50; clickCount++) {
              try {
                // Check if button is still visible and clickable before clicking
                const isClickable = await page.evaluate((sel: string) => {
                  const btn = document.querySelector(sel);
                  if (!btn) return false;
                  const style = window.getComputedStyle(btn);
                  return style.display !== 'none' && 
                         style.visibility !== 'hidden' && 
                         !btn.hasAttribute('disabled');
                }, selector);
                
                if (!isClickable) break;
                
                await nextBtn.click();
                await new Promise(resolve => setTimeout(resolve, 150)); // Increased from 100ms to 150ms
              } catch (e) {
                break; // Button may become disabled
              }
            }
            break; // Found and clicked a gallery button
          }
        }
      } catch (galleryErr) {
        // Gallery clicking is optional, continue with extraction
      }
      
      // Wait a moment for images to load after gallery navigation
      await new Promise(resolve => setTimeout(resolve, 500));

      // Click all expand/collapse accordion buttons to reveal hidden Options and Tech Specs content
      try {
        await page.evaluate(() => {
          // Click accordion triggers, expand buttons, "show more" buttons, details summary elements
          const expandSelectors = [
            '[class*="accordion"] button',
            '[class*="accordion"] [class*="trigger"]',
            '[class*="accordion"] [class*="header"]',
            '[class*="collapsible"] button',
            '[class*="expandable"] button',
            'details summary',
            'button[class*="expand"]',
            'button[class*="collapse"]',
            'button[class*="toggle"]',
            '[class*="show-more"]',
            '[class*="read-more"]',
            '[x-data] button',
            '[x-data] [x-on\\:click]',
            '[x-data] [\\@click]',
            '.techspecs-tab button',
            '[class*="techspec"] button',
            '[class*="options"] button',
            '[class*="feature"] button',
          ];
          for (const selector of expandSelectors) {
            try {
              const buttons = document.querySelectorAll(selector);
              buttons.forEach((btn: Element) => {
                try { (btn as HTMLElement).click(); } catch(e) {}
              });
            } catch(e) {}
          }
          // Also open all <details> elements
          const detailsEls = document.querySelectorAll('details');
          detailsEls.forEach((d) => { d.open = true; });
        });
        // Brief wait for accordion content to render
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (accordionErr) {
        // Accordion expansion is optional, continue with extraction
      }

      // Scroll down to where Carfax badges typically appear (they may be lazy-loaded)
      try {
        await page.evaluate(() => {
          // Scroll to the bottom third of the page where badges usually live
          window.scrollTo(0, document.body.scrollHeight * 0.6);
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Scroll to full bottom to trigger any remaining lazy-loads
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise(resolve => setTimeout(resolve, 800));
        // Scroll back to top for extraction
        await page.evaluate(() => {
          window.scrollTo(0, 0);
        });
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (scrollErr) {
        // Scroll is optional, continue with extraction
      }

      // Use page.evaluate with a string to prevent ESBuild transformation
      const data = await page.evaluate(`(function() {
        var pageText = document.body.textContent || '';
        
        function isPaymentContext(element) {
          var paymentKeywords = /payment|weekly|bi-?weekly|monthly|calculator|financing|finance|per\\s+month|\\/mo/i;
          var elementText = element.textContent || '';
          if (paymentKeywords.test(elementText)) return true;
          var elementClass = element.getAttribute('class') || '';
          var elementId = element.getAttribute('id') || '';
          if (paymentKeywords.test(elementClass) || paymentKeywords.test(elementId)) return true;
          var parent = element.parentElement;
          if (parent) {
            var parentClass = parent.getAttribute('class') || '';
            var parentId = parent.getAttribute('id') || '';
            if (paymentKeywords.test(parentClass) || paymentKeywords.test(parentId)) return true;
          }
          return false;
        }
        
        var pageTitle = document.title || 'No title';
        var bodyLength = pageText.length;
        var priceElExists = document.querySelector('.vehicle-price') ? 'yes' : 'no';
        var allImgs = document.querySelectorAll('img').length;
        var allPriceElements = document.querySelectorAll('[class*="price"]').length;
        
        // Extract VIN (no TypeScript annotations)
        var vin = null;
        var vinMatch = pageText.match(/VIN[:\\s]*([A-HJ-NPR-Z0-9]{17})/i);
        if (vinMatch) {
          vin = vinMatch[1].toUpperCase();
        }
        
        // Extract Stock Number
        var stockNumber = null;
        var stockMatch = pageText.match(/stock[#\\s:]*([A-Z0-9-]+)/i);
        if (stockMatch) {
          stockNumber = stockMatch[1];
        }
        
        // Extract price - target the actual selling price with high confidence
        var price = null;
        var priceConfidence = 'low';
        var priceSource = 'none';
        
        // Strategy 1: Target authoritative DOM nodes with dealer-specific selectors
        // NOTE: Avoid overly generic selectors like [id*="price"] that match financing widgets
        // IMPORTANT: Order matters - more specific selectors first
        var authoritativePriceSelectors = [
          // Olympic Hyundai Vancouver specific - the main selling price
          '.price-block__price--primary',
          '.price-block__price',
          '.main-price',
          // Standard dealer website patterns
          '[data-field="price"]',
          '[data-field="sellingPrice"]',
          '[data-price]',
          '[itemprop="price"]',
          '.vehicle-price__price',
          '.vehicle-price',
          '.dealer-price',
          '.selling-price',
          '.final-price',
          '.sale-price',
          '#vehicle-price',
          '#selling-price',
          '#dealer-price'
          // Deliberately excluding generic [id*="price"] and [class*="sale-price"] to avoid matching financing calculators
        ];
        
        for (var pi = 0; pi < authoritativePriceSelectors.length; pi++) {
          var priceSelector = authoritativePriceSelectors[pi];
          var priceEl = document.querySelector(priceSelector);
          if (priceEl) {
            // CRITICAL: Use payment context helper to reject payment widgets
            if (!isPaymentContext(priceEl)) {
              var priceText = priceEl.textContent || priceEl.getAttribute('data-value') || priceEl.getAttribute('data-price') || '';
              var priceMatchResult = priceText.match(/\\$?\\s*([0-9,]+)/);
              if (priceMatchResult) {
                var priceVal = parseInt(priceMatchResult[1].replace(/,/g, ''));
                // Realistic minimum: $1000 (excludes payment amounts like $399)
                if (priceVal >= 1000 && priceVal <= 500000) {
                  price = priceVal;
                  priceConfidence = 'high';
                  priceSource = priceSelector;
                  break; // Use first valid CASH price from authoritative selector
                }
                // Note: Values below $1000 are ignored as likely payment amounts
              }
            }
          }
        }
        
        // Strategy 2: Scoped regex with label anchoring (high confidence)
        if (!price) {
          var labeledPricePatterns = [
            /(?:Sale|Selling|Asking|Dealer|Final|Internet)\\s*Price[:\\s]*\\$?\\s*([0-9,]+)/i,
            /Price[:\\s]*\\$?\\s*([0-9,]+)(?!\\s*(?:weekly|monthly|payment))/i,
            /\\$\\s*([0-9,]+)\\s*(?:CAD|CDN|Canadian)?(?!\\s*(?:weekly|monthly|payment|per))/i
          ];
          
          for (var lpi = 0; lpi < labeledPricePatterns.length; lpi++) {
            var pattern = labeledPricePatterns[lpi];
            var labeledMatch = pageText.match(pattern);
            if (labeledMatch) {
              var labeledVal = parseInt(labeledMatch[1].replace(/,/g, ''));
              // Realistic minimum: $1000 (excludes typical payment amounts)
              if (labeledVal >= 1000 && labeledVal <= 500000) {
                price = labeledVal;
                priceConfidence = 'medium';
                priceSource = 'labeled-pattern';
                break;
              }
              // Note: Values below $1000 are ignored as likely payment amounts
            }
          }
        }
        
        // Strategy 3: Last resort - scan all prices, use median (avoid both payments and MSRP)
        // NOTE: This is unreliable and may be removed in future
        if (!price) {
          var priceRegex = /\\$\\s*([0-9,]+)(?!\\s*(?:weekly|bi-?weekly|monthly|per\\s+month|\\/mo|payment))/gi;
          var priceMatch2;
          var prices = [];
          
          while ((priceMatch2 = priceRegex.exec(pageText)) !== null) {
            var val = parseInt(priceMatch2[1].replace(/,/g, ''));
            // Minimum $2000 for fallback strategy (more conservative but still captures low-end inventory)
            if (val >= 2000 && val <= 500000) {
              prices.push(val);
            }
          }
          
          // Use MEDIAN price (more robust than min/max)
          if (prices.length >= 2) {
            prices.sort(function(a, b) { return a - b; });
            var mid = Math.floor(prices.length / 2);
            price = prices.length % 2 === 0 ? prices[mid - 1] : prices[mid];
            priceConfidence = 'low';
          } else if (prices.length === 1) {
            price = prices[0];
            priceConfidence = 'low';
          }
          // Note: Low confidence prices are still used but should be validated
        }
        
        // Extract odometer - look for specific odometer patterns, not just any "X km"
        var odometer = null;
        var rawOdometerKm = null; // Track raw value before 500km filtering (for new car detection)
        
        // Strategy 1: Look for labeled odometer fields (highest confidence)
        var odoSelectors = [
          '[class*="odometer"]',
          '[class*="mileage"]',
          '[class*="km"]',
          '[data-odometer]',
          '.kilometers',
          '.vehicle-odometer'
        ];
        
        for (var oi = 0; oi < odoSelectors.length && !odometer; oi++) {
          var odoEl = document.querySelector(odoSelectors[oi]);
          if (odoEl && odoEl.textContent) {
            var odoText = odoEl.textContent;
            var odoLabelMatch = odoText.match(/([0-9,]+)/);
            if (odoLabelMatch) {
              var odoVal = parseInt(odoLabelMatch[1].replace(/,/g, ''));
              // Track raw value for new car detection (even low values)
              if (rawOdometerKm === null && odoVal >= 0 && odoVal < 500000) {
                rawOdometerKm = odoVal;
              }
              // Minimum 500 km to avoid erroneous small values for final odometer
              if (odoVal >= 500 && odoVal < 500000) {
                odometer = odoVal;
              }
            }
          }
        }
        
        // Strategy 2: Look for labeled patterns in page text
        if (!odometer) {
          var labelPatterns = [
            /odometer[:\\s]+([0-9,]+)\\s*(km)?/i,
            /mileage[:\\s]+([0-9,]+)\\s*(km)?/i,
            /kilometers[:\\s]+([0-9,]+)/i,
            /([0-9,]+)\\s*km\\s*(?:odometer|mileage)/i,
            /\\b([0-9]{1,3}(?:,[0-9]{3})+)\\s*km\\b/i  // Match numbers with commas like "67,432 km"
          ];
          
          for (var li = 0; li < labelPatterns.length && !odometer; li++) {
            var labelMatch = pageText.match(labelPatterns[li]);
            if (labelMatch) {
              var odoVal = parseInt(labelMatch[1].replace(/,/g, ''));
              // Track raw value for new car detection
              if (rawOdometerKm === null && odoVal >= 0 && odoVal < 500000) {
                rawOdometerKm = odoVal;
              }
              // Minimum 500 km to avoid erroneous small values (like "100 km away")
              if (odoVal >= 500 && odoVal < 500000) {
                odometer = odoVal;
              }
            }
          }
        }
        
        // Strategy 3: Last resort - look for reasonable standalone km values
        // Exclude patterns like "X km away", "X km from", "within X km"
        if (!odometer) {
          var kmMatches = pageText.match(/\\b([0-9,]+)\\s*(km|kilometers?)\\b/gi);
          if (kmMatches) {
            for (var ki = 0; ki < kmMatches.length && !odometer; ki++) {
              // Skip if it looks like a distance phrase
              var context = pageText.substring(
                Math.max(0, pageText.indexOf(kmMatches[ki]) - 20),
                pageText.indexOf(kmMatches[ki]) + kmMatches[ki].length + 20
              ).toLowerCase();
              
              if (context.includes('away') || context.includes('from') || 
                  context.includes('within') || context.includes('distance') ||
                  context.includes('radius') || context.includes('located')) {
                continue;
              }
              
              var numMatch = kmMatches[ki].match(/([0-9,]+)/);
              if (numMatch) {
                var odoVal = parseInt(numMatch[1].replace(/,/g, ''));
                // Track raw value for new car detection
                if (rawOdometerKm === null && odoVal >= 0 && odoVal < 500000) {
                  rawOdometerKm = odoVal;
                }
                // Higher minimum (1000 km) for last resort strategy
                if (odoVal >= 1000 && odoVal < 500000) {
                  odometer = odoVal;
                }
              }
            }
          }
        }
        
        // Extract trim from title/heading using intelligent detection
        var trim = '';
        
        // Known trim levels for common brands (order matters - LONGER/MORE SPECIFIC FIRST)
        // This prevents "SE" from matching before "SEL" or "XSE"
        var knownTrims = [
          // EV/Hybrid trims (most specific, check first)
          'Electric Preferred', 'Electric Ultimate', 'Plug-In Hybrid',
          // Package descriptors (multi-word, check early)
          'Sun & Leather', 'Leather Package', 'Tech Package',
          // Long compound trims
          'High Country', 'King Ranch', 'Value Edition', 'Night Edition',
          'GT-Line', 'GT Line', 'Off-Road', 'N Line',
          // Hyundai trims
          'Calligraphy', 'Ultimate', 'Preferred', 'Essential', 'Luxury',
          // Toyota/Lexus (XSE before XLE before SE before LE)
          'XSE', 'XLE', 'TRD', 'SR5',
          // Common trims (longer before shorter)
          'Trailhawk', 'Overland', 'Platinum', 'Titanium', 'Touring',
          'Premium', 'Limited', 'Denali', 'Lariat', 'Raptor', 'Laredo',
          'Prestige', 'Technik', 'Progressiv', 'Komfort', 'Convenience',
          'Elite', 'Sport', 'Trail', 'Hybrid',
          // Shorter trims (check after longer ones)
          'SEL', 'SXT', 'Pro',
          // Single/double letter trims (check LAST to avoid false matches)
          'GT', 'RS', 'ST', 'SR', 'SL', 'SV', 'SE', 'LE', 'S',
          'R/T',
          // AWD/FWD indicators (often appended to trim)
          'Quattro', 'xDrive', 'S-AWC', 'AWD', 'FWD', '4WD', '4x4'
        ];
        
        // Strategy 1: Look for dedicated trim DOM elements first
        var trimSelectors = [
          '[class*="trim"]',
          '[data-trim]',
          '[data-field="trim"]',
          '.vehicle-trim',
          '.trim-name'
        ];
        
        for (var ti = 0; ti < trimSelectors.length && !trim; ti++) {
          var trimEl = document.querySelector(trimSelectors[ti]);
          if (trimEl && trimEl.textContent) {
            var trimText = trimEl.textContent.trim();
            // Make sure it's not just noise
            if (trimText.length > 1 && trimText.length < 50 && !/^\\d+$/.test(trimText)) {
              trim = trimText;
            }
          }
        }
        
        // Strategy 2: Extract from h1 title using known trim matching
        if (!trim) {
          var h1El = document.querySelector('h1');
          if (h1El) {
            var titleText = h1El.textContent || '';
            
            // Look for known trim keywords in the title (case-insensitive)
            for (var ki = 0; ki < knownTrims.length; ki++) {
              var knownTrim = knownTrims[ki];
              // Simple case-insensitive search for trim in title
              var lowerTitle = titleText.toLowerCase();
              var lowerTrim = knownTrim.toLowerCase();
              if (lowerTitle.indexOf(lowerTrim) !== -1) {
                trim = knownTrim;
                break;
              }
            }
            
            // Strategy 3: Try to extract trim after removing year/make/model and engine codes
            if (!trim) {
              // Remove year (e.g., "2022")
              var cleaned = titleText.replace(/\\b20\\d{2}\\b/g, '');
              // Remove common makes
              cleaned = cleaned.replace(/\\b(Hyundai|Toyota|Honda|Ford|Chevrolet|Nissan|Kia|Mazda|Subaru|Volkswagen|BMW|Mercedes|Audi|Lexus|Acura|Infiniti|Jeep|Dodge|Ram|GMC|Buick|Cadillac|Lincoln|Volvo|Porsche|Land Rover|Jaguar|Genesis|Mini|Fiat|Mitsubishi|Chrysler)\\b/gi, '');
              // Remove common models - this is tricky, we'll be conservative
              cleaned = cleaned.replace(/\\b(Kona|Tucson|Santa Fe|Elantra|Sonata|Palisade|Ioniq|Venue|Accent|Civic|Accord|Camry|Corolla|RAV4|CR-V|Pilot|Highlander|Rogue|Altima|Sentra|Pathfinder|Murano|Escape|F-150|Explorer|Edge|Bronco|Malibu|Equinox|Silverado|Traverse|Tahoe|Sorento|Sportage|Telluride|Soul|Forte|CX-5|CX-30|CX-50|Mazda3|Mazda6|Outback|Forester|Crosstrek|Impreza|Tiguan|Jetta|Golf|Passat|Atlas)\\b/gi, '');
              // Remove engine codes like "2.0L", "1.6T", "3.5L V6"
              cleaned = cleaned.replace(/\\b\\d+\\.\\d+[LT]?\\b/gi, '');
              cleaned = cleaned.replace(/\\bV[468]\\b/gi, '');
              cleaned = cleaned.replace(/\\bTurbo\\b/gi, '');
              // Remove drivetrain indicators that are NOT part of trim names
              cleaned = cleaned.replace(/\\b(4dr|2dr|sedan|suv|hatchback|coupe|wagon|convertible)\\b/gi, '');
              // Remove common feature descriptors that aren't trims
              cleaned = cleaned.replace(/\\|.*/g, ''); // Remove everything after pipe (feature lists)
              // Clean up whitespace and punctuation
              cleaned = cleaned.replace(/[|\\[\\]()]/g, ' ').replace(/\\s+/g, ' ').trim();
              
              // If we have something reasonable left, use it
              if (cleaned.length >= 2 && cleaned.length <= 40 && !/^\\d+$/.test(cleaned)) {
                // Don't use if it's just numbers or single characters
                trim = cleaned;
              }
            }
          }
        }
        
        // Default to empty string if no valid trim found (better than "Base" or garbage)
        if (!trim || trim === 'Base' || /^\\d+$/.test(trim)) {
          trim = '';
        }
        
        // Extract description
        var description = '';
        var descriptionSelectors = [
          '[class*="description"]',
          '[class*="details"]',
          '[class*="comments"]',
          'p[class*="text"]',
          '.vehicle-description',
          '#description'
        ];
        
        for (var di = 0; di < descriptionSelectors.length; di++) {
          var descSelector = descriptionSelectors[di];
          var descElement = document.querySelector(descSelector);
          if (descElement && descElement.textContent && descElement.textContent.length > 50) {
            description = descElement.textContent.trim();
            break;
          }
        }
        
        // If no description found, create a basic one
        if (!description) {
          description = 'Used vehicle. Contact dealer for more information.';
        }
        
        // Extract images - FOCUSED ON VEHICLE PHOTO CDN DOMAINS
        var images = [];
        var processedUrls = {};
        var debugImgInfo = [];
        
        // TRUSTED VEHICLE PHOTO CDN DOMAINS - these contain actual car photos
        // EXPANDED from refactored scraper to include HomeNet and more CDNs
        var trustedPhotoCDNs = [
          'autotradercdn.ca/photos',        // AutoTrader CDN - main vehicle photos
          'photos.autotrader.ca',           // AutoTrader alternate
          'photomanager',                    // Photo manager services
          '/vehicles/',                      // Dealer's own vehicle photos
          'cargurus.com/images/forsale',    // CarGurus vehicle images
          'ddclstatic.com',                 // DDC vehicle images
          'dealercdn.com',                  // Dealer CDN
          'dealerinspire.com/vehicles',     // DI vehicle images
          'photos.dealer.com',              // Dealer.com photos
          'gdealer.com',                    // GDealer images
          'evoxcdn.com',                    // Evox images
          'ws-assets.dealercom.net',        // DealerSocket images
          'homenetiol.com',                 // HomeNet inventory images (MAJOR PROVIDER)
          'homenet-inc.com',                // HomeNet alternate domain
          'cdnmedia.endeavorsuite.com',     // Endeavor/PBS suite images
          'images.foxdealer.com',           // Fox dealer images
          'spincar.com',                    // SpinCar 360 photos
          '360.spincar.com',                // SpinCar 360 alternate
          'izmostock.com',                  // Stock photos for new vehicles
          'lotstalk.net',                   // LotsTalk inventory images
          'vauto.com'                       // vAuto images
        ];
        
        // BLOCKED PROMOTIONAL DOMAINS - these are banners/site images
        var blockedPatterns = [
          'cdn-convertus.com/uploads/sites/', // Site promotional images
          'form-',                             // Form background images  
          'bg-',                               // Background images
          '-bg',                               // Background suffix
          'Welcome-background',                // Welcome banners
          'Get-Approved',                      // Promotional
          'Pictogram',                         // Icons
          'quote-',                            // Quote icons
          '-dark.png',                         // Icon variants
          '-light.png',                        // Icon variants
          'Home-Delivery',                     // Promotional banner
          'Car-Buying',                        // Promotional banner
          'hassle',                            // Promotional text
          '.svg',                              // SVG logos/icons
          '/headers/',                         // Header images/logos
          '/themes/',                          // Theme assets
          '/logos/',                           // Logo images
          'hyundai.svg',                       // Hyundai logo specifically
          'hyundai-header',                    // Header variations
          'favicon',                           // Favicon icons
          '/icons/',                           // Icon folders
          'achilles',                          // Theme framework
          'convertus-achilles',                // Convertus theme
          '/wp-content/themes/',               // WordPress theme assets
          'logo',                              // Generic logo patterns
          'brand-',                            // Brand assets
          '-brand',                            // Brand assets suffix
          '/assets/images/',                   // Site assets
          'placeholder'                        // Placeholder images
        ];
        
        // Helper function to check if URL is from a trusted vehicle photo CDN
        function isVehiclePhotoCDN(src) {
          if (!src || src.length < 10) return false;
          var lower = src.toLowerCase();
          
          // First check if it's blocked
          for (var bi = 0; bi < blockedPatterns.length; bi++) {
            if (lower.indexOf(blockedPatterns[bi].toLowerCase()) !== -1) {
              return false;
            }
          }
          
          // Check if from trusted CDN
          for (var ci = 0; ci < trustedPhotoCDNs.length; ci++) {
            if (lower.indexOf(trustedPhotoCDNs[ci].toLowerCase()) !== -1) {
              return true;
            }
          }
          
          return false;
        }
        
        // Helper function to normalize URL
        function normalizeUrl(src) {
          if (src.indexOf('//') === 0) {
            return 'https:' + src;
          } else if (src.indexOf('/') === 0) {
            return window.location.origin + src;
          }
          return src;
        }
        
        // Helper function to upgrade image URLs to higher resolution
        // Tries to get 2048px instead of 1024px where supported
        function upgradeImageResolution(url) {
          var upgraded = url;
          
          // AutoTrader CDN - upgrade to higher resolution
          if (url.indexOf('autotradercdn.ca') !== -1) {
            // Replace common size patterns with larger ones
            upgraded = upgraded.replace(/-1024x786\\./, '-2048x1536.');
            upgraded = upgraded.replace(/-640x480\\./, '-2048x1536.');
            upgraded = upgraded.replace(/w=\\d+/, 'w=2048');
            upgraded = upgraded.replace(/width=\\d+/, 'width=2048');
            upgraded = upgraded.replace(/h=\\d+/, 'h=1536');
            upgraded = upgraded.replace(/height=\\d+/, 'height=1536');
          }
          
          // CarGurus - upgrade to max quality
          if (url.indexOf('cargurus.com/images/forsale') !== -1) {
            var baseUrl = url.split('?')[0];
            upgraded = baseUrl + '?io=true&width=2048&height=1536&fit=bounds&format=jpg&auto=webp';
          }
          
          // DealerInspire - use large version
          if (url.indexOf('dealerinspire.com') !== -1) {
            upgraded = upgraded.replace('/thumb/', '/large/');
            upgraded = upgraded.replace('/small/', '/large/');
            upgraded = upgraded.replace('/medium/', '/large/');
          }
          
          // HomeNet - try to get larger images
          if (url.indexOf('homenetiol.com') !== -1 || url.indexOf('homenet-inc.com') !== -1) {
            upgraded = upgraded.replace(/sz=\\d+/, 'sz=2048');
            upgraded = upgraded.replace(/size=\\d+/, 'size=2048');
          }
          
          return upgraded;
        }
        
        // STRATEGY 1: Look ONLY in gallery/slider containers for vehicle photos
        var galleryContainers = document.querySelectorAll('.photo-gallery, .mobile-slider, .vehicle-gallery, .gallery-container, [class*="vehicle-photo"], [class*="main-image"]');
        debugImgInfo.push('Gallery containers: ' + galleryContainers.length);
        
        // Collect all img elements from gallery containers
        var galleryImgs = [];
        for (var gc = 0; gc < galleryContainers.length; gc++) {
          var containerImgs = galleryContainers[gc].querySelectorAll('img');
          for (var gci = 0; gci < containerImgs.length; gci++) {
            galleryImgs.push(containerImgs[gci]);
          }
        }
        
        debugImgInfo.push('Gallery imgs: ' + galleryImgs.length);
        
        // Extract from gallery images first (priority)
        for (var i = 0; i < galleryImgs.length; i++) {
          var img = galleryImgs[i];
          // Use .src property for dynamic content (not getAttribute)
          // EXPANDED: Check 8+ lazy-load attributes to capture more images
          var possibleSrcs = [
            img.src,                           // Current loaded source
            img.currentSrc,                    // What browser actually displays
            img.getAttribute('data-src'),
            img.getAttribute('data-lazy-src'),
            img.getAttribute('data-original'),
            img.getAttribute('data-image'),
            img.getAttribute('data-full-size'),
            img.getAttribute('data-large-src'),  // Large version
            img.getAttribute('data-zoom-image'), // Zoom version (usually high-res)
            img.getAttribute('data-srcset'),     // Responsive srcset
            img.getAttribute('srcset')           // Standard srcset
          ];
          
          for (var ps = 0; ps < possibleSrcs.length; ps++) {
            var src = possibleSrcs[ps];
            if (src && src.length > 10) {
              src = normalizeUrl(src);
              if (src.indexOf('http') === 0 && !processedUrls[src]) {
                // STRICT: Only allow images from trusted CDN domains
                if (isVehiclePhotoCDN(src)) {
                  // UPGRADE: Try to get higher resolution version
                  var upgradedSrc = upgradeImageResolution(src);
                  processedUrls[src] = true;
                  processedUrls[upgradedSrc] = true; // Prevent duplicates with upgraded URL
                  images.push(upgradedSrc);
                }
              }
            }
          }
        }
        
        debugImgInfo.push('After gallery: ' + images.length);
        
        // STRATEGY 2: Look for AutoTrader CDN photos anywhere on page
        var allImgElements = document.querySelectorAll('img');
        for (var ai = 0; ai < allImgElements.length; ai++) {
          var allImg = allImgElements[ai];
          var src = allImg.src || allImg.currentSrc || '';
          if (src && isVehiclePhotoCDN(src)) {
            src = normalizeUrl(src);
            if (src.indexOf('http') === 0 && !processedUrls[src]) {
              // UPGRADE: Try to get higher resolution version
              var upgradedSrc = upgradeImageResolution(src);
              processedUrls[src] = true;
              processedUrls[upgradedSrc] = true;
              images.push(upgradedSrc);
            }
          }
        }
        
        debugImgInfo.push('After CDN scan: ' + images.length);
        
        // STRATEGY 3: Look for background images ONLY from trusted CDNs
        var elementsWithBg = document.querySelectorAll('[style*="background"]');
        for (var bi2 = 0; bi2 < elementsWithBg.length; bi2++) {
          var el = elementsWithBg[bi2];
          var style = el.getAttribute('style') || '';
          var bgMatch = style.match(/url\\s*\\(\\s*['"]?([^'"\\)]+)['"]?\\s*\\)/i);
          if (bgMatch && bgMatch[1]) {
            var bgSrc = bgMatch[1];
            bgSrc = normalizeUrl(bgSrc);
            if (bgSrc.indexOf('http') === 0 && isVehiclePhotoCDN(bgSrc) && !processedUrls[bgSrc]) {
              // UPGRADE: Try to get higher resolution version
              var upgradedBgSrc = upgradeImageResolution(bgSrc);
              processedUrls[bgSrc] = true;
              processedUrls[upgradedBgSrc] = true;
              images.push(upgradedBgSrc);
            }
          }
        }
        
        debugImgInfo.push('After bg (CDN only): ' + images.length);
        
        // DETECT NEW vs USED vehicle condition from page content
        var isNewCondition = false;
        var lowerPageText = pageText.toLowerCase();
        
        // Strategy 1: Look for explicit "New" labels in DOM elements
        var conditionSelectors = [
          '[class*="condition"]',
          '[class*="stock-type"]',
          '[class*="vehicle-type"]',
          '[data-condition]',
          '[data-stock-type]',
          '.badge',
          '.label',
          '.tag'
        ];
        
        for (var ci = 0; ci < conditionSelectors.length && !isNewCondition; ci++) {
          var condEl = document.querySelector(conditionSelectors[ci]);
          if (condEl && condEl.textContent) {
            var condText = condEl.textContent.toLowerCase().trim();
            // Check for explicit "New" indication (not "New Arrival" which is different)
            if (condText === 'new' || condText === 'new vehicle' || condText === 'brand new') {
              isNewCondition = true;
            }
          }
        }
        
        // Strategy 2: Check URL for explicit /new/ path segment (STRONG SIGNAL)
        // This is more reliable than text-based detection
        if (!isNewCondition) {
          var currentUrl = window.location.href.toLowerCase();
          if (currentUrl.indexOf('/new/') !== -1 || currentUrl.indexOf('/new-vehicles/') !== -1 || currentUrl.indexOf('sale_class=new') !== -1) {
            isNewCondition = true;
          }
        }
        
        // SKIP MSRP and text-based "new vehicle" detection when URL indicates used
        // Many dealers show "Compare to MSRP" or "Below MSRP" on used car pages
        // Also, promotional text like "New deals on used cars" can trigger false positives
        // Only use aggressive text detection if URL explicitly says /new/
        var urlIndicatesUsed = window.location.href.toLowerCase().indexOf('used') !== -1 || 
                               window.location.href.toLowerCase().indexOf('preowned') !== -1 ||
                               window.location.href.toLowerCase().indexOf('pre-owned') !== -1;
        
        if (!isNewCondition && !urlIndicatesUsed) {
          // Strategy 3: Check for MSRP label (only when URL doesn't indicate used)
          if (/\\bMSRP\\b/i.test(pageText) && !/\\b(?:below|under|compared\\s+to|vs\\.?|original)\\s*MSRP\\b/i.test(pageText)) {
            isNewCondition = true;
          }
          
          // Strategy 4: Check for explicit "New Vehicle" or "New Car" phrases (only when URL doesn't indicate used)
          // Be careful to avoid "new arrival", "new to inventory", "new listing"
          if (/\\b(?:brand\\s*new|factory\\s*new)\\b/i.test(pageText)) {
            isNewCondition = true;
          }
        }
        
        // === EXTRACT EXTENDED VDP FIELDS ===

        // Helper: extract labeled value from page text (e.g. "Exterior Colour: White")
        function extractLabeledValue(labels, text) {
          for (var li2 = 0; li2 < labels.length; li2++) {
            var pattern = new RegExp(labels[li2] + '[:\\\\s]+([^\\\\n|<,;]+)', 'i');
            var match = text.match(pattern);
            if (match && match[1]) {
              var val = match[1].trim();
              // Clean up trailing whitespace and common suffixes
              val = val.replace(/\\s+$/, '');
              if (val.length > 0 && val.length < 80) return val;
            }
          }
          return null;
        }

        // Query all spec list items once for reuse across all field extractions
        var allListItems = document.querySelectorAll('li, .spec-item, [class*="spec"], [class*="detail"]');

        // Extract Exterior Color
        var exteriorColor = null;
        var colorLabels = ['Exterior Colou?r', 'Ext\\\\.?\\\\s*Colou?r', 'Exterior'];
        exteriorColor = extractLabeledValue(colorLabels, pageText);
        // Also check sidebar list items with checkmarks
        if (!exteriorColor) {
          for (var cli = 0; cli < allListItems.length; cli++) {
            var liText = allListItems[cli].textContent || '';
            var colorMatch = liText.match(/Exterior\\s*Colou?r[:\\s]+(.+)/i);
            if (colorMatch && colorMatch[1]) {
              exteriorColor = colorMatch[1].trim().split(/[,;|\\n]/)[0].trim();
              if (exteriorColor.length > 0 && exteriorColor.length < 50) break;
              exteriorColor = null;
            }
          }
        }

        // Extract Interior Color
        var interiorColor = null;
        var intColorLabels = ['Interior Colou?r', 'Int\\\\.?\\\\s*Colou?r', 'Interior'];
        interiorColor = extractLabeledValue(intColorLabels, pageText);
        if (!interiorColor) {
          for (var icli = 0; icli < allListItems.length; icli++) {
            var icText = allListItems[icli].textContent || '';
            var icMatch = icText.match(/Interior\\s*Colou?r[:\\s]+(.+)/i);
            if (icMatch && icMatch[1]) {
              interiorColor = icMatch[1].trim().split(/[,;|\\n]/)[0].trim();
              if (interiorColor.length > 0 && interiorColor.length < 50) break;
              interiorColor = null;
            }
          }
        }
        // Fallback: if interior color contains template placeholders (e.g. '{{ vehicle.interior_color }}')
        // or is still null, hardcode to 'Black' - most vehicles have black interiors
        if (!interiorColor || interiorColor.indexOf('{{') !== -1 || interiorColor.indexOf('vehicle.') !== -1) {
          interiorColor = 'Black';
        }

        // Extract Engine
        var engine = null;
        var engineLabels = ['Engine'];
        engine = extractLabeledValue(engineLabels, pageText);
        if (!engine) {
          for (var ei2 = 0; ei2 < allListItems.length; ei2++) {
            var eiText = allListItems[ei2].textContent || '';
            var engineMatch = eiText.match(/Engine[:\\s]+(.+)/i);
            if (engineMatch && engineMatch[1]) {
              engine = engineMatch[1].trim().split(/[\\n]/)[0].trim();
              if (engine.length > 0 && engine.length < 120) break;
              engine = null;
            }
          }
        }
        // Strategy 3: Check sidebar li elements specifically (Olympic Hyundai pattern)
        if (!engine) {
          var sidebarLis = document.querySelectorAll('.sidebar li, [class*="sidebar"] li, .vehicle-info li, [class*="vehicle-info"] li, .details-list li, [class*="detail"] li');
          for (var seli = 0; seli < sidebarLis.length; seli++) {
            var seLiText = sidebarLis[seli].textContent || '';
            var seMatch = seLiText.match(/Engine[:\\s]+(.+)/i);
            if (seMatch && seMatch[1]) {
              engine = seMatch[1].trim().split(/[,;|\\n]/)[0].trim();
              if (engine.length > 0 && engine.length < 120) break;
              engine = null;
            }
          }
        }
        // Strategy 4: Look for engine in any element with checkmark/icon pattern (common in spec lists)
        if (!engine) {
          var allEls = document.querySelectorAll('span, div, p, dd');
          for (var aei = 0; aei < allEls.length; aei++) {
            var aeText = (allEls[aei].textContent || '').trim();
            var aeMatch = aeText.match(/^Engine[:\\s]+(.+)/i);
            if (aeMatch && aeMatch[1]) {
              engine = aeMatch[1].trim().split(/[,;|\\n]/)[0].trim();
              if (engine.length > 0 && engine.length < 120) break;
              engine = null;
            }
          }
        }

        // Extract Transmission
        var transmission = null;
        var transLabels = ['Transmission', 'Trans'];
        transmission = extractLabeledValue(transLabels, pageText);
        if (!transmission) {
          for (var tri = 0; tri < allListItems.length; tri++) {
            var trText = allListItems[tri].textContent || '';
            var transMatch = trText.match(/Transmission[:\\s]+(.+)/i);
            if (transMatch && transMatch[1]) {
              transmission = transMatch[1].trim().split(/[,;|\\n]/)[0].trim();
              if (transmission.length > 0 && transmission.length < 50) break;
              transmission = null;
            }
          }
        }
        // Normalize transmission
        if (transmission) {
          var transLower = transmission.toLowerCase();
          if (transLower.indexOf('automatic') !== -1 || transLower.indexOf('auto') !== -1) transmission = 'Automatic';
          else if (transLower.indexOf('manual') !== -1 || transLower.indexOf('stick') !== -1) transmission = 'Manual';
          else if (transLower.indexOf('cvt') !== -1) transmission = 'CVT';
        }

        // Extract Drivetrain
        var drivetrain = null;
        var dtLabels = ['Drive\\\\s*Train', 'Drivetrain', 'Drive\\\\s*Type'];
        drivetrain = extractLabeledValue(dtLabels, pageText);
        if (!drivetrain) {
          for (var dti = 0; dti < allListItems.length; dti++) {
            var dtText = allListItems[dti].textContent || '';
            var dtMatch = dtText.match(/Drive\\s*Train[:\\s]+(.+)/i) || dtText.match(/Drivetrain[:\\s]+(.+)/i);
            if (dtMatch && dtMatch[1]) {
              drivetrain = dtMatch[1].trim().split(/[,;|\\n]/)[0].trim();
              if (drivetrain.length > 0 && drivetrain.length < 30) break;
              drivetrain = null;
            }
          }
        }
        // Normalize drivetrain
        if (drivetrain) {
          var dtLower = drivetrain.toLowerCase();
          if (dtLower.indexOf('awd') !== -1 || dtLower.indexOf('all wheel') !== -1 || dtLower.indexOf('all-wheel') !== -1) drivetrain = 'AWD';
          else if (dtLower.indexOf('4wd') !== -1 || dtLower.indexOf('four wheel') !== -1 || dtLower.indexOf('4x4') !== -1) drivetrain = '4WD';
          else if (dtLower.indexOf('fwd') !== -1 || dtLower.indexOf('front wheel') !== -1 || dtLower.indexOf('front-wheel') !== -1) drivetrain = 'FWD';
          else if (dtLower.indexOf('rwd') !== -1 || dtLower.indexOf('rear wheel') !== -1 || dtLower.indexOf('rear-wheel') !== -1) drivetrain = 'RWD';
        }

        // Extract Fuel Type - Priority 1: hidden input vdp-fuelType (most reliable)
        var fuelType = null;
        var fuelTypeInput = document.querySelector('input[name="vdp-fuelType"]');
        if (fuelTypeInput) {
          fuelType = fuelTypeInput.getAttribute('value') || null;
        }
        // Priority 2: labeled text on page
        if (!fuelType) {
          var fuelLabels = ['Fuel\\\\s*Type', 'Fuel'];
          fuelType = extractLabeledValue(fuelLabels, pageText);
        }
        // Priority 3: sidebar list items
        if (!fuelType) {
          for (var fti = 0; fti < allListItems.length; fti++) {
            var ftText = allListItems[fti].textContent || '';
            var ftMatch = ftText.match(/Fuel\\s*Type[:\\s]+(.+)/i);
            if (ftMatch && ftMatch[1]) {
              fuelType = ftMatch[1].trim().split(/[,;|\\n]/)[0].trim();
              if (fuelType.length > 0 && fuelType.length < 30) break;
              fuelType = null;
            }
          }
        }
        // Normalize fuel type
        if (fuelType) {
          var ftLower = fuelType.toLowerCase();
          if (ftLower.indexOf('electric') !== -1 || ftLower === 'ev' || ftLower === 'bev') fuelType = 'Electric';
          else if (ftLower.indexOf('plug') !== -1 && ftLower.indexOf('hybrid') !== -1) fuelType = 'Hybrid';
          else if (ftLower.indexOf('hybrid') !== -1) fuelType = 'Hybrid';
          else if (ftLower.indexOf('diesel') !== -1) fuelType = 'Diesel';
          else if (ftLower.indexOf('gas') !== -1 || ftLower.indexOf('petrol') !== -1 || ftLower.indexOf('unleaded') !== -1) fuelType = 'Gasoline';
        }

        // Extract Body Style
        var bodyStyle = null;
        var bsLabels = ['Body\\\\s*Style', 'Body\\\\s*Type'];
        bodyStyle = extractLabeledValue(bsLabels, pageText);
        if (!bodyStyle) {
          for (var bsi = 0; bsi < allListItems.length; bsi++) {
            var bsText = allListItems[bsi].textContent || '';
            var bsMatch = bsText.match(/Body\\s*Style[:\\s]+(.+)/i);
            if (bsMatch && bsMatch[1]) {
              bodyStyle = bsMatch[1].trim().split(/[,;|\\n]/)[0].trim();
              if (bodyStyle.length > 0 && bodyStyle.length < 40) break;
              bodyStyle = null;
            }
          }
        }

        // Extract Carfax URL - multiple strategies
        var carfaxUrl = null;
        // Strategy 1: Direct a[href*="carfax"] links
        var carfaxLinks = document.querySelectorAll('a[href*="carfax"]');
        for (var cfi = 0; cfi < carfaxLinks.length; cfi++) {
          var cfHref = carfaxLinks[cfi].getAttribute('href') || '';
          if (cfHref && (cfHref.indexOf('carfax.ca') !== -1 || cfHref.indexOf('carfax.com') !== -1)) {
            // Prefer VIN-specific URLs
            if (cfHref.indexOf('/vehicle/') !== -1 || cfHref.indexOf('/vhr/') !== -1 || cfHref.indexOf('vin=') !== -1) {
              carfaxUrl = cfHref;
              break;
            }
            // Store as fallback (but not homepage)
            if (!carfaxUrl && cfHref !== 'https://www.carfax.ca/' && cfHref !== 'https://www.carfax.com/') {
              carfaxUrl = cfHref;
            }
          }
        }
        // Strategy 2: Links wrapping carfax badge images (Olympic Hyundai pattern)
        if (!carfaxUrl) {
          var carfaxImgLinks = document.querySelectorAll('a');
          for (var cil = 0; cil < carfaxImgLinks.length; cil++) {
            var linkEl = carfaxImgLinks[cil];
            var linkHref = linkEl.getAttribute('href') || '';
            if (linkHref.indexOf('carfax') !== -1 || linkHref.indexOf('vhr.carfax') !== -1) {
              var hasCarfaxImg = linkEl.querySelector('img[src*="carfax"]');
              if (hasCarfaxImg) {
                carfaxUrl = linkHref;
                break;
              }
            }
          }
        }
        // Strategy 3: Look for vhr.carfax.ca links specifically (report links)
        if (!carfaxUrl) {
          var vhrLinks = document.querySelectorAll('a[href*="vhr.carfax"]');
          for (var vli = 0; vli < vhrLinks.length; vli++) {
            var vhrHref = vhrLinks[vli].getAttribute('href') || '';
            if (vhrHref.length > 10) {
              carfaxUrl = vhrHref;
              break;
            }
          }
        }
        // Strategy 4: Find anchor that wraps any img with cdn.carfax.ca/badging in src or data-src
        if (!carfaxUrl) {
          var badgeImgs = document.querySelectorAll('img[src*="cdn.carfax.ca/badging"], img[data-src*="cdn.carfax.ca/badging"], img[src*="carfax.ca/badging"], img[data-src*="carfax.ca/badging"]');
          for (var bii = 0; bii < badgeImgs.length; bii++) {
            var parentA = badgeImgs[bii].closest('a');
            if (parentA) {
              var paHref = parentA.getAttribute('href') || '';
              if (paHref.length > 10) {
                carfaxUrl = paHref;
                break;
              }
            }
          }
        }
        // Strategy 6: Look for any anchor whose child contains carfax text or images
        if (!carfaxUrl) {
          var allAnchors = document.querySelectorAll('a');
          for (var aai = 0; aai < allAnchors.length; aai++) {
            var aHref = allAnchors[aai].getAttribute('href') || '';
            if (aHref.indexOf('vhr.carfax.ca') !== -1 && aHref.length > 20) {
              carfaxUrl = aHref;
              break;
            }
          }
        }
        // Strategy 5: Check for carfax URL in data attributes
        if (!carfaxUrl) {
          var carfaxDataEls = document.querySelectorAll('[data-carfax-url], [data-carfax], [data-href*="carfax"]');
          for (var cdi = 0; cdi < carfaxDataEls.length; cdi++) {
            var dataUrl = carfaxDataEls[cdi].getAttribute('data-carfax-url') || carfaxDataEls[cdi].getAttribute('data-carfax') || carfaxDataEls[cdi].getAttribute('data-href') || '';
            if (dataUrl.length > 10 && dataUrl.indexOf('carfax') !== -1) {
              carfaxUrl = dataUrl;
              break;
            }
          }
        }

        // Extract Carfax Badges from CDN badge images
        var carfaxBadges = [];
        // Helper to add badge if not already present
        function addCarfaxBadge(badge) {
          if (carfaxBadges.indexOf(badge) === -1) carfaxBadges.push(badge);
        }
        // Helper to parse badge name from CDN SVG filename (e.g. 'OneOwner.svg' -> 'One Owner')
        function parseBadgeFromFilename(src) {
          var filenameMatch = src.match(/badging\\/([^\\/?.]+)/i) || src.match(/\\/([^\\/?.]+)\\.svg/i);
          if (filenameMatch && filenameMatch[1]) {
            var name = filenameMatch[1].toLowerCase();
            if (name.indexOf('oneowner') !== -1 || name === 'one-owner') addCarfaxBadge('One Owner');
            if (name.indexOf('accidentfree') !== -1 || name.indexOf('noaccident') !== -1 || name === 'accident-free') addCarfaxBadge('No Reported Accidents');
            if (name.indexOf('servicehistory') !== -1 || name.indexOf('service-history') !== -1) addCarfaxBadge('Service History');
            if (name.indexOf('lowkilometer') !== -1 || name.indexOf('lowmileage') !== -1 || name.indexOf('low-km') !== -1) addCarfaxBadge('Low Kilometers');
          }
        }
        var carfaxBadgeImgs = document.querySelectorAll('img[src*="cdn.carfax.ca"], img[src*="carfax.ca/badging"], img[src*="carfax"], img[data-src*="carfax"], img[data-lazy-src*="carfax"]');
        for (var cbi = 0; cbi < carfaxBadgeImgs.length; cbi++) {
          var badgeSrc = (carfaxBadgeImgs[cbi].getAttribute('src') || carfaxBadgeImgs[cbi].getAttribute('data-src') || carfaxBadgeImgs[cbi].getAttribute('data-lazy-src') || '');
          var badgeSrcLower = badgeSrc.toLowerCase();
          var badgeAlt = (carfaxBadgeImgs[cbi].getAttribute('alt') || '').toLowerCase();
          var badgeData = (carfaxBadgeImgs[cbi].getAttribute('data-badge') || '').toLowerCase();

          // Parse SVG filename from CDN URL (e.g. cdn.carfax.ca/badging/OneOwner.svg)
          if (badgeSrcLower.indexOf('badging/') !== -1 || badgeSrcLower.indexOf('.svg') !== -1) {
            parseBadgeFromFilename(badgeSrc);
          }

          // Also match by keyword in src, alt, or data attributes
          if (badgeSrcLower.indexOf('oneowner') !== -1 || badgeAlt.indexOf('one owner') !== -1 || badgeData.indexOf('one owner') !== -1) {
            addCarfaxBadge('One Owner');
          }
          if (badgeSrcLower.indexOf('accidentfree') !== -1 || badgeSrcLower.indexOf('noaccident') !== -1 ||
              badgeAlt.indexOf('accident free') !== -1 || badgeAlt.indexOf('no accident') !== -1 ||
              badgeAlt.indexOf('no reported accident') !== -1 || badgeData.indexOf('accident') !== -1) {
            addCarfaxBadge('No Reported Accidents');
          }
          if (badgeSrcLower.indexOf('servicehistory') !== -1 || badgeAlt.indexOf('service') !== -1 || badgeData.indexOf('service') !== -1) {
            addCarfaxBadge('Service History');
          }
          if (badgeSrcLower.indexOf('lowkilometer') !== -1 || badgeSrcLower.indexOf('lowmileage') !== -1 ||
              badgeAlt.indexOf('low km') !== -1 || badgeAlt.indexOf('low mileage') !== -1 || badgeData.indexOf('low') !== -1) {
            addCarfaxBadge('Low Kilometers');
          }
        }

        // Extract Highlights from h1 (text after pipe character)
        var highlights = null;
        var h1Element = document.querySelector('h1');
        if (h1Element) {
          var h1Text = h1Element.textContent || '';
          var pipeIndex = h1Text.indexOf('|');
          if (pipeIndex !== -1) {
            highlights = h1Text.substring(pipeIndex + 1).trim();
            // Clean up multiple pipes into a readable format
            highlights = highlights.replace(/\\s*\\|\\s*/g, ' | ');
            if (highlights.length < 3) highlights = null;
          }
        }

        // Extract VDP Description (the dealer's vehicle description)
        var vdpDescription = '';
        var vdpDescSelectors = [
          '.vehicle-description',
          '.vdp-description',
          '[class*="vehicle-description"]',
          '[class*="vdp-description"]',
          '#vehicle-description',
          '.dealer-comments',
          '[class*="dealer-comment"]',
          '[class*="seller-note"]'
        ];
        for (var vdi = 0; vdi < vdpDescSelectors.length; vdi++) {
          var vdpDescEl = document.querySelector(vdpDescSelectors[vdi]);
          if (vdpDescEl && vdpDescEl.textContent && vdpDescEl.textContent.trim().length > 50) {
            vdpDescription = vdpDescEl.textContent.trim();
            break;
          }
        }

        // Extract Tech Specs / Features from expandable sections
        var techSpecsObj = { features: [], mechanical: [], exterior: [], interior: [], entertainment: [], safety: [] };

        // Helper to categorize items into techSpecsObj by section name
        function categorizeTechItems(sectionName, items) {
          var lower = sectionName.toLowerCase();
          if (lower.indexOf('mechanical') !== -1) techSpecsObj.mechanical = techSpecsObj.mechanical.concat(items);
          else if (lower.indexOf('exterior') !== -1) techSpecsObj.exterior = techSpecsObj.exterior.concat(items);
          else if (lower.indexOf('interior') !== -1) techSpecsObj.interior = techSpecsObj.interior.concat(items);
          else if (lower.indexOf('entertainment') !== -1 || lower.indexOf('media') !== -1 || lower.indexOf('audio') !== -1) techSpecsObj.entertainment = techSpecsObj.entertainment.concat(items);
          else if (lower.indexOf('safety') !== -1 || lower.indexOf('security') !== -1) techSpecsObj.safety = techSpecsObj.safety.concat(items);
          else if (lower.indexOf('feature') !== -1 || lower.indexOf('option') !== -1 || lower.indexOf('package') !== -1 || items.length > 0) {
            techSpecsObj.features = techSpecsObj.features.concat(items);
          }
        }

        // Helper to extract list items from a container
        function extractItemsFromContainer(container) {
          var items = [];
          var listItems = container.querySelectorAll('li, .feature-item, [class*="feature"], [class*="option"]');
          for (var xi = 0; xi < listItems.length; xi++) {
            var itemText = (listItems[xi].textContent || '').trim();
            if (itemText.length > 1 && itemText.length < 120) {
              items.push(itemText);
            }
          }
          return items;
        }

        // Strategy 1: Look for techspecs-tab sections
        var techSpecSections = document.querySelectorAll('.techspecs-tab, [class*="techspec"], [class*="tech-spec"], [class*="features-section"], [class*="options-section"]');
        for (var tsi = 0; tsi < techSpecSections.length; tsi++) {
          var section = techSpecSections[tsi];
          var sectionText = (section.querySelector('h2, h3, h4, .section-title, [class*="title"], [class*="header"]') || {}).textContent || '';
          var items = extractItemsFromContainer(section);
          if (items.length > 0) {
            categorizeTechItems(sectionText, items);
          }
        }

        // Strategy 2: Look for accordion/expandable feature lists (common on Olympic Hyundai)
        if (techSpecsObj.features.length === 0 && techSpecsObj.mechanical.length === 0) {
          var accordionSections = document.querySelectorAll('[class*="accordion"], [class*="collapsible"], [class*="expandable"], details, [x-data]');
          for (var asi = 0; asi < accordionSections.length; asi++) {
            var accSection = accordionSections[asi];
            var accTitle = (accSection.querySelector('button, summary, [class*="trigger"], [class*="header"], h3, h4') || {}).textContent || '';
            var accItems = extractItemsFromContainer(accSection);
            if (accItems.length > 0) {
              categorizeTechItems(accTitle, accItems);
            }
          }
        }

        // Strategy 3: Look for Alpine.js x-show/x-collapse hidden panels (Olympic Hyundai uses Alpine.js)
        if (techSpecsObj.features.length === 0 && techSpecsObj.mechanical.length === 0) {
          var alpinePanels = document.querySelectorAll('[x-show], [x-collapse], [x-transition]');
          for (var api = 0; api < alpinePanels.length; api++) {
            var panel = alpinePanels[api];
            // Find the section title from a preceding sibling or parent heading
            var panelParent = panel.parentElement;
            var panelTitle = '';
            if (panelParent) {
              var heading = panelParent.querySelector('h2, h3, h4, button, [class*="title"]');
              if (heading) panelTitle = heading.textContent || '';
            }
            var panelItems = extractItemsFromContainer(panel);
            if (panelItems.length > 0) {
              categorizeTechItems(panelTitle, panelItems);
            }
          }
        }

        // Strategy 4: Look for tab panels with Options/Tech Specs content
        if (techSpecsObj.features.length === 0 && techSpecsObj.mechanical.length === 0) {
          var tabPanels = document.querySelectorAll('[role="tabpanel"], .tab-pane, .tab-content > div, [class*="tab-panel"]');
          for (var tpi = 0; tpi < tabPanels.length; tpi++) {
            var tabPanel = tabPanels[tpi];
            // Find the heading within the panel
            var tabHeading = (tabPanel.querySelector('h2, h3, h4, [class*="title"]') || {}).textContent || '';
            var tabItems = extractItemsFromContainer(tabPanel);
            if (tabItems.length > 0) {
              categorizeTechItems(tabHeading, tabItems);
            }
          }
        }

        // Strategy 5: Look for any remaining sections with feature-like headings
        if (techSpecsObj.features.length === 0 && techSpecsObj.mechanical.length === 0) {
          var headings = document.querySelectorAll('h2, h3, h4');
          for (var hi = 0; hi < headings.length; hi++) {
            var hText = (headings[hi].textContent || '').toLowerCase().trim();
            if (hText.indexOf('option') !== -1 || hText.indexOf('feature') !== -1 || hText.indexOf('equipment') !== -1 ||
                hText.indexOf('tech spec') !== -1 || hText.indexOf('specification') !== -1) {
              // Collect items from the next sibling(s) until the next heading
              var nextEl = headings[hi].nextElementSibling;
              var sectionItems = [];
              while (nextEl && !nextEl.matches('h2, h3, h4')) {
                var nextItems = extractItemsFromContainer(nextEl);
                sectionItems = sectionItems.concat(nextItems);
                nextEl = nextEl.nextElementSibling;
              }
              if (sectionItems.length > 0) {
                categorizeTechItems(hText, sectionItems);
              }
            }
          }
        }

        // Determine if we have any tech specs data
        var hasTechSpecs = techSpecsObj.features.length > 0 || techSpecsObj.mechanical.length > 0 ||
                           techSpecsObj.exterior.length > 0 || techSpecsObj.interior.length > 0 ||
                           techSpecsObj.entertainment.length > 0 || techSpecsObj.safety.length > 0;
        var techSpecsJson = hasTechSpecs ? JSON.stringify(techSpecsObj) : null;

        return {
          vin: vin,
          price: price,
          odometer: odometer,
          rawOdometerKm: rawOdometerKm,
          isNewCondition: isNewCondition,
          images: images,
          trim: trim,
          description: description,
          stockNumber: stockNumber,
          pageText: pageText,
          // Extended VDP fields
          exteriorColor: exteriorColor,
          interiorColor: interiorColor,
          engine: engine,
          transmission: transmission,
          drivetrain: drivetrain,
          fuelType: fuelType,
          carfaxUrl: carfaxUrl,
          carfaxBadges: carfaxBadges,
          bodyStyle: bodyStyle,
          highlights: highlights,
          vdpDescription: vdpDescription,
          techSpecs: techSpecsJson,
          debug: {
            pageTitle: pageTitle,
            bodyLength: bodyLength,
            priceElExists: priceElExists,
            priceSource: priceSource,
            priceConfidence: priceConfidence,
            allImgs: allImgs,
            allPriceElements: allPriceElements,
            imgDebug: debugImgInfo.join(', ')
          }
        };
      })()`);
      
      // Log debug info to help diagnose extraction issues
      if (data.debug) {
        console.log(`    Debug: ${data.debug.bodyLength} chars, ${data.debug.allImgs} total imgs, price=$${data.price || 'null'}`);
      }
      
      // Use PRECISION IMAGE EXTRACTION for accurate vehicle photos
      let precisionImages: string[] = [];
      let imageQuality: 'excellent' | 'good' | 'fair' | 'poor' = 'poor';
      
      let hasVinMatchingImages = false;
      
      try {
        const extractionResult = await extractVehicleImages(page, data.vin, data.stockNumber);
        const { valid: validImages, suspicious, confidence, hasVinMatches, vinMatchCount } = validateImages(
          extractionResult.images,
          data.vin,
          data.stockNumber
        );
        
        hasVinMatchingImages = hasVinMatches;
        precisionImages = validImages.map(img => img.url);
        imageQuality = calculateImageQualityRating(precisionImages.length);
        
        console.log(`    Precision: ${precisionImages.length} valid, ${suspicious.length} filtered, VIN match: ${vinMatchCount} (${confidence})`);
        if (extractionResult.debug.gallerySelector) {
          console.log(`    Gallery: ${extractionResult.debug.gallerySelector} (${extractionResult.totalSlides} slides)`);
        }
        
        // If precision extraction returned zero valid images, fall back to legacy
        if (precisionImages.length === 0 && data.images.length > 0) {
          console.log(`    ⚠ No valid images after filtering, using legacy extraction`);
          precisionImages = data.images;
          hasVinMatchingImages = false;
        }
      } catch (precisionError) {
        console.log(`    ⚠ Precision extraction failed, using fallback: ${precisionError instanceof Error ? precisionError.message : String(precisionError)}`);
        precisionImages = data.images;
        imageQuality = calculateImageQualityRating(data.images.length);
      }
      
      // Detect badges and body type from page text
      // Use extracted bodyStyle from VDP if available, otherwise fall back to text heuristic
      const badges = detectBadges(data.pageText);
      const type = data.bodyStyle || determineBodyType(data.pageText);

      // Merge Carfax badges from VDP into detected badges
      const carfaxBadgeArray: string[] = data.carfaxBadges || [];
      for (const cb of carfaxBadgeArray) {
        if (cb === 'One Owner' && !badges.includes('One Owner')) badges.push('One Owner');
        if (cb === 'No Reported Accidents' && !badges.includes('No Accidents')) badges.push('No Accidents');
      }

      // Calculate data quality score with actual VIN match data
      const dataQualityScore = calculateDataQualityScore({
        vin: data.vin,
        price: data.price,
        odometer: data.odometer,
        imageCount: precisionImages.length,
        descriptionLength: data.description?.length || 0,
        hasVinMatchingImages: hasVinMatchingImages
      });

      // Log extended VDP fields
      if (data.exteriorColor || data.transmission || data.fuelType || data.carfaxUrl) {
        console.log(`    VDP Fields: color=${data.exteriorColor || 'N/A'}, trans=${data.transmission || 'N/A'}, fuel=${data.fuelType || 'N/A'}, dt=${data.drivetrain || 'N/A'}, carfax=${data.carfaxUrl ? 'yes' : 'no'}, badges=${carfaxBadgeArray.length}`);
      }

      // Don't close the page - we're reusing it for all VDPs

      return {
        vin: data.vin,
        price: data.price,
        odometer: data.odometer,
        rawOdometerKm: data.rawOdometerKm,
        isNewCondition: data.isNewCondition,
        images: precisionImages.length > 0 ? precisionImages : data.images,
        trim: data.trim,
        description: data.description,
        badges,
        type,
        stockNumber: data.stockNumber,
        imageQuality,
        dataQualityScore,
        // Extended VDP fields
        exteriorColor: data.exteriorColor || null,
        interiorColor: data.interiorColor || null,
        engine: data.engine || null,
        transmission: data.transmission || null,
        drivetrain: data.drivetrain || null,
        fuelType: data.fuelType || null,
        carfaxUrl: data.carfaxUrl || null,
        carfaxBadges: carfaxBadgeArray,
        bodyStyle: data.bodyStyle || null,
        highlights: data.highlights || null,
        vdpDescription: data.vdpDescription || null,
        techSpecs: data.techSpecs || null,
      };
    } catch (error) {
      console.log(`    ✗ VDP extraction error (attempt ${attempt + 1}): ${error instanceof Error ? error.message : String(error)}`);
      
      if (attempt < retries) {
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
        continue;
      }
      
      // Final attempt failed, return defaults
      console.log(`    ✗ VDP extraction failed after ${retries + 1} attempts`);
      return {
        vin: null,
        price: null,
        odometer: null,
        rawOdometerKm: null,
        isNewCondition: false,
        images: [],
        trim: 'Base',
        description: 'Used vehicle. Contact dealer for more information.',
        badges: [],
        type: 'SUV',
        stockNumber: null,
        imageQuality: 'poor' as const,
        dataQualityScore: 0,
        exteriorColor: null,
        interiorColor: null,
        engine: null,
        transmission: null,
        drivetrain: null,
        fuelType: null,
        carfaxUrl: null,
        carfaxBadges: [],
        bodyStyle: null,
        highlights: null,
        vdpDescription: null,
        techSpecs: null,
      };
    }
  }

  return {
    vin: null,
    price: null,
    odometer: null,
    rawOdometerKm: null,
    isNewCondition: false,
    images: [],
    trim: 'Base',
    description: 'Used vehicle. Contact dealer for more information.',
    badges: [],
    type: 'SUV',
    stockNumber: null,
    imageQuality: 'poor' as const,
    dataQualityScore: 0,
    exteriorColor: null,
    interiorColor: null,
    engine: null,
    transmission: null,
    drivetrain: null,
    fuelType: null,
    carfaxUrl: null,
    carfaxBadges: [],
    bodyStyle: null,
    highlights: null,
    vdpDescription: null,
    techSpecs: null,
  };
}

async function scrapeDealerListings(
  dealerConfig: DealerConfig,
  onVehicleScraped?: (vehicle: DealerVehicleListing) => Promise<void>
): Promise<DealerVehicleListing[]> {
  console.log(`\n[${dealerConfig.name}] Scraping dealer listing page...`);
  
  let chromiumPath = '';
  try {
    chromiumPath = execSync('which chromium').toString().trim();
  } catch {
    chromiumPath = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
  }

  // Get proxy if available
  const proxy = proxyManager.getNext();
  const launchOptions: any = {
    headless: true,
    executablePath: chromiumPath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled'
    ],
  };

  // Add proxy args if configured
  if (proxy) {
    launchOptions.args.push(`--proxy-server=${proxy.server}`);
    console.log(`  Using proxy: ${proxy.server}`);
  }

  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();
  
  // Authenticate proxy if needed
  if (proxy) {
    await proxyManager.authenticateProxy(page, proxy);
  }
  
  // Generate and apply random fingerprint
  const fingerprint = generateRandomFingerprint();
  await applyFingerprint(page, fingerprint);
  console.log(`  Applied fingerprint: ${fingerprint.viewport.width}x${fingerprint.viewport.height}`);
  
  // Try to load saved cookies
  const savedCookies = await cookieStore.loadCookies(dealerConfig.domain);
  if (savedCookies) {
    await page.setCookie(...savedCookies);
    console.log(`  ✓ Loaded saved cf_clearance cookies`);
  }
  
  // Add human-like delay before navigation
  await randomDelay(500, 1500);
  
  // Declare vehicles array outside try block so we can return partial results on error
  let vehicles: DealerVehicleListing[] = [];
  
  try {
    const response = await page.goto(dealerConfig.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    console.log(`  Waiting for vehicle listings to load...`);
    console.log(`  Response status: ${response?.status()}, url: ${response?.url()}`);
    
    // Check for Cloudflare challenge page
    const isChallenged = await isCloudflareChallenge(page);
    if (isChallenged) {
      console.log('  ⚠ Cloudflare challenge detected - waiting for automatic solve...');
      console.log('  This may take up to 60 seconds...');
      
      // Wait up to 60 seconds for Cloudflare challenge to resolve
      let attempts = 0;
      const maxAttempts = 60;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if challenge is solved by looking for vehicle content
        try {
          const hasVehicles = await page.evaluate(() => {
            return document.querySelectorAll('a[href*="/vehicles/2"]').length > 0;
          });
          
          if (hasVehicles) {
            console.log(`  ✓ Cloudflare challenge solved automatically after ${attempts + 1} seconds!`);
            
            // Save new cookies
            const cookies = await page.cookies();
            await cookieStore.saveCookies(dealerConfig.domain, cookies);
            break;
          }
        } catch (err) {
          // Continue waiting
        }
        
        // Also check if page content changed
        const stillChallenged = await isCloudflareChallenge(page);
        if (!stillChallenged) {
          console.log(`  ✓ Challenge page cleared after ${attempts + 1} seconds (checking for content...)`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          break;
        }
        
        attempts++;
        
        if (attempts % 10 === 0) {
          console.log(`    Still waiting... (${attempts}/${maxAttempts}s)`);
        }
      }
      
      if (attempts >= maxAttempts) {
        // Save screenshot for debugging
        try {
          await page.screenshot({ path: '/tmp/cloudflare-blocked.png', fullPage: false });
          console.log('  Screenshot saved to /tmp/cloudflare-blocked.png');
        } catch (err) {
          // Ignore screenshot errors
        }
        throw new Error('Cloudflare challenge did not resolve after 60 seconds');
      }
    }
    
    // Human-like behavior: scroll before interacting
    await randomDelay(500, 1000);
    await humanLikeScroll(page);
    
    // Wait for vehicle links to appear with retry
    console.log('  Looking for vehicle listings...');
    let vehicleLinksFound = false;
    for (let retry = 0; retry < 3; retry++) {
      try {
        await page.waitForSelector('a[href*="/vehicles/2"]', { timeout: 10000 });
        vehicleLinksFound = true;
        console.log('  ✓ Vehicle listings loaded successfully');
        break;
      } catch (err) {
        console.log(`  Retry ${retry + 1}/3: Vehicle links not found yet...`);
        await randomDelay(2000, 3000);
      }
    }
    
    if (!vehicleLinksFound) {
      throw new Error('Vehicle listings failed to load after multiple retries');
    }
    
    // Give page a moment to fully render
    await page.waitForFunction(
      () => document.querySelectorAll('a[href*="/vehicles/2"]').length > 0,
      { timeout: 10000 }
    );

    // Infinite scroll to load ALL vehicles
    console.log(`  Scrolling to load all vehicles...`);
    let previousCount = 0;
    let stableCount = 0;
    
    for (let i = 0; i < 30; i++) { // Max 30 scrolls
      // Scroll to bottom
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      // Wait for new content to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if new vehicles loaded
      const currentCount = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="/vehicles/2"]').length;
      });
      
      console.log(`    Scroll ${i + 1}: Found ${currentCount} vehicle links`);
      
      if (currentCount === previousCount) {
        stableCount++;
        if (stableCount >= 3) {
          console.log(`    ✓ No new vehicles after 3 scrolls, stopping.`);
          break;
        }
      } else {
        stableCount = 0;
      }
      
      previousCount = currentCount;
    }

    console.log(`  Extracting VDP URLs...`);
    
    const vdpUrls = await page.evaluate(function(baseUrl) {
      var results: Array<{vdpUrl: string; year: number; make: string; model: string}> = [];
      var processedUrls: Record<string, boolean> = {};
      
      // Find all vehicle detail page links
      var links = document.querySelectorAll('a[href*="/vehicles/2"]');
      
      for (var i = 0; i < links.length; i++) {
        var link = links[i];
        var href = link.getAttribute('href');
        if (!href) continue;
        
        // Filter for actual VDP URLs: /vehicles/{year}/{make}/{model}/{city}/{province}/{ID}/
        var match = href.match(/\/vehicles\/(\d{4})\/([a-z-]+)\/([a-z0-9-]+)\/([a-z-]+)\/([a-z]+)\/(\d+)\//i);
        if (!match) continue;
        
        var fullUrl = href.indexOf('http') === 0 ? href : 'https://' + baseUrl + href;
        
        if (processedUrls[fullUrl]) continue;
        processedUrls[fullUrl] = true;
        
        // Extract year, make, model from URL
        var year = parseInt(match[1]);
        var makeParts = match[2].split('-');
        var make = '';
        for (var j = 0; j < makeParts.length; j++) {
          if (j > 0) make += ' ';
          make += makeParts[j].charAt(0).toUpperCase() + makeParts[j].slice(1);
        }
        var modelParts = match[3].split('-');
        var model = '';
        for (var k = 0; k < modelParts.length; k++) {
          if (k > 0) model += ' ';
          model += modelParts[k].charAt(0).toUpperCase() + modelParts[k].slice(1);
        }
        
        results.push({ vdpUrl: fullUrl, year: year, make: make, model: model });
      }
      
      return results;
    }, dealerConfig.domain);

    console.log(`  ✓ Found ${vdpUrls.length} VDP URLs, now extracting VIN/price/odometer...`);
    
    // Visit each VDP to extract complete vehicle data (vehicles array declared outside try block)
    
    // Track current page - will be refreshed periodically to prevent detached frame errors
    let currentVdpPage = page;
    
    // Initialize backup cookies from the page that already passed Cloudflare
    let savedCookiesBackup: any[] = [];
    try {
      savedCookiesBackup = await page.cookies();
      console.log(`  ✓ Initialized cookie backup with ${savedCookiesBackup.length} cookies`);
    } catch (e) {
      console.log(`  ⚠ Could not get initial cookies for backup`);
    }
    const PAGE_REFRESH_INTERVAL = 5; // REDUCED from 10 to 5 for more stability
    
    console.log(`  Processing ${vdpUrls.length} vehicles (refreshing page every ${PAGE_REFRESH_INTERVAL} vehicles)...`);
    
    // Helper function to safely refresh the page
    async function refreshPage(reason: string): Promise<void> {
      console.log(`    🔄 ${reason}`);
      
      // Try to get cookies from current page, use backup if failed
      let cookiesToRestore = savedCookiesBackup;
      try {
        cookiesToRestore = await currentVdpPage.cookies();
        savedCookiesBackup = cookiesToRestore; // Update backup
      } catch (e) {
        console.log(`    ⚠ Could not get cookies from current page, using backup (${savedCookiesBackup.length} cookies)`);
      }
      
      // Close old page (ignore errors if already closed)
      try {
        await currentVdpPage.close();
      } catch (e) {
        // Page may already be closed
      }
      
      // Create fresh page
      currentVdpPage = await browser.newPage();
      
      // Restore cookies and fingerprint
      if (cookiesToRestore.length > 0) {
        await currentVdpPage.setCookie(...cookiesToRestore);
      }
      await applyFingerprint(currentVdpPage, fingerprint);
      
      console.log(`    ✓ Page refreshed with ${cookiesToRestore.length} cookies preserved`);
    }
    
    for (let i = 0; i < vdpUrls.length; i++) {
      const urlData = vdpUrls[i];
      console.log(`  [${i + 1}/${vdpUrls.length}] Scraping ${urlData.year} ${urlData.make} ${urlData.model}...`);
      
      // Refresh page every PAGE_REFRESH_INTERVAL vehicles to prevent frame detachment
      if (i > 0 && i % PAGE_REFRESH_INTERVAL === 0) {
        await refreshPage(`Preventive refresh (processed ${i} vehicles)...`);
      }
      
      // Pass the current page with frame detachment recovery
      let detailData: VehicleDetailData;
      try {
        detailData = await scrapeVehicleDetailPage(currentVdpPage, urlData.vdpUrl);
        
        // If scrape returned empty (all retries failed), try emergency refresh
        if (!detailData.price && detailData.images.length === 0 && !detailData.vin) {
          console.log(`    ⚠ Empty result - attempting emergency page refresh...`);
          await refreshPage('Emergency recovery from failed scrape');
          detailData = await scrapeVehicleDetailPage(currentVdpPage, urlData.vdpUrl);
        }
      } catch (pageError: any) {
        // Detect frame detachment and recover
        if (pageError?.message?.includes('detached') || pageError?.message?.includes('Session closed')) {
          console.log(`    ⚠ Frame detachment detected - emergency page refresh...`);
          await refreshPage('Emergency recovery from frame detachment');
          detailData = await scrapeVehicleDetailPage(currentVdpPage, urlData.vdpUrl);
        } else {
          throw pageError;
        }
      }
      
      // FILTER: Skip new vehicles (very low odometer, next year models, or explicit "New" condition)
      // This prevents new cars from being added to used car inventory
      // If we're scraping from a /used/ or /preowned/ page, trust the dealership's classification
      const lowerUrl = dealerConfig.url.toLowerCase();
      const scrapingUsedInventory = lowerUrl.includes('/used') || lowerUrl.includes('/preowned') || lowerUrl.includes('sc=used');
      if (isLikelyNewVehicle(urlData.year, detailData.odometer, detailData.rawOdometerKm, detailData.isNewCondition, scrapingUsedInventory)) {
        console.log(`    ❌ SKIPPING: ${urlData.year} ${urlData.make} ${urlData.model} - appears to be a NEW vehicle, not used`);
        // Human-like delay before continuing to next
        await randomDelay(400, 800);
        continue; // Skip this vehicle
      }
      
      // Recalculate badges with year and odometer for accurate Low Kilometers detection
      // (12,000 km per year threshold)
      const recalculatedBadges = detectBadges(
        detailData.description || '',
        urlData.year,
        detailData.odometer || undefined
      );
      // Merge with any existing badges from VDP that we didn't detect
      const existingBadges = detailData.badges.filter(b => !recalculatedBadges.includes(b) && b !== 'Low Kilometers');
      const finalBadges = [...recalculatedBadges, ...existingBadges];
      
      const vehicleData: DealerVehicleListing = {
        vin: detailData.vin,
        year: urlData.year,
        make: urlData.make,
        model: urlData.model,
        trim: detailData.trim,
        odometer: detailData.odometer,
        price: detailData.price,
        images: detailData.images,
        description: detailData.description,
        badges: finalBadges,
        type: detailData.type,
        stockNumber: detailData.stockNumber,
        vdpUrl: urlData.vdpUrl,
        dealershipId: dealerConfig.dealershipId,
        dealershipName: dealerConfig.name,
        location: dealerConfig.location,
        imageQuality: detailData.imageQuality,
        dataQualityScore: detailData.dataQualityScore,
        // Extended VDP fields
        exteriorColor: detailData.exteriorColor,
        interiorColor: detailData.interiorColor,
        transmission: detailData.transmission,
        drivetrain: detailData.drivetrain,
        fuelType: detailData.fuelType,
        carfaxUrl: detailData.carfaxUrl,
        carfaxBadges: detailData.carfaxBadges,
        techSpecs: detailData.techSpecs,
        highlights: detailData.highlights,
        vdpDescription: detailData.vdpDescription,
      };

      vehicles.push(vehicleData);

      console.log(`    ✓ ${detailData.images.length} photos (${detailData.imageQuality}), Quality: ${detailData.dataQualityScore}/100, Price: $${detailData.price || 'N/A'}`);
      
      // Call the callback to save immediately if provided (incremental saving)
      if (onVehicleScraped) {
        try {
          await onVehicleScraped(vehicleData);
        } catch (saveError) {
          console.error(`    ⚠ Failed to save vehicle immediately:`, saveError);
        }
      }
      
      // Human-like delay between requests (randomized)
      await randomDelay(800, 1500);
    }
    
    console.log(`  ✓ Successfully scraped ${vehicles.length} vehicles from ${dealerConfig.name}`);
    
    // Clean up (vdpPage is the same as page, just close the browser)
    try {
      await browser.close();
    } catch (e) {
      // Browser may already be closed
    }
    return vehicles;
    
  } catch (error) {
    console.error(`  ✗ Error scraping ${dealerConfig.name}:`, error);
    
    // IMPORTANT: Return partial results if we have any
    // This prevents losing 25+ successfully scraped vehicles if the browser crashes
    if (vehicles && vehicles.length > 0) {
      console.log(`  ⚠ Returning ${vehicles.length} partial results despite error`);
      try {
        await browser.close();
      } catch (e) {
        // Browser may already be closed
      }
      return vehicles;
    }
    
    try {
      await browser.close();
    } catch (e) {
      // Browser may already be closed
    }
    return [];
  }
}

export async function scrapeAllDealerListings(dealershipId?: number): Promise<DealerVehicleListing[]> {
  console.log('\n=== SCRAPING DEALER LISTING PAGES ===');
  
  const allListings: DealerVehicleListing[] = [];
  
  // Get configs from database instead of hardcoded values
  const dealerConfigs = await getDealerConfigsFromDb(dealershipId);
  if (dealerConfigs.length === 0) {
    console.warn(`  ⚠ No active scrape sources found${dealershipId ? ` for dealership ${dealershipId}` : ''}`);
    return [];
  }
  console.log(`  Found ${dealerConfigs.length} active scrape sources in database${dealershipId ? ` (dealership ${dealershipId})` : ''}`);
  
  for (const config of dealerConfigs) {
    try {
      const listings = await scrapeDealerListings(config);
      allListings.push(...listings);
    } catch (error) {
      console.error(`Failed to scrape ${config.name}:`, error);
    }
  }
  
  console.log(`\n✓ Total dealer listings scraped: ${allListings.length}\n`);
  
  return allListings;
}

// Callback-based version that saves each vehicle immediately after scraping
// This prevents data loss when the scraper is interrupted
export type VehicleSaveCallback = (vehicle: DealerVehicleListing) => Promise<{ action: 'inserted' | 'updated', id: number }>;

export async function scrapeDealerListingsWithCallback(
  onVehicleSaved: VehicleSaveCallback,
  dealershipId?: number
): Promise<{ total: number; inserted: number; updated: number }> {
  console.log('\n=== SCRAPING DEALER LISTING PAGES (TRUE INCREMENTAL SAVE) ===');
  
  let totalCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  
  // Get configs from database instead of hardcoded values
  const dealerConfigs = await getDealerConfigsFromDb(dealershipId);
  if (dealerConfigs.length === 0) {
    console.warn(`  ⚠ No active scrape sources found${dealershipId ? ` for dealership ${dealershipId}` : ''}`);
    return { total: 0, inserted: 0, updated: 0 };
  }
  console.log(`  Found ${dealerConfigs.length} active scrape sources in database${dealershipId ? ` (dealership ${dealershipId})` : ''}`);
  
  for (const config of dealerConfigs) {
    console.log(`\n[${config.name}] Starting incremental scrape (dealershipId: ${config.dealershipId})...`);
    
    try {
      // Use the callback to save each vehicle IMMEDIATELY as it's scraped
      const onVehicleScraped = async (vehicle: DealerVehicleListing) => {
        try {
          const result = await onVehicleSaved(vehicle);
          totalCount++;
          if (result.action === 'inserted') {
            insertedCount++;
          } else {
            updatedCount++;
          }
          console.log(`    💾 ${result.action === 'inserted' ? 'NEW' : 'UPDATED'}: ${vehicle.year} ${vehicle.make} ${vehicle.model} (ID: ${result.id})`);
        } catch (saveError) {
          console.error(`    ✗ Failed to save ${vehicle.year} ${vehicle.make} ${vehicle.model}:`, saveError);
        }
      };
      
      // This now calls onVehicleScraped after each vehicle is scraped (truly incremental)
      const listings = await scrapeDealerListings(config, onVehicleScraped);
      
      console.log(`  ✓ ${config.name}: ${listings.length} vehicles scraped and saved`);
    } catch (error) {
      console.error(`Failed to scrape ${config.name}:`, error);
      console.log(`  ⚠ Partial results may have been saved before the error`);
    }
  }
  
  console.log(`\n✓ TRUE INCREMENTAL scrape complete: ${totalCount} total (${insertedCount} new, ${updatedCount} updated)\n`);
  
  return { total: totalCount, inserted: insertedCount, updated: updatedCount };
}

// ====== CHECKPOINTED SCRAPING (Save progress every 5 vehicles) ======

export interface CheckpointedScrapeResult {
  total: number;
  inserted: number;
  updated: number;
  resumed: boolean;
  scrapeRunId: number;
}

/**
 * Extract VDP URLs from a dealer listing page without scraping details.
 * This is used to populate the queue first.
 */
async function extractVdpUrlsOnly(dealerConfig: DealerConfig): Promise<Array<{ vdpUrl: string; vehicleTitle: string }>> {
  console.log(`[${dealerConfig.name}] Extracting VDP URLs from listing page...`);
  
  const fingerprint = generateRandomFingerprint();
  const proxy = proxyManager.getNext();
  
  console.log(`  Applied fingerprint: ${fingerprint.viewport.width}x${fingerprint.viewport.height}`);
  
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      ...(proxy ? [`--proxy-server=${proxy.server}`] : []),
      `--window-size=${fingerprint.viewport.width},${fingerprint.viewport.height}`
    ],
    defaultViewport: fingerprint.viewport
  });
  
  try {
    const page = await browser.newPage();
    await applyFingerprint(page, fingerprint);
    
    // Load existing cookies if available
    const savedCookies = await cookieStore.loadCookies(dealerConfig.domain);
    if (savedCookies && savedCookies.length > 0) {
      try {
        await page.setCookie(...savedCookies);
      } catch (e) {}
    } else {
      console.log(`⚠ No cf_clearance cookie found for ${dealerConfig.domain}`);
    }
    
    const response = await page.goto(dealerConfig.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log(`  Response status: ${response?.status()}, url: ${response?.url()}`);
    
    // Handle Cloudflare challenge
    const isChallenged = await isCloudflareChallenge(page);
    if (isChallenged) {
      console.log('  ⚠ Cloudflare challenge detected - waiting for automatic solve...');
      let attempts = 0;
      const maxAttempts = 60;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          const hasVehicles = await page.evaluate(() => {
            return document.querySelectorAll('a[href*="/vehicles/2"]').length > 0;
          });
          if (hasVehicles) {
            console.log(`  ✓ Cloudflare challenge solved after ${attempts + 1} seconds!`);
            const cookies = await page.cookies();
            await cookieStore.saveCookies(dealerConfig.domain, cookies);
            break;
          }
        } catch (err) {}
        
        const stillChallenged = await isCloudflareChallenge(page);
        if (!stillChallenged) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          break;
        }
        attempts++;
      }
      
      if (attempts >= maxAttempts) {
        console.log('  ⚠ Local Puppeteer failed to bypass Cloudflare. Trying Browserless /unblock API...');
        await browser.close();
        
        const browserlessService = new BrowserlessUnifiedService();
        const unblockResult = await browserlessService.unblockAndGetContent(dealerConfig.url, true);
        
        if (unblockResult.success && unblockResult.content) {
          console.log('  ✓ Browserless /unblock API successfully bypassed Cloudflare!');
          
          if (unblockResult.cookies) {
            const puppeteerCookies = unblockResult.cookies.map(c => ({
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: '/',
              expires: Date.now() / 1000 + 86400,
              httpOnly: false,
              secure: true,
              sameSite: 'Lax' as const,
            }));
            await cookieStore.saveCookies(dealerConfig.domain, puppeteerCookies);
          }
          
          const $ = cheerio.load(unblockResult.content);
          const results: Array<{ vdpUrl: string; vehicleTitle: string }> = [];
          const processedUrls: Record<string, boolean> = {};
          
          $('a[href*="/vehicles/2"]').each((_, elem) => {
            const href = $(elem).attr('href');
            if (href && !href.includes('#') && !processedUrls[href]) {
              processedUrls[href] = true;
              const fullUrl = href.startsWith('http') ? href : `https://${dealerConfig.domain}${href}`;
              const title = $(elem).text().trim() || 'Unknown Vehicle';
              results.push({ vdpUrl: fullUrl, vehicleTitle: title.substring(0, 100) });
            }
          });
          
          console.log(`  ✓ Extracted ${results.length} VDP URLs via /unblock API`);
          return results;
        } else {
          // Browserless failed, try ZenRows as next fallback
          console.log('  ⚠ Browserless /unblock API failed. Trying ZenRows API for Cloudflare bypass...');
          
          if (browserlessService.isZenRowsConfigured()) {
            const zenRowsResult = await browserlessService.zenRowsScrape(dealerConfig.url, { scrollToBottom: true });
            
            if (zenRowsResult.success && zenRowsResult.html) {
              console.log('  ✓ ZenRows API successfully bypassed Cloudflare!');
              
              const $z = cheerio.load(zenRowsResult.html);
              const zenResults: Array<{ vdpUrl: string; vehicleTitle: string }> = [];
              const processedZenUrls: Record<string, boolean> = {};
              
              $z('a[href*="/vehicles/2"]').each((_, elem) => {
                const href = $z(elem).attr('href');
                if (href && !href.includes('#') && !processedZenUrls[href]) {
                  processedZenUrls[href] = true;
                  const fullUrl = href.startsWith('http') ? href : `https://${dealerConfig.domain}${href}`;
                  const title = $z(elem).text().trim() || 'Unknown Vehicle';
                  zenResults.push({ vdpUrl: fullUrl, vehicleTitle: title.substring(0, 100) });
                }
              });
              
              console.log(`  ✓ Extracted ${zenResults.length} VDP URLs via ZenRows API`);
              return zenResults;
            }
            console.log(`  ⚠ ZenRows failed: ${zenRowsResult.error || 'Unknown error'}`);
          }
          
          // Try Zyte as next fallback
          console.log('  ⚠ Trying Zyte API for Cloudflare bypass...');
          
          if (browserlessService.isZyteConfigured()) {
            const zyteResult = await browserlessService.zyteScrape(dealerConfig.url, { scrollToBottom: true });
            
            if (zyteResult.success && zyteResult.html) {
              console.log('  ✓ Zyte API successfully bypassed Cloudflare!');
              
              const $zy = cheerio.load(zyteResult.html);
              const zyteResults: Array<{ vdpUrl: string; vehicleTitle: string }> = [];
              const processedZyteUrls: Record<string, boolean> = {};
              
              $zy('a[href*="/vehicles/2"]').each((_, elem) => {
                const href = $zy(elem).attr('href');
                if (href && !href.includes('#') && !processedZyteUrls[href]) {
                  processedZyteUrls[href] = true;
                  const fullUrl = href.startsWith('http') ? href : `https://${dealerConfig.domain}${href}`;
                  const title = $zy(elem).text().trim() || 'Unknown Vehicle';
                  zyteResults.push({ vdpUrl: fullUrl, vehicleTitle: title.substring(0, 100) });
                }
              });
              
              console.log(`  ✓ Extracted ${zyteResults.length} VDP URLs via Zyte API`);
              return zyteResults;
            }
            console.log(`  ⚠ Zyte failed: ${zyteResult.error || 'Unknown error'}`);
          }
          
          // Try ScrapingBee as final fallback
          console.log('  ⚠ Trying ScrapingBee API as final Cloudflare bypass fallback...');
          
          if (browserlessService.isScrapingBeeConfigured()) {
            const scrapingBeeResult = await browserlessService.scrapingBeeScrape(dealerConfig.url, { scrollToBottom: true });
            
            if (scrapingBeeResult.success && scrapingBeeResult.html) {
              console.log('  ✓ ScrapingBee API successfully bypassed Cloudflare!');
              
              const $sb = cheerio.load(scrapingBeeResult.html);
              const sbResults: Array<{ vdpUrl: string; vehicleTitle: string }> = [];
              const processedSbUrls: Record<string, boolean> = {};
              
              $sb('a[href*="/vehicles/2"]').each((_, elem) => {
                const href = $sb(elem).attr('href');
                if (href && !href.includes('#') && !processedSbUrls[href]) {
                  processedSbUrls[href] = true;
                  const fullUrl = href.startsWith('http') ? href : `https://${dealerConfig.domain}${href}`;
                  const title = $sb(elem).text().trim() || 'Unknown Vehicle';
                  sbResults.push({ vdpUrl: fullUrl, vehicleTitle: title.substring(0, 100) });
                }
              });
              
              console.log(`  ✓ Extracted ${sbResults.length} VDP URLs via ScrapingBee API`);
              return sbResults;
            }
            console.log(`  ⚠ ScrapingBee failed: ${scrapingBeeResult.error || 'Unknown error'}`);
          }
          
          throw new Error(`All Cloudflare bypass methods failed (Browserless, ZenRows, Zyte, ScrapingBee)`);
        }
      }
    }
    
    // Scroll to load all vehicles
    await humanLikeScroll(page);
    await randomDelay(500, 1000);
    
    // Wait for vehicle links - with enhanced logging
    try {
      await page.waitForSelector('a[href*="/vehicles/2"]', { timeout: 10000 });
      console.log(`  ✓ Found vehicle links on page`);
    } catch (selectorError) {
      // Log page content for debugging
      const pageTitle = await page.title();
      const pageContent = await page.content();
      const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || 'No body text');
      console.error(`  ✗ No vehicle links found on page`);
      console.error(`    Page title: ${pageTitle}`);
      console.error(`    Body preview: ${bodyText}`);
      console.error(`    Page HTML length: ${pageContent.length} chars`);
      
      // Check for common blocking patterns
      const isBlocked = pageContent.includes('Access Denied') || 
                        pageContent.includes('blocked') || 
                        pageContent.includes('Cloudflare') ||
                        pageContent.includes('Please Wait');
      if (isBlocked) {
        console.error(`    ⚠ Detected blocking pattern in page content`);
      }
      
      throw new Error(`Vehicle selector timeout - no vehicles found. Title: ${pageTitle}`);
    }
    
    // Infinite scroll to load ALL vehicles
    console.log(`  Scrolling to load all vehicles...`);
    let previousCount = 0;
    let stableCount = 0;
    
    for (let i = 0; i < 30; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const currentCount = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="/vehicles/2"]').length;
      });
      
      if (currentCount === previousCount) {
        stableCount++;
        if (stableCount >= 3) break;
      } else {
        stableCount = 0;
      }
      previousCount = currentCount;
    }
    
    // Extract VDP URLs
    const vdpUrls = await page.evaluate(function(baseUrl) {
      var results: Array<{ vdpUrl: string; vehicleTitle: string }> = [];
      var processedUrls: Record<string, boolean> = {};
      var links = document.querySelectorAll('a[href*="/vehicles/2"]');
      
      for (var i = 0; i < links.length; i++) {
        var link = links[i];
        var href = link.getAttribute('href');
        if (!href) continue;
        
        var match = href.match(/\/vehicles\/(\d{4})\/([a-z-]+)\/([a-z0-9-]+)\/([a-z-]+)\/([a-z]+)\/(\d+)\//i);
        if (!match) continue;
        
        var fullUrl = href.indexOf('http') === 0 ? href : 'https://' + baseUrl + href;
        if (processedUrls[fullUrl]) continue;
        processedUrls[fullUrl] = true;
        
        var year = match[1];
        var makeParts = match[2].split('-');
        var make = makeParts.map(function(p: string) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(' ');
        var modelParts = match[3].split('-');
        var model = modelParts.map(function(p: string) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(' ');
        
        results.push({ vdpUrl: fullUrl, vehicleTitle: year + ' ' + make + ' ' + model });
      }
      
      return results;
    }, dealerConfig.domain);
    
    console.log(`  ✓ Found ${vdpUrls.length} VDP URLs`);
    
    await browser.close();
    return vdpUrls;
    
  } catch (error) {
    console.error(`  ✗ Error extracting VDP URLs:`, error);
    try { await browser.close(); } catch (e) {}
    return [];
  }
}

/**
 * Checkpointed scraping with queue-based progress tracking.
 * - First extracts all VDP URLs and saves to queue
 * - Processes in batches of 5, checkpointing each vehicle
 * - Supports resuming from incomplete queue
 */
export async function scrapeDealerListingsCheckpointed(
  onVehicleSaved: VehicleSaveCallback,
  scrapeRunId?: number,
  dealershipId?: number
): Promise<CheckpointedScrapeResult> {
  console.log('\n=== CHECKPOINTED SCRAPING (Saves progress every 5 vehicles) ===');
  
  let totalCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let resumed = false;
  let currentScrapeRunId = scrapeRunId || 0;
  
  // Get configs from database
  const dealerConfigs = await getDealerConfigsFromDb(dealershipId);
  if (dealerConfigs.length === 0) {
    console.warn(`  ⚠ No active scrape sources found${dealershipId ? ` for dealership ${dealershipId}` : ''}`);
    return { total: 0, inserted: 0, updated: 0, resumed: false, scrapeRunId: currentScrapeRunId };
  }
  console.log(`  Found ${dealerConfigs.length} active scrape sources${dealershipId ? ` (dealership ${dealershipId})` : ''}`);
  
  const CHECKPOINT_INTERVAL = 5; // Save checkpoint every 5 vehicles
  
  for (const config of dealerConfigs) {
    console.log(`\n[${config.name}] Starting checkpointed scrape (dealershipId: ${config.dealershipId})...`);
    
    try {
      // Check for incomplete queue from a previous run
      const incompleteQueue = await storage.getIncompleteScrapeQueue(config.dealershipId);
      
      let queueItems: ScrapeQueue[] = [];
      
      if (incompleteQueue && incompleteQueue.items.length > 0) {
        // Resume from previous incomplete run
        console.log(`  📋 Resuming from previous run (${incompleteQueue.items.length} vehicles remaining)`);
        queueItems = incompleteQueue.items;
        currentScrapeRunId = incompleteQueue.scrapeRunId;
        resumed = true;
      } else {
        // Fresh start - extract VDP URLs and populate queue
        console.log(`  📋 Fresh scrape - extracting VDP URLs first...`);
        console.log(`  📍 Target URL: ${config.url}`);
        console.log(`  🌐 Domain: ${config.domain}`);
        
        const vdpUrls = await extractVdpUrlsOnly(config);
        
        if (vdpUrls.length === 0) {
          console.error(`  ✗ CRITICAL: No VDP URLs found for ${config.name}`);
          console.error(`    This may indicate:`);
          console.error(`    - Cloudflare blocking (check cf_clearance cookie)`);
          console.error(`    - Website structure changed`);
          console.error(`    - Network/connectivity issue`);
          continue;
        }
        
        // Create queue entries
        const queueEntries: InsertScrapeQueue[] = vdpUrls.map((url, index) => ({
          scrapeRunId: currentScrapeRunId || null,
          dealershipId: config.dealershipId,
          vdpUrl: url.vdpUrl,
          vehicleTitle: url.vehicleTitle,
          position: index + 1,
          status: "pending" as const,
        }));
        
        // Batch insert queue entries
        queueItems = await storage.createScrapeQueueBatch(queueEntries);
        console.log(`  ✓ Queued ${queueItems.length} vehicles for processing`);
      }
      
      // Process queue items in batches
      const fingerprint = generateRandomFingerprint();
      console.log(`  Applied fingerprint: ${fingerprint.viewport.width}x${fingerprint.viewport.height}`);
      
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
          `--window-size=${fingerprint.viewport.width},${fingerprint.viewport.height}`
        ],
        defaultViewport: fingerprint.viewport
      });
      
      let page = await browser.newPage();
      await applyFingerprint(page, fingerprint);
      
      // Load cookies
      const savedCookies = await cookieStore.loadCookies(config.domain);
      if (savedCookies && savedCookies.length > 0) {
        try { await page.setCookie(...savedCookies); } catch (e) {}
      }
      
      let savedCookiesBackup = savedCookies || [];
      let processedInBatch = 0;
      
      // Helper to refresh page
      const refreshPage = async (reason: string) => {
        console.log(`    🔄 ${reason}`);
        try {
          savedCookiesBackup = await page.cookies();
        } catch (e) {}
        try { await page.close(); } catch (e) {}
        page = await browser.newPage();
        if (savedCookiesBackup.length > 0) {
          await page.setCookie(...savedCookiesBackup);
        }
        await applyFingerprint(page, fingerprint);
        console.log(`    ✓ Page refreshed with ${savedCookiesBackup.length} cookies preserved`);
      };
      
      console.log(`  Processing ${queueItems.length} vehicles (checkpoint every ${CHECKPOINT_INTERVAL})...`);
      
      for (let i = 0; i < queueItems.length; i++) {
        const queueItem = queueItems[i];
        console.log(`  [${i + 1}/${queueItems.length}] ${queueItem.vehicleTitle}...`);
        
        // Mark as processing
        await storage.updateScrapeQueueItem(queueItem.id, { status: "processing" });
        
        // Refresh page periodically
        if (processedInBatch > 0 && processedInBatch % CHECKPOINT_INTERVAL === 0) {
          await refreshPage(`Checkpoint refresh (processed ${processedInBatch} vehicles)`);
        }
        
        try {
          // Extract vehicle data
          const detailData = await scrapeVehicleDetailPage(page, queueItem.vdpUrl);
          
          // Parse year/make/model from title
          const titleParts = (queueItem.vehicleTitle || '').split(' ');
          const year = parseInt(titleParts[0]) || 2024;
          const make = titleParts[1] || '';
          const model = titleParts.slice(2).join(' ') || '';
          
          // Check if new vehicle (skip if so)
          const lowerUrl = config.url.toLowerCase();
          const scrapingUsedInventory = lowerUrl.includes('/used') || lowerUrl.includes('/preowned');
          if (isLikelyNewVehicle(year, detailData.odometer, detailData.rawOdometerKm, detailData.isNewCondition, scrapingUsedInventory)) {
            console.log(`    ❌ SKIPPING: appears to be a NEW vehicle`);
            await storage.markScrapeQueueCompleted(queueItem.id, 0);
            continue;
          }
          
          // Build vehicle data
          const recalculatedBadges = detectBadges(detailData.description || '', year, detailData.odometer || undefined);
          const existingBadges = detailData.badges.filter(b => !recalculatedBadges.includes(b) && b !== 'Low Kilometers');
          const finalBadges = [...recalculatedBadges, ...existingBadges];
          
          const vehicleData: DealerVehicleListing = {
            vin: detailData.vin,
            year,
            make,
            model,
            trim: detailData.trim,
            odometer: detailData.odometer,
            price: detailData.price,
            images: detailData.images,
            description: detailData.description,
            badges: finalBadges,
            type: detailData.type,
            stockNumber: detailData.stockNumber,
            vdpUrl: queueItem.vdpUrl,
            dealershipId: config.dealershipId,
            dealershipName: config.name,
            location: config.location,
            imageQuality: detailData.imageQuality,
            dataQualityScore: detailData.dataQualityScore,
            // Extended VDP fields
            exteriorColor: detailData.exteriorColor,
            interiorColor: detailData.interiorColor,
            transmission: detailData.transmission,
            drivetrain: detailData.drivetrain,
            fuelType: detailData.fuelType,
            carfaxUrl: detailData.carfaxUrl,
            carfaxBadges: detailData.carfaxBadges,
            techSpecs: detailData.techSpecs,
            highlights: detailData.highlights,
            vdpDescription: detailData.vdpDescription,
          };
          
          // Save vehicle
          const result = await onVehicleSaved(vehicleData);
          
          // Mark as completed
          await storage.markScrapeQueueCompleted(queueItem.id, result.id);
          
          totalCount++;
          processedInBatch++;
          if (result.action === 'inserted') {
            insertedCount++;
            console.log(`    💾 NEW: ${vehicleData.year} ${vehicleData.make} ${vehicleData.model} (ID: ${result.id})`);
          } else {
            updatedCount++;
            console.log(`    💾 UPDATED: ${vehicleData.year} ${vehicleData.make} ${vehicleData.model} (ID: ${result.id})`);
          }
          
          // Human-like delay
          await randomDelay(800, 1500);
          
        } catch (error: any) {
          console.error(`    ✗ Error processing ${queueItem.vehicleTitle}:`, error.message);
          
          // Mark as failed
          const retryCount = (queueItem.retryCount || 0) + 1;
          if (retryCount < 3) {
            // Will retry on next run
            await storage.updateScrapeQueueItem(queueItem.id, { 
              status: "pending",
              retryCount,
              errorMessage: error.message 
            });
          } else {
            await storage.markScrapeQueueFailed(queueItem.id, error.message);
          }
          
          // If frame detachment, refresh and continue
          if (error.message?.includes('detached') || error.message?.includes('closed')) {
            await refreshPage('Emergency recovery from frame detachment');
          }
        }
      }
      
      try { await browser.close(); } catch (e) {}
      console.log(`  ✓ ${config.name}: Completed (${totalCount} processed)`);
      
    } catch (error) {
      console.error(`  ✗ Failed to scrape ${config.name}:`, error);
    }
  }
  
  console.log(`\n✓ CHECKPOINTED scrape complete: ${totalCount} total (${insertedCount} new, ${updatedCount} updated)${resumed ? ' [RESUMED]' : ''}\n`);
  
  return { 
    total: totalCount, 
    inserted: insertedCount, 
    updated: updatedCount, 
    resumed,
    scrapeRunId: currentScrapeRunId 
  };
}
