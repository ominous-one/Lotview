/**
 * ULTIMATE VEHICLE SCRAPER
 * =========================
 * 
 * A precision scraper that extracts ONLY the actual vehicle photos
 * at MAXIMUM resolution. Filters out banners, similar vehicles, and junk.
 * 
 * USAGE:
 *   npm install
 *   npx ts-node scraper.ts
 * 
 * KEY FEATURES:
 * - Only extracts from PRIMARY gallery (not similar vehicles)
 * - Clicks through EVERY slide to load full-res images
 * - Transforms CDN URLs for maximum resolution
 * - VIN-based image validation
 * - Quality scoring
 */

import puppeteer, { Browser, Page } from 'puppeteer';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Containers to EXCLUDE (similar vehicles, recommendations, etc.) */
const EXCLUDED_CONTAINERS = [
  '.similar-vehicles',
  '.recommended-vehicles',
  '.you-may-also-like',
  '.related-vehicles',
  '.other-vehicles',
  '[class*="similar"]',
  '[class*="recommend"]',
  '[class*="related"]',
  '[class*="also-like"]',
  'footer',
  'aside',
  '.sidebar'
];

/** Primary gallery selectors - ONLY extract from these */
const GALLERY_SELECTORS = [
  '.photo-gallery',
  '.photo-gallery__viewport',
  '.photo-gallery__slides',
  '.mobile-slider',
  '.mobile-slider__viewport',
  '.vehicle-gallery',
  '.vdp-gallery',
  '.main-gallery',
  '#vehicle-gallery',
  '.swiper-container',
  '.slick-slider',
  '[data-gallery="main"]',
  '[x-data*="gallery"]'
];

/** URL patterns that are BLOCKED (not vehicle photos) */
const BLOCKED_URL_PATTERNS = [
  /logo/i, /icon/i, /badge/i, /banner/i, /promo/i,
  /button/i, /arrow/i, /chevron/i, /social/i,
  /facebook/i, /twitter/i, /instagram/i,
  /placeholder/i, /no-?image/i, /coming-?soon/i,
  /spinner/i, /loading/i, /pixel\.gif/i,
  /spacer/i, /transparent/i, /bg-/i, /-bg\./i,
  /background/i, /form-/i, /1x1/i, /tracking/i,
  /convertus\.com\/uploads\/sites/i
];

/** Known vehicle photo CDN patterns */
const VEHICLE_CDN_PATTERNS = [
  /autotradercdn\.ca/i,
  /photos\.autotrader/i,
  /homenetiol\.com/i,
  /cargurus\.com\/images\/forsale/i,
  /dealercdn\.com/i,
  /dealerinspire\.com/i,
  /spincar\.com/i
];

// =============================================================================
// TYPES
// =============================================================================

interface VehicleImage {
  url: string;
  originalUrl: string;
  confidence: 'high' | 'medium' | 'low';
  matchesVin: boolean;
  source: string;
}

interface ScrapedVehicle {
  vin: string | null;
  stockNumber: string | null;
  year: number;
  make: string;
  model: string;
  trim: string;
  bodyType: string;
  price: number | null;
  odometer: number | null;
  odometerUnit: 'km' | 'mi';
  images: VehicleImage[];
  imageCount: number;
  imageQuality: 'excellent' | 'good' | 'fair' | 'poor';
  description: string;
  badges: string[];
  vdpUrl: string;
  qualityScore: number;
}

interface DealerConfig {
  name: string;
  inventoryUrl: string;
  domain: string;
}

// =============================================================================
// IMAGE URL MAXIMIZER
// =============================================================================

/**
 * Transform image URL to request maximum resolution from CDN
 */
