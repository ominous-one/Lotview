/**
 * Dealer Website Scraper
 * 
 * Scrapes vehicle inventory from dealer websites with:
 * - Platform-specific extraction strategies
 * - Robust image extraction with CDN detection
 * - VIN, price, odometer extraction
 * - Page refresh to prevent frame detachment
 * - Cloudflare bypass
 */

import { execSync } from 'child_process';
import type { Browser, Page } from 'puppeteer';
import { 
  DealerConfig, 
  PLATFORM_SELECTORS, 
  TRUSTED_IMAGE_CDNS, 
  BLOCKED_IMAGE_PATTERNS 
} from './dealer-config';
import { 
  launchStealthBrowser, 
  generateRandomFingerprint, 
  applyFingerprint,
  createFreshPage,
  safeNavigate,
  scrollToLoadAll,
  humanLikeScroll,
  randomDelay,
  BrowserFingerprint
} from './browser-utils';
import { extractImagesFromPage, getImageExtractionScript } from './image-extraction';
import { CookieStore } from './cookie-store';

export interface ScrapedVehicle {
  vin: string | null;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number | null;
  odometer: number | null;
  images: string[];
  description: string;
  badges: string[];
  type: string;
  stockNumber: string | null;
  vdpUrl: string;
  dealershipId: number;
  dealershipName: string;
  location: string;
}

interface VDPData {
  vin: string | null;
  price: number | null;
  odometer: number | null;
  images: string[];
  trim: string;
  description: string;
  badges: string[];
  type: string;
  stockNumber: string | null;
}

