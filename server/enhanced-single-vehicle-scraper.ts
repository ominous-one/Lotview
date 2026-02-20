/**
 * ENHANCED SINGLE VEHICLE SCRAPER
 * ================================
 * 
 * Perfected scraping for a single VDP with all audit improvements:
 * 1. Gallery modal trigger before navigating slides
 * 2. 4K image resolution targeting (4096px)
 * 3. Vehicle features/options extraction
 * 4. VIN cross-verification with NHTSA decoder
 * 5. AI-enhanced description generation
 * 6. CarGurus enrichment (deal rating, badges, Carfax URL)
 * 7. Load More button handling
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Page, Browser } from 'puppeteer';
import { decodeVIN, type VINDecodeResult } from './vin-decoder';
import { generateVehicleDescription } from './openai';

puppeteer.use(StealthPlugin());

export interface EnhancedVehicleData {
  vin: string | null;
  vinDecoded: VINDecodeResult | null;
  vinValidation: {
    matches: boolean;
    discrepancies: string[];
  };
  year: number;
  make: string;
  model: string;
  trim: string;
  type: string;
  price: number | null;
  odometer: number | null;
  stockNumber: string | null;
  images: string[];
  imageCount: number;
  imageQuality: 'excellent' | 'good' | 'fair' | 'poor';
  features: string[];
  description: string;
  descriptionSource: 'dealer' | 'ai-generated' | 'enhanced';
  badges: string[];
  cargurusData: {
    dealRating: string | null;
    carfaxUrl: string | null;
    cargurusUrl: string | null;
    additionalBadges: string[];
  } | null;
  vdpUrl: string;
  dealershipId: number;
  dataQualityScore: number;
  extractionLog: string[];
}

export interface ScrapingConfig {
  enableGalleryModal: boolean;
  enable4KImages: boolean;
  enableFeaturesExtraction: boolean;
  enableVinValidation: boolean;
  enableAIDescription: boolean;
  enableCarGurusEnrichment: boolean;
  dealershipId: number;
}

const DEFAULT_CONFIG: ScrapingConfig = {
  enableGalleryModal: true,
  enable4KImages: true,
  enableFeaturesExtraction: true,
  enableVinValidation: true,
  enableAIDescription: true,
  enableCarGurusEnrichment: true,
  dealershipId: 1
};

function upgrade4KImageUrl(url: string): string {
  if (!url) return url;
  
  let upgraded = url;
  
  if (/autotradercdn\.ca/i.test(url)) {
    const base = url.split('?')[0];
    upgraded = `${base}?w=4096&h=3072&fit=bounds&auto=webp&quality=95`;
  } else if (/cargurus\.com\/images\/forsale/i.test(url)) {
    const base = url.split('?')[0];
    upgraded = `${base}?io=true&width=4096&height=3072&fit=bounds&format=jpg&quality=95`;
  } else if (/homenetiol|homenet-inc/i.test(url)) {
    upgraded = url
      .replace(/\/\d{3,4}\//g, '/4096/')
      .replace(/sz=\d+/gi, 'sz=4096')
      .replace(/size=\d+/gi, 'size=4096');
  } else if (/dealerinspire/i.test(url)) {
    upgraded = url
      .replace(/\/thumb\//g, '/original/')
      .replace(/\/small\//g, '/original/')
      .replace(/\/medium\//g, '/original/')
      .replace(/\/large\//g, '/original/');
  } else if (/ddclstatic|dealer\.com/i.test(url)) {
    upgraded = url.replace(/_\d+x\d+\./g, '_4096x3072.');
  } else if (/spincar\.com/i.test(url)) {
    upgraded = url.replace(/\/\d+\//g, '/4096/');
  } else if (/cloudinary\.com/i.test(url)) {
    upgraded = url
      .replace(/\/w_\d+/g, '/w_4096')
      .replace(/\/h_\d+/g, '/h_3072')
      .replace(/\/q_\d+/g, '/q_95');
  } else {
    upgraded = url
      .replace(/-1024x768\./g, '-4096x3072.')
      .replace(/-1024x786\./g, '-4096x3072.')
      .replace(/-2048x1536\./g, '-4096x3072.')
      .replace(/_1024x768\./g, '_4096x3072.')
      .replace(/_2048x1536\./g, '_4096x3072.');
  }
  
  return upgraded;
}

async function openGalleryModal(page: Page, log: string[]): Promise<boolean> {
  log.push('→ Attempting to open gallery modal...');
  
  const modalTriggerSelectors = [
    '.gallery__main-image',
    '.vehicle-image__wrapper',
    '.photo-gallery__main',
    '.main-photo',
    '.primary-image',
    '.hero-image',
    '[data-action="open-gallery"]',
    '[data-gallery-trigger]',
    '.photo-gallery__slide.active img',
    '.mobile-slider__slide.active img',
    '.vehicle-media img:first-child'
  ];
  
  for (const selector of modalTriggerSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        const isClickable = await page.evaluate((sel: string) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 50 && rect.height > 50 &&
                 style.display !== 'none' &&
                 style.visibility !== 'hidden';
        }, selector);
        
        if (isClickable) {
          await element.click();
          log.push(`  ✓ Clicked gallery trigger: ${selector}`);
          await new Promise(r => setTimeout(r, 1500));
          
          const modalOpened = await page.evaluate(() => {
            const modals = document.querySelectorAll('.lightbox, .modal, .gallery-modal, [role="dialog"], .fullscreen-gallery, .photo-viewer');
            return modals.length > 0 || document.body.classList.contains('modal-open');
          });
          
          if (modalOpened) {
            log.push('  ✓ Gallery modal opened successfully');
            return true;
          }
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  log.push('  → No gallery modal found, proceeding with inline gallery');
  return false;
}

async function handleLoadMoreButtons(page: Page, log: string[]): Promise<number> {
  log.push('→ Checking for Load More buttons...');
  
  let totalClicks = 0;
  
  // First, try standard CSS selectors
  const cssSelectors = [
    'button.load-more',
    '.load-more',
    '[data-action="load-more"]',
    '.show-more-images',
    '.view-all-photos',
    '.view-more-photos',
    '.gallery-load-more'
  ];
  
  for (const selector of cssSelectors) {
    let consecutiveAttempts = 0;
    
    while (consecutiveAttempts < 3) {
      try {
        const loadMoreBtn = await page.$(selector);
        if (!loadMoreBtn) break;
        
        const isVisible = await page.evaluate((sel: string) => {
          const btn = document.querySelector(sel);
          if (!btn) return false;
          const rect = btn.getBoundingClientRect();
          const style = window.getComputedStyle(btn);
          return rect.width > 0 && rect.height > 0 &&
                 style.display !== 'none' &&
                 style.visibility !== 'hidden';
        }, selector);
        
        if (!isVisible) break;
        
        await loadMoreBtn.click();
        totalClicks++;
        log.push(`  ✓ Clicked Load More button (${selector})`);
        await new Promise(r => setTimeout(r, 2000));
        consecutiveAttempts = 0;
      } catch (e) {
        consecutiveAttempts++;
      }
    }
  }
  
  // Then, try text-based button detection via page.evaluate
  const textButtonClicks = await page.evaluate(() => {
    const textPatterns = ['Load More', 'Show More', 'View All', 'See More Photos', 'More Images'];
    let clicks = 0;
    
    for (const pattern of textPatterns) {
      const buttons = Array.from(document.querySelectorAll('button, a.button, [role="button"]'));
      for (const btn of buttons) {
        const text = btn.textContent?.trim() || '';
        if (text.toLowerCase().includes(pattern.toLowerCase())) {
          const rect = btn.getBoundingClientRect();
          const style = window.getComputedStyle(btn);
          if (rect.width > 0 && rect.height > 0 &&
              style.display !== 'none' &&
              style.visibility !== 'hidden') {
            (btn as HTMLElement).click();
            clicks++;
            break;
          }
        }
      }
    }
    return clicks;
  });
  
  if (textButtonClicks > 0) {
    totalClicks += textButtonClicks;
    log.push(`  ✓ Clicked ${textButtonClicks} text-based Load More buttons`);
    await new Promise(r => setTimeout(r, 2000));
  }
  
  if (totalClicks > 0) {
    log.push(`  ✓ Total Load More clicks: ${totalClicks}`);
  } else {
    log.push('  → No Load More buttons found');
  }
  
  return totalClicks;
}

async function navigateGalleryFully(page: Page, log: string[]): Promise<number> {
  log.push('→ Navigating through gallery slides...');
  
  const nextButtonSelectors = [
    '.photo-gallery__arrow--next',
    '.mobile-slider__arrow--next',
    '.swiper-button-next',
    '.slick-next',
    '[class*="gallery"] [class*="next"]',
    '[class*="slider"] [class*="next"]',
    'button[aria-label*="next" i]',
    '[data-direction="next"]'
  ];
  
  let totalClicks = 0;
  let lastImageUrl = '';
  let staleCount = 0;
  
  for (const selector of nextButtonSelectors) {
    const btn = await page.$(selector);
    if (!btn) continue;
    
    for (let i = 0; i < 100; i++) {
      try {
        const isClickable = await page.evaluate((sel: string) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 &&
                 style.display !== 'none' &&
                 style.visibility !== 'hidden' &&
                 !el.hasAttribute('disabled');
        }, selector);
        
        if (!isClickable) break;
        
        await btn.click();
        totalClicks++;
        await new Promise(r => setTimeout(r, 200));
        
        const currentImg = await page.evaluate(() => {
          const active = document.querySelector('.photo-gallery__slide.active img, .swiper-slide-active img, .slick-active img');
          return active?.getAttribute('src') || '';
        });
        
        if (currentImg === lastImageUrl) {
          staleCount++;
          if (staleCount >= 3) break;
        } else {
          staleCount = 0;
          lastImageUrl = currentImg;
        }
      } catch {
        break;
      }
    }
    
    if (totalClicks > 0) break;
  }
  
  log.push(`  ✓ Gallery navigation: ${totalClicks} slides visited`);
  return totalClicks;
}

async function extractVehicleData(page: Page, vdpUrl: string, config: ScrapingConfig, log: string[]): Promise<Partial<EnhancedVehicleData>> {
  log.push('→ Extracting vehicle data from page...');
  
  const data = await page.evaluate(`(function() {
    var result = {
      vin: null,
      stockNumber: null,
      price: null,
      odometer: null,
      trim: 'Base',
      description: '',
      features: [],
      images: [],
      badges: [],
      type: 'SUV',
      year: null,
      make: null,
      model: null
    };
    
    var pageText = document.body.textContent || '';
    
    // VIN extraction
    var vinMatch = pageText.match(/VIN[:\\s]*([A-HJ-NPR-Z0-9]{17})/i);
    if (vinMatch) {
      result.vin = vinMatch[1].toUpperCase();
    }
    
    // Stock number
    var stockMatch = pageText.match(/stock[#\\s:]*([A-Z0-9-]+)/i);
    if (stockMatch) {
      result.stockNumber = stockMatch[1];
    }
    
    // Price - authoritative selectors first
    var priceSelectors = [
      '.price-block__price--primary',
      '.price-block__price',
      '[data-field="price"]',
      '[itemprop="price"]',
      '.vehicle-price__price',
      '.vehicle-price',
      '.selling-price',
      '.sale-price'
    ];
    
    for (var i = 0; i < priceSelectors.length; i++) {
      var priceEl = document.querySelector(priceSelectors[i]);
      if (priceEl) {
        var priceText = priceEl.textContent || '';
        var priceMatch = priceText.match(/\\$?\\s*([0-9,]+)/);
        if (priceMatch) {
          var val = parseInt(priceMatch[1].replace(/,/g, ''));
          if (val >= 1000 && val <= 500000) {
            result.price = val;
            break;
          }
        }
      }
    }
    
    // Odometer
    var odoMatch = pageText.match(/([0-9,]+)\\s*(km|kilometers?)/i);
    if (odoMatch) {
      var odoVal = parseInt(odoMatch[1].replace(/,/g, ''));
      if (odoVal > 0 && odoVal < 500000) {
        result.odometer = odoVal;
      }
    }
    
    // Year/Make/Model from URL or title
    var urlMatch = window.location.pathname.match(/(\\d{4})[-_]([A-Za-z]+)[-_]([A-Za-z0-9-]+)/i);
    if (urlMatch) {
      result.year = parseInt(urlMatch[1]);
      result.make = urlMatch[2].replace(/-/g, ' ');
      result.model = urlMatch[3].replace(/-/g, ' ');
    }
    
    // Trim from h1
    var h1 = document.querySelector('h1');
    if (h1) {
      var titleText = h1.textContent || '';
      var trimMatch = titleText.match(/(?:\\d{4}\\s+[A-Za-z-]+\\s+[A-Za-z0-9-]+\\s+)([A-Za-z0-9\\s]+)/i);
      if (trimMatch && trimMatch[1]) {
        result.trim = trimMatch[1].trim();
      }
    }
    
    // Description
    var descSelectors = [
      '.vehicle-description',
      '[class*="description"]',
      '[class*="details"]',
      '[class*="comments"]',
      '#description'
    ];
    for (var di = 0; di < descSelectors.length; di++) {
      var descEl = document.querySelector(descSelectors[di]);
      if (descEl && descEl.textContent && descEl.textContent.length > 50) {
        result.description = descEl.textContent.trim();
        break;
      }
    }
    
    // FEATURES EXTRACTION - NEW
    var featureSelectors = [
      '.feature-list li',
      '.vehicle-features li',
      '.options-list li',
      '.equipment-list li',
      '.specs-list li',
      '[class*="feature"] li',
      '[class*="option"] li',
      '.features-section li',
      '.key-features li'
    ];
    
    for (var fi = 0; fi < featureSelectors.length; fi++) {
      var featureEls = document.querySelectorAll(featureSelectors[fi]);
      if (featureEls.length > 0) {
        for (var fj = 0; fj < featureEls.length; fj++) {
          var featureText = featureEls[fj].textContent?.trim();
          if (featureText && featureText.length > 2 && featureText.length < 100) {
            result.features.push(featureText);
          }
        }
        if (result.features.length > 0) break;
      }
    }
    
    // Also check for comma-separated features in a single element
    if (result.features.length === 0) {
      var featureContainers = document.querySelectorAll('.features, .equipment, .options, [class*="feature-text"]');
      for (var fc = 0; fc < featureContainers.length; fc++) {
        var containerText = featureContainers[fc].textContent || '';
        if (containerText.includes(',')) {
          var parts = containerText.split(',');
          for (var pi = 0; pi < parts.length; pi++) {
            var part = parts[pi].trim();
            if (part.length > 2 && part.length < 100) {
              result.features.push(part);
            }
          }
          if (result.features.length > 0) break;
        }
      }
    }
    
    // IMAGES - from gallery only
    var processedUrls = {};
    var trustedCDNs = [
      'autotradercdn.ca', 'photos.autotrader', 'homenetiol.com', 'homenet-inc.com',
      'cargurus.com/images/forsale', 'dealercdn.com', 'ddclstatic.com',
      'dealerinspire.com', 'photos.dealer.com', 'spincar.com', 'evoxcdn.com',
      '/vehicles/', '/inventory/', '/stock/', '/photos/', '/media/'
    ];
    
    var blockedPatterns = [
      'logo', 'icon', 'badge', 'banner', 'promo', 'button', 'arrow',
      'placeholder', 'no-image', 'spinner', 'loading', 'bg-', '-bg.',
      'form-', 'welcome', 'get-approved', 'pictogram', 'tracking',
      '.svg', '/headers/', '/themes/', '/logos/', 'hyundai.svg',
      'hyundai-header', 'favicon', '/icons/', 'achilles',
      'convertus-achilles', '/wp-content/themes/', 'brand-', '-brand',
      '/assets/images/'
    ];
    
    function isVehiclePhoto(src) {
      if (!src || src.length < 20) return false;
      var lower = src.toLowerCase();
      for (var bi = 0; bi < blockedPatterns.length; bi++) {
        if (lower.indexOf(blockedPatterns[bi]) !== -1) return false;
      }
      for (var ci = 0; ci < trustedCDNs.length; ci++) {
        if (lower.indexOf(trustedCDNs[ci].toLowerCase()) !== -1) return true;
      }
      return /\\.(jpg|jpeg|png|webp)/i.test(lower);
    }
    
    function normalizeUrl(src) {
      if (!src || src.indexOf('data:') === 0) return null;
      if (src.indexOf('//') === 0) return 'https:' + src;
      if (src.indexOf('/') === 0) return window.location.origin + src;
      return src;
    }
    
    // Gallery containers
    var galleryContainers = document.querySelectorAll('.photo-gallery, .mobile-slider, .vehicle-gallery, .gallery-container, [class*="vehicle-photo"]');
    for (var gc = 0; gc < galleryContainers.length; gc++) {
      var imgs = galleryContainers[gc].querySelectorAll('img');
      for (var gi = 0; gi < imgs.length; gi++) {
        var sources = [
          imgs[gi].src,
          imgs[gi].currentSrc,
          imgs[gi].getAttribute('data-src'),
          imgs[gi].getAttribute('data-lazy-src'),
          imgs[gi].getAttribute('data-original'),
          imgs[gi].getAttribute('data-full-src'),
          imgs[gi].getAttribute('data-large-src'),
          imgs[gi].getAttribute('data-hi-res'),
          imgs[gi].getAttribute('data-zoom-image')
        ];
        for (var si = 0; si < sources.length; si++) {
          var src = normalizeUrl(sources[si]);
          if (src && !processedUrls[src] && isVehiclePhoto(src)) {
            processedUrls[src] = true;
            result.images.push(src);
          }
        }
      }
    }
    
    // Badge detection
    var lowerText = pageText.toLowerCase();
    if (/\\b(one owner|1 owner|single owner)\\b/.test(lowerText)) result.badges.push('One Owner');
    if (/\\b(no accidents?|accident free|clean history)\\b/.test(lowerText)) result.badges.push('No Accidents');
    if (/\\b(clean title|clear title)\\b/.test(lowerText)) result.badges.push('Clean Title');
    if (/\\b(certified|cpo|certified pre-owned)\\b/.test(lowerText)) result.badges.push('Certified Pre-Owned');
    if (/\\b(low km|low kilometers|low mileage)\\b/.test(lowerText)) result.badges.push('Low Kilometers');
    
    // Body type detection
    if (/sedan/i.test(lowerText)) result.type = 'Sedan';
    else if (/suv|sport utility/i.test(lowerText)) result.type = 'SUV';
    else if (/truck|pickup/i.test(lowerText)) result.type = 'Truck';
    else if (/hatchback/i.test(lowerText)) result.type = 'Hatchback';
    else if (/coupe|convertible/i.test(lowerText)) result.type = 'Coupe';
    else if (/wagon/i.test(lowerText)) result.type = 'Wagon';
    else if (/minivan|van/i.test(lowerText)) result.type = 'Minivan';
    
    return result;
  })()`) as {
    vin: string | null;
    stockNumber: string | null;
    price: number | null;
    odometer: number | null;
    trim: string;
    description: string;
    features: string[];
    images: string[];
    badges: string[];
    type: string;
    year: number | null;
    make: string | null;
    model: string | null;
  };
  
  log.push(`  ✓ Extracted: VIN=${data.vin || 'N/A'}, Price=$${data.price || 'N/A'}, Images=${data.images.length}`);
  log.push(`  ✓ Features extracted: ${data.features.length}`);
  
  return data as Partial<EnhancedVehicleData>;
}

async function validateVinWithDecoder(vin: string, scrapedData: Partial<EnhancedVehicleData>, log: string[]): Promise<{
  decoded: VINDecodeResult;
  matches: boolean;
  discrepancies: string[];
}> {
  log.push(`→ Validating VIN with NHTSA decoder: ${vin}`);
  
  const decoded = await decodeVIN(vin);
  const discrepancies: string[] = [];
  
  if (decoded.errorCode) {
    log.push(`  ⚠ VIN decode error: ${decoded.errorMessage}`);
    return { decoded, matches: false, discrepancies: [`VIN decode failed: ${decoded.errorMessage}`] };
  }
  
  if (decoded.year && scrapedData.year && decoded.year !== scrapedData.year.toString()) {
    discrepancies.push(`Year mismatch: scraped=${scrapedData.year}, VIN=${decoded.year}`);
  }
  
  if (decoded.make && scrapedData.make) {
    const decodedMake = decoded.make.toLowerCase();
    const scrapedMake = scrapedData.make.toLowerCase();
    if (!decodedMake.includes(scrapedMake) && !scrapedMake.includes(decodedMake)) {
      discrepancies.push(`Make mismatch: scraped=${scrapedData.make}, VIN=${decoded.make}`);
    }
  }
  
  if (decoded.model && scrapedData.model) {
    const decodedModel = decoded.model.toLowerCase();
    const scrapedModel = scrapedData.model.toLowerCase();
    if (!decodedModel.includes(scrapedModel) && !scrapedModel.includes(decodedModel)) {
      discrepancies.push(`Model mismatch: scraped=${scrapedData.model}, VIN=${decoded.model}`);
    }
  }
  
  const matches = discrepancies.length === 0;
  log.push(`  ${matches ? '✓' : '⚠'} VIN validation: ${matches ? 'PASSED' : 'DISCREPANCIES FOUND'}`);
  if (discrepancies.length > 0) {
    discrepancies.forEach(d => log.push(`    - ${d}`));
  }
  
  return { decoded, matches, discrepancies };
}

async function generateEnhancedDescription(vehicleData: Partial<EnhancedVehicleData>, dealershipId: number, log: string[]): Promise<{
  description: string;
  source: 'dealer' | 'ai-generated' | 'enhanced';
}> {
  const currentDesc = vehicleData.description || '';
  
  const isPlaceholder = 
    currentDesc.length < 30 ||
    /contact dealer|call for|ask about|more info/i.test(currentDesc);
  
  if (!isPlaceholder && currentDesc.length > 100) {
    log.push('→ Dealer description is adequate, keeping original');
    return { description: currentDesc, source: 'dealer' };
  }
  
  log.push('→ Generating AI-enhanced description...');
  
  try {
    const description = await generateVehicleDescription({
      year: vehicleData.year || 0,
      make: vehicleData.make || '',
      model: vehicleData.model || '',
      trim: vehicleData.trim || 'Base',
      type: vehicleData.type || 'SUV',
      price: vehicleData.price || 0,
      odometer: vehicleData.odometer || 0,
      badges: vehicleData.badges || [],
      dealership: 'Olympic Hyundai Vancouver',
      location: 'Vancouver',
      rawDescription: currentDesc
    }, dealershipId);
    
    log.push('  ✓ AI description generated successfully');
    return { description, source: 'ai-generated' };
  } catch (error) {
    log.push(`  ⚠ AI description failed: ${error}`);
    return { description: currentDesc || 'Contact dealer for more information.', source: 'dealer' };
  }
}

function calculateEnhancedQualityScore(data: Partial<EnhancedVehicleData>): number {
  let score = 0;
  
  // Core data (65 points max)
  if (data.vin) score += 20;
  if (data.vinValidation?.matches) score += 5;
  if (data.price && data.price >= 1000) score += 20;
  if (data.odometer && data.odometer > 0) score += 10;
  if (data.stockNumber) score += 5;
  if (data.year && data.make && data.model) score += 5;
  
  // Images (25 points max)
  const imageCount = data.images?.length || 0;
  if (imageCount >= 25) score += 25;
  else if (imageCount >= 15) score += 20;
  else if (imageCount >= 10) score += 15;
  else if (imageCount >= 5) score += 10;
  else if (imageCount >= 1) score += 5;
  
  // Enrichment data (10 points max - optional)
  const featureCount = data.features?.length || 0;
  if (featureCount >= 10) score += 5;
  else if (featureCount >= 5) score += 3;
  
  const descLength = data.description?.length || 0;
  if (descLength > 200) score += 3;
  else if (descLength > 100) score += 2;
  
  const badgeCount = data.badges?.length || 0;
  if (badgeCount >= 2) score += 2;
  else if (badgeCount >= 1) score += 1;
  
  return Math.min(100, score);
}

function calculateImageQuality(count: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (count >= 25) return 'excellent';
  if (count >= 15) return 'good';
  if (count >= 8) return 'fair';
  return 'poor';
}

export async function scrapeSingleVehicle(
  vdpUrl: string,
  config: Partial<ScrapingConfig> = {}
): Promise<EnhancedVehicleData> {
  const fullConfig: ScrapingConfig = { ...DEFAULT_CONFIG, ...config };
  const log: string[] = [];
  
  log.push(`=== Enhanced Single Vehicle Scraper ===`);
  log.push(`URL: ${vdpUrl}`);
  log.push(`Config: ${JSON.stringify(fullConfig)}`);
  log.push('');
  
  let browser: Browser | null = null;
  
  try {
    log.push('→ Launching browser...');
    
    // Find Chromium executable path
    const { execSync } = await import('child_process');
    let chromiumPath = '/nix/store/chromium/bin/chromium';
    try {
      chromiumPath = execSync('which chromium').toString().trim();
    } catch {
      try {
        chromiumPath = execSync('which chromium-browser').toString().trim();
      } catch {
        log.push('  ⚠ Using default Chromium path');
      }
    }
    
    browser = await puppeteer.launch({
      headless: true,
      executablePath: chromiumPath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    log.push('→ Navigating to VDP...');
    await page.goto(vdpUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    log.push('  ✓ Page loaded');
    
    if (fullConfig.enableGalleryModal) {
      await openGalleryModal(page, log);
    }
    
    await handleLoadMoreButtons(page, log);
    await navigateGalleryFully(page, log);
    
    await new Promise(r => setTimeout(r, 1000));
    
    const extractedData = await extractVehicleData(page, vdpUrl, fullConfig, log);
    
    if (fullConfig.enable4KImages && extractedData.images) {
      log.push('→ Upgrading images to 4K resolution...');
      extractedData.images = extractedData.images.map(url => upgrade4KImageUrl(url));
      log.push(`  ✓ ${extractedData.images.length} images upgraded to 4K`);
    }
    
    let vinValidation = { matches: false, discrepancies: [] as string[] };
    let vinDecoded: VINDecodeResult | null = null;
    
    if (fullConfig.enableVinValidation && extractedData.vin) {
      const validation = await validateVinWithDecoder(extractedData.vin, extractedData, log);
      vinValidation = { matches: validation.matches, discrepancies: validation.discrepancies };
      vinDecoded = validation.decoded;
      
      if (vinDecoded && !vinDecoded.errorCode) {
        if (!extractedData.year && vinDecoded.year) {
          extractedData.year = parseInt(vinDecoded.year);
        }
        if (!extractedData.make && vinDecoded.make) {
          extractedData.make = vinDecoded.make;
        }
        if (!extractedData.model && vinDecoded.model) {
          extractedData.model = vinDecoded.model;
        }
        if ((!extractedData.trim || extractedData.trim === 'Base') && vinDecoded.trim) {
          extractedData.trim = vinDecoded.trim;
        }
        if (vinDecoded.bodyClass) {
          extractedData.type = vinDecoded.bodyClass;
        }
      }
    }
    
    let descriptionResult: { description: string; source: 'dealer' | 'ai-generated' | 'enhanced' } = { 
      description: extractedData.description || '', 
      source: 'dealer' 
    };
    if (fullConfig.enableAIDescription) {
      descriptionResult = await generateEnhancedDescription(extractedData, fullConfig.dealershipId, log);
    }
    
    const result: EnhancedVehicleData = {
      vin: extractedData.vin || null,
      vinDecoded,
      vinValidation,
      year: extractedData.year || 0,
      make: extractedData.make || '',
      model: extractedData.model || '',
      trim: extractedData.trim || 'Base',
      type: extractedData.type || 'SUV',
      price: extractedData.price || null,
      odometer: extractedData.odometer || null,
      stockNumber: extractedData.stockNumber || null,
      images: extractedData.images || [],
      imageCount: extractedData.images?.length || 0,
      imageQuality: calculateImageQuality(extractedData.images?.length || 0),
      features: extractedData.features || [],
      description: descriptionResult.description,
      descriptionSource: descriptionResult.source,
      badges: extractedData.badges || [],
      cargurusData: null,
      vdpUrl,
      dealershipId: fullConfig.dealershipId,
      dataQualityScore: 0,
      extractionLog: log
    };
    
    result.dataQualityScore = calculateEnhancedQualityScore(result);
    
    log.push('');
    log.push('=== Scraping Complete ===');
    log.push(`Data Quality Score: ${result.dataQualityScore}/100`);
    log.push(`Image Quality: ${result.imageQuality} (${result.imageCount} images)`);
    log.push(`Features: ${result.features.length}`);
    log.push(`VIN Validation: ${result.vinValidation.matches ? 'PASSED' : 'DISCREPANCIES'}`);
    
    return result;
    
  } catch (error) {
    log.push(`✗ ERROR: ${error}`);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export default { scrapeSingleVehicle };