function maximizeImageUrl(url: string): string {
  if (!url) return url;
  
  // AutoTrader CDN (Canada)
  if (/autotradercdn\.ca/i.test(url)) {
    const base = url.split('?')[0];
    return `${base}?w=2048&h=1536&fit=bounds&quality=90`;
  }
  
  // CarGurus
  if (/cargurus\.com\/images\/forsale/i.test(url)) {
    const base = url.split('?')[0];
    return `${base}?io=true&width=2048&height=1536&fit=bounds&quality=90`;
  }
  
  // HomeNet
  if (/homenetiol|homenet-inc/i.test(url)) {
    return url.replace(/\/\d{3,4}\//g, '/2048/');
  }
  
  // DealerInspire
  if (/dealerinspire/i.test(url)) {
    return url
      .replace(/\/thumb\//g, '/original/')
      .replace(/\/small\//g, '/original/')
      .replace(/\/medium\//g, '/original/');
  }
  
  // Generic size patterns
  return url
    .replace(/-\d+x\d+\./g, '-2048x1536.')
    .replace(/_\d+x\d+\./g, '_2048x1536.');
}

/**
 * Check if URL is likely a vehicle photo (not a banner/icon)
 */
function isVehiclePhotoUrl(url: string): boolean {
  if (!url || url.length < 20) return false;
  
  // Check blocked patterns
  for (const pattern of BLOCKED_URL_PATTERNS) {
    if (pattern.test(url)) return false;
  }
  
  // Must have image extension or be from known CDN
  const hasImageExt = /\.(jpg|jpeg|png|webp)/i.test(url);
  const isKnownCDN = VEHICLE_CDN_PATTERNS.some(p => p.test(url));
  
  return hasImageExt || isKnownCDN;
}

// =============================================================================
// GALLERY NAVIGATION - Click through every slide
// =============================================================================

/**
 * Navigate through entire gallery to load all full-resolution images
 */
async function navigateGallery(page: Page): Promise<{ clicks: number; method: string }> {
  
  // Strategy 1: Click pagination dots
  const dotSelectors = [
    '.photo-gallery__dots button',
    '.photo-gallery__pagination span',
    '.swiper-pagination-bullet',
    '.slick-dots li button',
    '[data-slide-to]'
  ];
  
  for (const selector of dotSelectors) {
    try {
      const dots = await page.$$(selector);
      if (dots.length > 1) {
        let clicks = 0;
        for (const dot of dots) {
          try {
            await dot.click();
            clicks++;
            await new Promise(r => setTimeout(r, 300));
          } catch { break; }
        }
        if (clicks > 0) return { clicks, method: 'pagination-dots' };
      }
    } catch {}
  }
  
  // Strategy 2: Click next button repeatedly
  const nextSelectors = [
    '.photo-gallery__arrow--next',
    '.mobile-slider__arrow--next',
    '.swiper-button-next',
    '.slick-next',
    '[class*="gallery"] [class*="next"]',
    'button[aria-label*="next" i]'
  ];
  
  for (const selector of nextSelectors) {
    try {
      const btn = await page.$(selector);
      if (!btn) continue;
      
      let clicks = 0;
      let lastUrl = '';
      let sameCount = 0;
      
      for (let i = 0; i < 60; i++) {
        // Check if button is visible
        const isVisible = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && style.display !== 'none' && !el.hasAttribute('disabled');
        }, selector);
        
        if (!isVisible) break;
        
        await btn.click();
        clicks++;
        await new Promise(r => setTimeout(r, 250));
        
        // Check if we've looped (same image)
        const currentUrl = await page.evaluate(() => {
          const img = document.querySelector('.photo-gallery__slide.active img, .swiper-slide-active img');
          return img?.getAttribute('src') || '';
        });
        
        if (currentUrl === lastUrl) {
          sameCount++;
          if (sameCount >= 2) break;
        } else {
          sameCount = 0;
          lastUrl = currentUrl;
        }
      }
      
      if (clicks > 0) return { clicks, method: 'next-button' };
    } catch {}
  }
  
  return { clicks: 0, method: 'none' };
}

// =============================================================================
// IMAGE EXTRACTION SCRIPT (runs in browser)
// =============================================================================

function getImageExtractionScript(vin: string | null, stockNumber: string | null): string {
  return `(function() {
    const VIN = ${JSON.stringify(vin)};
    const STOCK = ${JSON.stringify(stockNumber)};
    
    const result = {
      images: [],
      debug: { galleryFound: false, totalFound: 0, filtered: 0 }
    };
    
    const seen = new Set();
    
    // Check if URL matches this vehicle's VIN/stock
    function matchesVehicle(url) {
      if (!url) return false;
      const lower = url.toLowerCase();
      if (VIN && lower.includes(VIN.toLowerCase())) return true;
      if (STOCK && lower.includes(STOCK.toLowerCase())) return true;
      if (VIN && VIN.length === 17) {
        const partial = VIN.slice(-8).toLowerCase();
        if (lower.includes(partial)) return true;
      }
      return false;
    }
    
    // Check if element is in excluded container
    function isExcluded(el) {
      const excluded = [
        '.similar-vehicles', '.recommended-vehicles', '.related-vehicles',
        '[class*="similar"]', '[class*="recommend"]', '[class*="related"]',
        'footer', 'aside', '.sidebar'
      ];
      let current = el;
      while (current && current !== document.body) {
        for (const sel of excluded) {
          if (current.matches && current.matches(sel)) return true;
        }
        current = current.parentElement;
      }
      return false;
    }
    
    // Check if URL is valid vehicle photo
    function isValidUrl(url) {
      if (!url || url.length < 20) return false;
      const blocked = [
        'logo', 'icon', 'badge', 'banner', 'button', 'arrow',
        'social', 'facebook', 'twitter', 'placeholder', 'no-image',
        'spinner', 'loading', 'spacer', 'transparent', 'bg-', '-bg.',
        'background', 'form-', '1x1', 'tracking', 'convertus.com/uploads/sites'
      ];
      const lower = url.toLowerCase();
      for (const b of blocked) {
        if (lower.includes(b)) {
          result.debug.filtered++;
          return false;
        }
      }
      return /\\.(jpg|jpeg|png|webp)/i.test(lower) || 
             /(autotrader|homenet|cargurus|dealer)/i.test(lower);
    }
    
    // Add image if valid
    function addImage(url, source, isActive) {
      if (!url || seen.has(url)) return;
      if (!isValidUrl(url)) return;
      seen.add(url);
      
      result.images.push({
        url: url,
        source: source,
        isActive: isActive,
        matchesVin: matchesVehicle(url),
        confidence: matchesVehicle(url) ? 'high' : (isActive ? 'high' : 'medium')
      });
      result.debug.totalFound++;
    }
    
    // Find primary gallery
    const gallerySelectors = [
      '.photo-gallery', '.photo-gallery__viewport', '.mobile-slider',
      '.vehicle-gallery', '.vdp-gallery', '.swiper-container', '.slick-slider'
    ];
    
    let gallery = null;
    for (const sel of gallerySelectors) {
      const candidates = document.querySelectorAll(sel);
      for (const c of candidates) {
        if (!isExcluded(c) && c.querySelectorAll('img').length > 0) {
          gallery = c;
          break;
        }
      }
      if (gallery) break;
    }
    
    if (!gallery) {
      result.debug.galleryFound = false;
      return result;
    }
    
    result.debug.galleryFound = true;
    
    // Extract from gallery slides
    const slideSelectors = [
      '.photo-gallery__slide', '.mobile-slider__slide',
      '.swiper-slide', '.slick-slide', '.gallery-item'
    ];
    
    let slides = [];
    for (const sel of slideSelectors) {
      const found = gallery.querySelectorAll(sel);
      if (found.length > 1) {
        slides = Array.from(found);
        break;
      }
    }
    
    // If no slides found, get all images in gallery
    if (slides.length === 0) {
      slides = [gallery];
    }
    
    for (const slide of slides) {
      const isActive = slide.classList?.contains('active') ||
                       slide.classList?.contains('swiper-slide-active') ||
                       slide.classList?.contains('slick-active');
      
      // Get all images
      slide.querySelectorAll('img').forEach(img => {
        if (isExcluded(img)) return;
        
        // Try multiple sources for lazy-loaded images
        const sources = [
          img.src,
          img.currentSrc,
          img.getAttribute('data-src'),
          img.getAttribute('data-lazy-src'),
          img.getAttribute('data-original'),
          img.getAttribute('data-full-src'),
          img.getAttribute('data-large-src'),
          img.getAttribute('data-hi-res')
        ].filter(Boolean);
        
        sources.forEach(src => addImage(src, 'gallery', isActive));
      });
      
      // Check background images
      slide.querySelectorAll('[style*="background"]').forEach(el => {
        const style = el.getAttribute('style') || '';
        const match = style.match(/url\\(['"]?([^'"\\)]+)['"]?\\)/);
        if (match) addImage(match[1], 'background', isActive);
      });
    }
    
    // Also check data attributes on gallery
    const dataAttrs = ['data-images', 'data-photos', 'data-gallery-items'];
    for (const attr of dataAttrs) {
      const data = gallery.getAttribute(attr);
      if (data && data.includes('http')) {
        const urls = data.match(/https?:\\/\\/[^"'\\s]+\\.(?:jpg|jpeg|png|webp)/gi);
        if (urls) urls.forEach(url => addImage(url, 'data-attr', false));
      }
    }
    
    return result;
  })()`;
}

// =============================================================================
// DATA EXTRACTION SCRIPT
// =============================================================================

function getDataExtractionScript(): string {
  return `(function() {
    const text = document.body?.innerText || '';
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
      description: '',
      pageText: text.substring(0, 5000)
    };
    
    // VIN
    const vinMatch = text.match(/VIN[:\\s#]*([A-HJ-NPR-Z0-9]{17})/i);
    if (vinMatch) result.vin = vinMatch[1].toUpperCase();
    
    const vinEl = document.querySelector('[data-vin]');
    if (!result.vin && vinEl) {
      const v = vinEl.getAttribute('data-vin');
      if (v && /^[A-HJ-NPR-Z0-9]{17}$/i.test(v)) result.vin = v.toUpperCase();
    }
    
    // Stock
    const stockMatch = text.match(/Stock[\\s#:]*([A-Z0-9-]+)/i);
    if (stockMatch) result.stockNumber = stockMatch[1];
    
    // Price (avoid payment amounts)
    const priceSelectors = [
      '.price-block__price--primary', '.price-block__price',
      '.vehicle-price', '[itemprop="price"]', '.selling-price'
    ];
    
    for (const sel of priceSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const parent = el.parentElement?.textContent || '';
        if (/payment|weekly|monthly|finance/i.test(parent)) continue;
        
        const match = (el.textContent || '').match(/\\$?\\s*([0-9,]+)/);
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
    const odoMatch = text.match(/([0-9,]+)\\s*(km|kilometers?|mi|miles?)/i);
    if (odoMatch) {
      const val = parseInt(odoMatch[1].replace(/,/g, ''));
      if (val > 0 && val < 500000) {
        result.odometer = val;
        result.odometerUnit = /mi/i.test(odoMatch[2]) ? 'mi' : 'km';
      }
    }
    
    // Year/Make/Model
    const h1 = document.querySelector('h1')?.textContent || document.title;
    const ymmMatch = h1.match(/(\\d{4})\\s+([A-Za-z]+)\\s+([A-Za-z0-9]+)/);
    if (ymmMatch) {
      result.year = parseInt(ymmMatch[1]);
      result.make = ymmMatch[2];
      result.model = ymmMatch[3];
    }
    
    // Description
    const descEl = document.querySelector('[class*="description"]');
    if (descEl) result.description = descEl.textContent?.trim().substring(0, 2000) || '';
    
    return result;
  })()`;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function detectBadges(text: string): string[] {
  const badges: string[] = [];
  const patterns: [RegExp, string][] = [
    [/\b(one owner|1 owner)\b/i, 'One Owner'],
    [/\b(no accidents?|accident.?free)\b/i, 'No Accidents'],
    [/\b(certified|cpo)\b/i, 'Certified'],
    [/\b(low km|low mileage)\b/i, 'Low KM'],
    [/\b(warranty)\b/i, 'Warranty'],
    [/\b(leather)\b/i, 'Leather'],
    [/\b(sunroof|moonroof)\b/i, 'Sunroof'],
    [/\b(awd|4wd|all.wheel)\b/i, 'AWD'],
    [/\b(navigation)\b/i, 'Navigation']
  ];
  
  for (const [pattern, badge] of patterns) {
    if (pattern.test(text)) badges.push(badge);
  }
  return [...new Set(badges)];
}

function detectBodyType(text: string): string {
  if (/\bsedan\b/i.test(text)) return 'Sedan';
  if (/\b(suv|crossover)\b/i.test(text)) return 'SUV';
  if (/\b(truck|pickup)\b/i.test(text)) return 'Truck';
  if (/\bhatchback\b/i.test(text)) return 'Hatchback';
  if (/\bcoupe\b/i.test(text)) return 'Coupe';
  if (/\b(van|minivan)\b/i.test(text)) return 'Van';
  return 'SUV';
}

function rateImageQuality(count: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (count >= 20) return 'excellent';
  if (count >= 10) return 'good';
  if (count >= 5) return 'fair';
  return 'poor';
}

function calculateQualityScore(data: any, imageCount: number, hasVinMatch: boolean): number {
  let score = 0;
  if (data.vin) score += 25;
  if (data.price) score += 25;
  if (data.odometer) score += 15;
  if (imageCount >= 20) score += 20;
  else if (imageCount >= 10) score += 15;
  else if (imageCount >= 5) score += 10;
  if (data.description?.length > 100) score += 10;
  if (hasVinMatch) score += 5;
  return Math.min(100, score);
}

// =============================================================================
// MAIN SCRAPER CLASS
// =============================================================================

class VehicleScraper {
  private browser: Browser | null = null;
  
  async init(): Promise<void> {
    console.log('Launching browser...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
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
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36'
    );
    return page;
  }
  
  /**
   * Scrape a single vehicle detail page
   */
  async scrapeVDP(page: Page, url: string): Promise<ScrapedVehicle | null> {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 2000));
      
      // Check for Cloudflare
      const isCloudflare = await page.evaluate(() =>
        document.body?.textContent?.includes('Checking your browser')
      );
      if (isCloudflare) {
        console.log('    ⚠ Cloudflare, waiting...');
        await new Promise(r => setTimeout(r, 12000));
      }
      
      // Extract basic data first
      const data = await page.evaluate(getDataExtractionScript()) as any;
      console.log(`    VIN: ${data.vin || 'N/A'}`);
      
      // Navigate gallery to load all images
      const navResult = await navigateGallery(page);
      console.log(`    Gallery: ${navResult.clicks} clicks (${navResult.method})`);
      
      await new Promise(r => setTimeout(r, 500));
      
      // Extract images
      const imageResult = await page.evaluate(
        getImageExtractionScript(data.vin, data.stockNumber)
      ) as any;
      
      // Process and maximize image URLs
      const images: VehicleImage[] = [];
      const seenBases = new Set<string>();
      
      for (const img of imageResult.images) {
        const maxUrl = maximizeImageUrl(img.url);
        const base = maxUrl.split('?')[0].replace(/-\d+x\d+\./, '.');
        
        if (seenBases.has(base)) continue;
        seenBases.add(base);
        
        images.push({
          url: maxUrl,
          originalUrl: img.url,
          confidence: img.confidence,
          matchesVin: img.matchesVin,
          source: img.source
        });
      }
      
      // Sort: high confidence first
      images.sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.confidence] - order[b.confidence];
      });
      
      const hasVinMatch = images.some(i => i.matchesVin);
      
      return {
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
        images,
        imageCount: images.length,
        imageQuality: rateImageQuality(images.length),
        description: data.description,
        badges: detectBadges(data.pageText),
        vdpUrl: url,
        qualityScore: calculateQualityScore(data, images.length, hasVinMatch)
      };
      
    } catch (error) {
      console.error(`    ✗ Error: ${error instanceof Error ? error.message : error}`);
      return null;
    }
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
      // Load inventory page
      console.log(`Loading: ${dealer.inventoryUrl}`);
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
          console.log(`  Found ${count} vehicles...`);
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
      
      console.log(`\nFound ${vdpUrls.length} vehicles to scrape\n`);
      
      // Scrape each VDP
      for (let i = 0; i < vdpUrls.length; i++) {
        const url = vdpUrls[i];
        
        // Extract label from URL
        const match = url.match(/\/vehicles\/(\d{4})\/([^\/]+)\/([^\/]+)\//);
        const label = match
          ? `${match[1]} ${match[2]} ${match[3]}`.replace(/-/g, ' ')
          : `Vehicle ${i + 1}`;
        
        console.log(`[${i + 1}/${vdpUrls.length}] ${label}`);
        
        // Refresh page every 10 vehicles
        if (i > 0 && i % 10 === 0) {
          console.log('  🔄 Refreshing page...');
          const cookies = await page.cookies();
          await page.close();
          page = await this.createPage();
          await page.setCookie(...cookies);
        }
        
        const vehicle = await this.scrapeVDP(page, url);
        
        if (vehicle) {
          vehicles.push(vehicle);
          console.log(`    ✓ $${vehicle.price?.toLocaleString() || 'N/A'} | ${vehicle.imageCount} images | Score: ${vehicle.qualityScore}/100`);
        }
        
        // Human-like delay
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
      }
      
    } finally {
      await page.close();
    }
    
    // Print summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('SUMMARY');
    console.log(`${'='.repeat(60)}`);
    console.log(`Total: ${vehicles.length}`);
    console.log(`With VIN: ${vehicles.filter(v => v.vin).length}`);
    console.log(`With price: ${vehicles.filter(v => v.price).length}`);
    console.log(`With 10+ images: ${vehicles.filter(v => v.imageCount >= 10).length}`);
    console.log(`With 20+ images: ${vehicles.filter(v => v.imageCount >= 20).length}`);
    
    if (vehicles.length > 0) {
      const avgImages = vehicles.reduce((s, v) => s + v.imageCount, 0) / vehicles.length;
      const avgScore = vehicles.reduce((s, v) => s + v.qualityScore, 0) / vehicles.length;
      console.log(`Avg images: ${avgImages.toFixed(1)}`);
      console.log(`Avg quality: ${avgScore.toFixed(1)}/100`);
    }
    
    return vehicles;
  }
}

// =============================================================================
// MAIN
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
    const fs = require('fs').promises;
    await fs.writeFile('scraped-vehicles.json', JSON.stringify(vehicles, null, 2));
    console.log('\n✓ Saved to scraped-vehicles.json');
    
    // Show sample
    if (vehicles.length > 0) {
      const v = vehicles[0];
      console.log('\n=== SAMPLE ===');
      console.log(`${v.year} ${v.make} ${v.model}`);
      console.log(`VIN: ${v.vin}`);
      console.log(`Price: $${v.price?.toLocaleString()}`);
      console.log(`Images: ${v.imageCount}`);
      if (v.images.length > 0) {
        console.log('First image:');
        console.log(`  ${v.images[0].url.substring(0, 80)}...`);
      }
    }
    
  } finally {
    await scraper.close();
  }
}

main().catch(console.error);