// Badge detection patterns
const BADGE_PATTERNS = {
  oneOwner: /\b(one owner|1 owner|single owner)\b/i,
  noAccidents: /\b(no accidents?|accident free|clean history|accident-free)\b/i,
  cleanTitle: /\b(clean title|clear title)\b/i,
  certified: /\b(certified|cpo|certified pre-owned)\b/i,
  lowKm: /\b(low km|low kilometers|low mileage|low km's)\b/i,
  managerSpecial: /\b(manager'?s? special)\b/i,
  newArrival: /\b(new arrival|just arrived)\b/i,
};

// Body type patterns
const BODY_TYPE_PATTERNS = [
  { pattern: /sedan/i, type: 'Sedan' },
  { pattern: /suv|sport utility/i, type: 'SUV' },
  { pattern: /truck|pickup|crew cab/i, type: 'Truck' },
  { pattern: /hatchback/i, type: 'Hatchback' },
  { pattern: /coupe|convertible/i, type: 'Coupe' },
  { pattern: /wagon/i, type: 'Wagon' },
  { pattern: /minivan|van/i, type: 'Minivan' },
];

function detectBadges(text: string): string[] {
  const badges: string[] = [];
  if (BADGE_PATTERNS.oneOwner.test(text)) badges.push('One Owner');
  if (BADGE_PATTERNS.noAccidents.test(text)) badges.push('No Accidents');
  if (BADGE_PATTERNS.cleanTitle.test(text)) badges.push('Clean Title');
  if (BADGE_PATTERNS.certified.test(text)) badges.push('Certified Pre-Owned');
  if (BADGE_PATTERNS.lowKm.test(text)) badges.push('Low Kilometers');
  if (BADGE_PATTERNS.managerSpecial.test(text)) badges.push('Manager Special');
  if (BADGE_PATTERNS.newArrival.test(text)) badges.push('New Arrival');
  return badges;
}

function detectBodyType(text: string): string {
  for (const { pattern, type } of BODY_TYPE_PATTERNS) {
    if (pattern.test(text)) return type;
  }
  return 'SUV'; // Default
}

/**
 * Get Chromium path
 */
function getChromiumPath(): string {
  try {
    return execSync('which chromium').toString().trim();
  } catch {
    // Fallback paths for common installations
    const fallbacks = [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium'
    ];
    for (const path of fallbacks) {
      try {
        execSync(`test -f ${path}`);
        return path;
      } catch {
        continue;
      }
    }
    throw new Error('Chromium not found');
  }
}

/**
 * Create the VDP extraction script (runs in page context)
 */
function createVDPExtractionScript(): string {
  return `(function() {
    const pageText = document.body?.textContent || '';
    const result = {
      vin: null,
      price: null,
      odometer: null,
      trim: 'Base',
      description: '',
      stockNumber: null,
      debug: {}
    };
    
    // --- VIN Extraction ---
    const vinMatch = pageText.match(/VIN[:\\s]*([A-HJ-NPR-Z0-9]{17})/i);
    if (vinMatch) {
      result.vin = vinMatch[1].toUpperCase();
    }
    
    // --- Stock Number ---
    const stockMatch = pageText.match(/stock[#\\s:]*([A-Z0-9-]+)/i);
    if (stockMatch) {
      result.stockNumber = stockMatch[1];
    }
    
    // --- Price Extraction (with payment filtering) ---
    function isPaymentContext(element) {
      const paymentKeywords = /payment|weekly|bi-?weekly|monthly|calculator|financing|finance|per\\s+month|\\/mo/i;
      const text = element.textContent || '';
      if (paymentKeywords.test(text)) return true;
      
      const classId = (element.className || '') + (element.id || '');
      if (paymentKeywords.test(classId)) return true;
      
      const parent = element.parentElement;
      if (parent) {
        const parentClassId = (parent.className || '') + (parent.id || '');
        if (paymentKeywords.test(parentClassId)) return true;
      }
      return false;
    }
    
    // Priority price selectors (specific to common dealer platforms)
    const priceSelectors = [
      '.price-block__price--primary',
      '.price-block__price',
      '.main-price',
      '[data-field="price"]',
      '[data-field="sellingPrice"]',
      '[data-price]',
      '[itemprop="price"]',
      '.vehicle-price__price',
      '.vehicle-price',
      '.selling-price',
      '.final-price',
      '.sale-price'
    ];
    
    for (const selector of priceSelectors) {
      const el = document.querySelector(selector);
      if (el && !isPaymentContext(el)) {
        const text = el.textContent || el.getAttribute('data-value') || el.getAttribute('data-price') || '';
        const match = text.match(/\\$?\\s*([0-9,]+)/);
        if (match) {
          const val = parseInt(match[1].replace(/,/g, ''));
          if (val >= 1000 && val <= 500000) {
            result.price = val;
            result.debug.priceSource = selector;
            break;
          }
        }
      }
    }
    
    // Fallback: labeled price patterns
    if (!result.price) {
      const patterns = [
        /(?:Sale|Selling|Asking|Dealer|Final|Internet)\\s*Price[:\\s]*\\$?\\s*([0-9,]+)/i,
        /Price[:\\s]*\\$?\\s*([0-9,]+)(?!\\s*(?:weekly|monthly|payment))/i
      ];
      
      for (const pattern of patterns) {
        const match = pageText.match(pattern);
        if (match) {
          const val = parseInt(match[1].replace(/,/g, ''));
          if (val >= 1000 && val <= 500000) {
            result.price = val;
            result.debug.priceSource = 'regex';
            break;
          }
        }
      }
    }
    
    // --- Odometer ---
    const odoMatch = pageText.match(/([0-9,]+)\\s*(km|kilometers?)/i);
    if (odoMatch) {
      const val = parseInt(odoMatch[1].replace(/,/g, ''));
      if (val > 0 && val < 500000) {
        result.odometer = val;
      }
    }
    
    // --- Trim ---
    const h1 = document.querySelector('h1');
    if (h1) {
      const titleText = h1.textContent || '';
      const trimMatch = titleText.match(/\\d{4}\\s+[A-Za-z-]+\\s+[A-Za-z0-9-]+\\s+(.+)/i);
      if (trimMatch && trimMatch[1]) {
        result.trim = trimMatch[1].trim();
      }
    }
    
    // --- Description ---
    const descSelectors = [
      '[class*="description"]',
      '[class*="details"]',
      '[class*="comments"]',
      '.vehicle-description',
      '#description'
    ];
    
    for (const sel of descSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent && el.textContent.length > 50) {
        result.description = el.textContent.trim().substring(0, 2000);
        break;
      }
    }
    
    if (!result.description) {
      result.description = 'Contact dealer for details.';
    }
    
    result.debug.pageLength = pageText.length;
    result.pageText = pageText.substring(0, 5000); // For badge/type detection
    
    return result;
  })()`;
}

/**
 * Scrape a single Vehicle Detail Page
 */
async function scrapeVDP(
  page: Page,
  vdpUrl: string,
  platformSelectors: typeof PLATFORM_SELECTORS['edealer'],
  retries: number = 2
): Promise<VDPData> {
  const defaultResult: VDPData = {
    vin: null,
    price: null,
    odometer: null,
    images: [],
    trim: 'Base',
    description: 'Contact dealer for details.',
    badges: [],
    type: 'SUV',
    stockNumber: null
  };
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Navigate to VDP
      const success = await safeNavigate(page, vdpUrl, { handleCloudflare: true });
      if (!success) {
        if (attempt < retries) {
          await randomDelay(2000, 4000);
          continue;
        }
        return defaultResult;
      }
      
      // Wait for page content
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Navigate gallery to load all images
      const galleryClicks = await navigateGalleryForImages(page, platformSelectors.galleryNextButton);
      console.log(`    → Gallery: ${galleryClicks} clicks`);
      
      // Wait for images to load
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Extract basic data
      const basicData = await page.evaluate(createVDPExtractionScript());
      
      // Extract images separately with robust logic
      const imageResult = await page.evaluate(
        getImageExtractionScript(TRUSTED_IMAGE_CDNS, BLOCKED_IMAGE_PATTERNS)
      );
      
      // Detect badges and body type from page text
      const badges = detectBadges(basicData.pageText || '');
      const type = detectBodyType(basicData.pageText || '');
      
      return {
        vin: basicData.vin,
        price: basicData.price,
        odometer: basicData.odometer,
        images: imageResult.images,
        trim: basicData.trim,
        description: basicData.description,
        badges,
        type,
        stockNumber: basicData.stockNumber
      };
      
    } catch (error) {
      console.log(`    ✗ VDP error (attempt ${attempt + 1}): ${error instanceof Error ? error.message : String(error)}`);
      
      if (attempt < retries) {
        await randomDelay(2000 * (attempt + 1), 4000 * (attempt + 1));
        continue;
      }
    }
  }
  
  return defaultResult;
}

/**
 * Navigate gallery carousel to trigger lazy loading
 */
async function navigateGalleryForImages(
  page: Page,
  nextButtonSelectors: string[],
  maxClicks: number = 50
): Promise<number> {
  let totalClicks = 0;
  
  for (const selector of nextButtonSelectors) {
    try {
      const nextBtn = await page.$(selector);
      if (!nextBtn) continue;
      
      for (let i = 0; i < maxClicks; i++) {
        try {
          const isVisible = await page.evaluate((sel) => {
            const btn = document.querySelector(sel);
            if (!btn) return false;
            const rect = btn.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }, selector);
          
          if (!isVisible) break;
          
          await nextBtn.click();
          totalClicks++;
          await new Promise(r => setTimeout(r, 150));
          
        } catch {
          break;
        }
      }
      
      if (totalClicks > 0) break;
    } catch {
      continue;
    }
  }
  
  return totalClicks;
}

/**
 * Main function to scrape a dealer's inventory
 */
export async function scrapeDealerInventory(
  dealer: DealerConfig,
  cookieStore?: CookieStore
): Promise<ScrapedVehicle[]> {
  console.log(`\n========================================`);
  console.log(`SCRAPING: ${dealer.name}`);
  console.log(`========================================\n`);
  
  const chromiumPath = getChromiumPath();
  const fingerprint = generateRandomFingerprint();
  const platformSelectors = PLATFORM_SELECTORS[dealer.website.platform];
  
  console.log(`  Platform: ${dealer.website.platform}`);
  console.log(`  URL: ${dealer.website.inventoryUrl}`);
  
  const browser = await launchStealthBrowser(chromiumPath);
  const vehicles: ScrapedVehicle[] = [];
  
  try {
    // Create initial page
    let page = await createFreshPage(browser, fingerprint);
    
    // Load saved cookies if available
    if (cookieStore) {
      const savedCookies = await cookieStore.loadCookies(dealer.website.domain);
      if (savedCookies) {
        await page.setCookie(...savedCookies);
        console.log(`  ✓ Loaded ${savedCookies.length} saved cookies`);
      }
    }
    
    // Navigate to inventory page
    console.log(`  Navigating to inventory page...`);
    const navSuccess = await safeNavigate(page, dealer.website.inventoryUrl, {
      waitForSelector: platformSelectors.vehicleLinks,
      handleCloudflare: true
    });
    
    if (!navSuccess) {
      throw new Error('Failed to load inventory page');
    }
    
    // Human-like behavior
    await humanLikeScroll(page);
    
    // Scroll to load all vehicles (infinite scroll)
    console.log(`  Loading all vehicles...`);
    const totalItems = await scrollToLoadAll(page, platformSelectors.vehicleLinks, 30, 2000);
    console.log(`  ✓ Found ${totalItems} vehicle listings`);
    
    // Extract VDP URLs
    const vdpUrls = await extractVDPUrls(page, dealer, platformSelectors);
    console.log(`  ✓ Extracted ${vdpUrls.length} VDP URLs`);
    
    // Save cookies after successful navigation
    if (cookieStore) {
      const cookies = await page.cookies();
      await cookieStore.saveCookies(dealer.website.domain, cookies);
    }
    
    // Process each VDP
    const PAGE_REFRESH_INTERVAL = 10;
    
    for (let i = 0; i < vdpUrls.length; i++) {
      const { url, year, make, model } = vdpUrls[i];
      console.log(`  [${i + 1}/${vdpUrls.length}] ${year} ${make} ${model}`);
      
      // Refresh page periodically to prevent frame detachment
      if (i > 0 && i % PAGE_REFRESH_INTERVAL === 0) {
        console.log(`    🔄 Refreshing page (processed ${i} vehicles)...`);
        const cookies = await page.cookies();
        await page.close();
        page = await createFreshPage(browser, fingerprint, cookies);
        console.log(`    ✓ Page refreshed`);
      }
      
      // Scrape VDP
      const vdpData = await scrapeVDP(page, url, platformSelectors);
      
      vehicles.push({
        vin: vdpData.vin,
        year,
        make,
        model,
        trim: vdpData.trim,
        price: vdpData.price,
        odometer: vdpData.odometer,
        images: vdpData.images,
        description: vdpData.description,
        badges: vdpData.badges,
        type: vdpData.type,
        stockNumber: vdpData.stockNumber,
        vdpUrl: url,
        dealershipId: dealer.id,
        dealershipName: dealer.name,
        location: dealer.location
      });
      
      console.log(`    ✓ ${vdpData.images.length} photos, $${vdpData.price || 'N/A'}, ${vdpData.badges.length} badges`);
      
      // Human-like delay
      await randomDelay(800, 1500);
    }
    
    console.log(`\n✓ Successfully scraped ${vehicles.length} vehicles from ${dealer.name}`);
    
  } finally {
    await browser.close();
  }
  
  return vehicles;
}

/**
 * Extract VDP URLs from inventory page
 */
async function extractVDPUrls(
  page: Page,
  dealer: DealerConfig,
  platformSelectors: typeof PLATFORM_SELECTORS['edealer']
): Promise<Array<{ url: string; year: number; make: string; model: string }>> {
  return page.evaluate((linkSelector, urlPattern, domain) => {
    const results: Array<{ url: string; year: number; make: string; model: string }> = [];
    const seen = new Set<string>();
    
    const links = document.querySelectorAll(linkSelector);
    
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (!href) return;
      
      // Build full URL
      let fullUrl = href;
      if (href.startsWith('/')) {
        fullUrl = `https://${domain}${href}`;
      } else if (!href.startsWith('http')) {
        fullUrl = `https://${domain}/${href}`;
      }
      
      if (seen.has(fullUrl)) return;
      
      // Extract year/make/model from URL (eDealer pattern)
      const match = href.match(/\/vehicles\/(\d{4})\/([a-z-]+)\/([a-z0-9-]+)\//i);
      if (match) {
        seen.add(fullUrl);
        
        const year = parseInt(match[1]);
        const make = match[2].split('-').map(w => 
          w.charAt(0).toUpperCase() + w.slice(1)
        ).join(' ');
        const model = match[3].split('-').map(w => 
          w.charAt(0).toUpperCase() + w.slice(1)
        ).join(' ');
        
        results.push({ url: fullUrl, year, make, model });
      }
    });
    
    return results;
  }, platformSelectors.vehicleLinks, platformSelectors.vdpUrlPattern.source, dealer.website.domain);
}

/**
 * Scrape multiple dealers
 */
export async function scrapeAllDealers(
  dealers: DealerConfig[],
  cookieStore?: CookieStore
): Promise<Map<number, ScrapedVehicle[]>> {
  const results = new Map<number, ScrapedVehicle[]>();
  
  for (const dealer of dealers) {
    try {
      const vehicles = await scrapeDealerInventory(dealer, cookieStore);
      results.set(dealer.id, vehicles);
      
      // Delay between dealers
      await new Promise(r => setTimeout(r, 3000));
    } catch (error) {
      console.error(`✗ Failed to scrape ${dealer.name}:`, error);
      results.set(dealer.id, []);
    }
  }
  
  return results;
}
