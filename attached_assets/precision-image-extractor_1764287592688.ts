/**
 * PRECISION VEHICLE IMAGE EXTRACTOR
 * ==================================
 * 
 * This module ONLY extracts images that belong to the specific vehicle being scraped.
 * It filters out:
 * - Similar/recommended vehicle thumbnails
 * - "You may also like" suggestions  
 * - Promotional banners
 * - Dealer logos
 * - Stock photos of different vehicles
 * 
 * KEY STRATEGIES:
 * 1. Only extract from the PRIMARY GALLERY container
 * 2. Match image URLs to VIN/Stock number when possible
 * 3. Click through EVERY slide to get the full-resolution "active" image
 * 4. Validate image dimensions (real photos are larger than thumbnails)
 * 5. Check image URL paths for vehicle-specific identifiers
 */

import type { Page } from 'puppeteer';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Containers that are KNOWN to contain "similar vehicles" - EXCLUDE these
 */
const EXCLUDED_CONTAINERS = [
  '.similar-vehicles',
  '.recommended-vehicles', 
  '.you-may-also-like',
  '.related-vehicles',
  '.other-vehicles',
  '.more-vehicles',
  '[class*="similar"]',
  '[class*="recommend"]',
  '[class*="related"]',
  '[class*="also-like"]',
  '[class*="other-vehicle"]',
  '[data-section="similar"]',
  '[data-section="recommended"]',
  'footer',
  'aside',
  '.sidebar',
  '.footer-vehicles',
];

/**
 * Containers that ARE the primary gallery - ONLY extract from these
 */
const PRIMARY_GALLERY_SELECTORS = [
  // eDealer/Convertus (Olympic Hyundai Vancouver uses this)
  '.photo-gallery',
  '.photo-gallery__viewport',
  '.photo-gallery__slides',
  '.mobile-slider',
  '.mobile-slider__viewport',
  
  // Common gallery patterns
  '.vehicle-gallery',
  '.vehicle-media-gallery',
  '.vdp-gallery',
  '.vdp-media',
  '.main-gallery',
  '.primary-gallery',
  '#vehicle-gallery',
  '#main-gallery',
  
  // Slider libraries
  '.swiper-container:not([class*="similar"]):not([class*="recommend"])',
  '.slick-slider:not([class*="similar"]):not([class*="recommend"])',
  
  // Data attributes
  '[data-gallery="main"]',
  '[data-gallery="primary"]',
  '[data-gallery="vehicle"]',
  '[x-data*="gallery"]',  // Alpine.js
];

/**
 * Image URL patterns that indicate a REAL vehicle photo (not a banner/icon)
 */
const VEHICLE_PHOTO_PATTERNS = [
  /autotradercdn\.ca\/photos/i,
  /photos\.autotrader/i,
  /homenetiol\.com/i,
  /homenet-inc\.com/i,
  /cargurus\.com\/images\/forsale/i,
  /dealercdn\.com/i,
  /ddclstatic\.com/i,
  /dealerinspire\.com\/vehicles/i,
  /photos\.dealer\.com/i,
  /spincar\.com/i,
  /evoxcdn\.com/i,
  /vauto\.com/i,
  /\/(stock|inventory|vehicles?|photos?|media|gallery)\//i,
];

/**
 * URL patterns that indicate NOT a vehicle photo
 */
const BLOCKED_PATTERNS = [
  /logo/i,
  /icon/i,
  /badge/i,
  /banner/i,
  /promo/i,
  /ad[s]?\//i,
  /button/i,
  /arrow/i,
  /chevron/i,
  /social/i,
  /facebook/i,
  /twitter/i,
  /instagram/i,
  /placeholder/i,
  /no-?image/i,
  /coming-?soon/i,
  /spinner/i,
  /loading/i,
  /pixel\.gif/i,
  /spacer/i,
  /transparent/i,
  /convertus\.com\/uploads\/sites/i,  // eDealer promotional banners
  /bg-/i,
  /-bg\./i,
  /background/i,
  /form-/i,
  /welcome/i,
  /get-approved/i,
  /pictogram/i,
  /1x1/i,
  /tracking/i,
  /analytics/i,
];

// =============================================================================
// TYPES
// =============================================================================

export interface ExtractedImage {
  url: string;
  originalUrl: string;      // Before resolution upgrade
  source: 'gallery-active' | 'gallery-slide' | 'gallery-thumbnail' | 'data-attr';
  slideIndex: number;       // Which slide this came from
  isActive: boolean;        // Was this the "active" full-res image?
  matchesVin: boolean;      // Does URL contain VIN/stock number?
  estimatedWidth: number;
  estimatedHeight: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface ExtractionResult {
  images: ExtractedImage[];
  totalSlides: number;
  vin: string | null;
  stockNumber: string | null;
  debug: {
    galleryFound: boolean;
    gallerySelector: string | null;
    slidesFound: number;
    imagesExtracted: number;
    imagesFiltered: number;
    filterReasons: Record<string, number>;
  };
}

// =============================================================================
// IMAGE URL MAXIMIZER
// =============================================================================

function maximizeImageUrl(url: string): string {
  if (!url) return url;
  
  let maximized = url;
  
  // AutoTrader CDN
  if (/autotradercdn\.ca/i.test(url)) {
    const base = url.split('?')[0];
    maximized = `${base}?w=2048&h=1536&fit=bounds&auto=webp&quality=90`;
  }
  // CarGurus
  else if (/cargurus\.com\/images\/forsale/i.test(url)) {
    const base = url.split('?')[0];
    maximized = `${base}?io=true&width=2048&height=1536&fit=bounds&format=jpg&quality=90`;
  }
  // HomeNet
  else if (/homenetiol|homenet-inc/i.test(url)) {
    maximized = url.replace(/\/\d{3,4}\//g, '/2048/');
  }
  // DealerInspire
  else if (/dealerinspire/i.test(url)) {
    maximized = url
      .replace(/\/thumb\//g, '/original/')
      .replace(/\/small\//g, '/original/')
      .replace(/\/medium\//g, '/original/');
  }
  // Generic size replacement
  else {
    maximized = url
      .replace(/-\d+x\d+\./g, '-2048x1536.')
      .replace(/_\d+x\d+\./g, '_2048x1536.');
  }
  
  return maximized;
}

function estimateDimensions(url: string): { width: number; height: number } {
  const match = url.match(/(\d{3,4})x(\d{3,4})/);
  if (match) {
    return { width: parseInt(match[1]), height: parseInt(match[2]) };
  }
  
  // Check for width-only patterns
  const wMatch = url.match(/[?&]w(?:idth)?=(\d+)/i);
  if (wMatch) {
    const w = parseInt(wMatch[1]);
    return { width: w, height: Math.round(w * 0.75) };
  }
  
  return { width: 0, height: 0 };
}

// =============================================================================
// MAIN EXTRACTION SCRIPT (Runs in browser context)
// =============================================================================

/**
 * This script runs inside the page context via page.evaluate()
 */
function createExtractionScript(vin: string | null, stockNumber: string | null): string {
  return `(async function() {
    const VIN = ${JSON.stringify(vin)};
    const STOCK = ${JSON.stringify(stockNumber)};
    
    const result = {
      images: [],
      totalSlides: 0,
      debug: {
        galleryFound: false,
        gallerySelector: null,
        slidesFound: 0,
        imagesExtracted: 0,
        imagesFiltered: 0,
        filterReasons: {}
      }
    };
    
    const seenUrls = new Set();
    
    // ========================================
    // HELPER: Check if URL matches VIN/Stock
    // ========================================
    function urlMatchesVehicle(url) {
      if (!url) return false;
      const lower = url.toLowerCase();
      
      if (VIN && lower.includes(VIN.toLowerCase())) return true;
      if (STOCK && lower.includes(STOCK.toLowerCase())) return true;
      
      // Also check for partial VIN (last 8 chars often used)
      if (VIN && VIN.length === 17) {
        const partial = VIN.slice(-8).toLowerCase();
        if (lower.includes(partial)) return true;
      }
      
      return false;
    }
    
    // ========================================
    // HELPER: Check if URL is a vehicle photo
    // ========================================
    function isVehiclePhotoUrl(url) {
      if (!url || url.length < 20) return false;
      
      const lower = url.toLowerCase();
      
      // Block patterns
      const blocked = [
        'logo', 'icon', 'badge', 'banner', 'promo', 'button', 'arrow',
        'social', 'facebook', 'twitter', 'placeholder', 'no-image',
        'spinner', 'loading', 'pixel.gif', 'spacer', 'transparent',
        'convertus.com/uploads/sites', 'bg-', '-bg.', 'background',
        'form-', 'welcome', 'get-approved', '1x1', 'tracking'
      ];
      
      for (const b of blocked) {
        if (lower.includes(b)) {
          result.debug.filterReasons[b] = (result.debug.filterReasons[b] || 0) + 1;
          return false;
        }
      }
      
      // Must have image extension or be from known CDN
      const hasImageExt = /\\.(jpg|jpeg|png|webp|avif)/i.test(lower);
      const isKnownCDN = /(autotrader|homenet|cargurus|dealer|spincar|forsale)/i.test(lower);
      
      if (!hasImageExt && !isKnownCDN) {
        result.debug.filterReasons['no-image-ext'] = (result.debug.filterReasons['no-image-ext'] || 0) + 1;
        return false;
      }
      
      return true;
    }
    
    // ========================================
    // HELPER: Check if element is in excluded container
    // ========================================
    function isInExcludedContainer(element) {
      const excludedSelectors = [
        '.similar-vehicles', '.recommended-vehicles', '.you-may-also-like',
        '.related-vehicles', '.other-vehicles', '[class*="similar"]',
        '[class*="recommend"]', '[class*="related"]', 'footer', 'aside',
        '.sidebar', '.footer'
      ];
      
      let current = element;
      while (current && current !== document.body) {
        for (const selector of excludedSelectors) {
          if (current.matches && current.matches(selector)) {
            result.debug.filterReasons['excluded-container'] = (result.debug.filterReasons['excluded-container'] || 0) + 1;
            return true;
          }
        }
        current = current.parentElement;
      }
      return false;
    }
    
    // ========================================
    // HELPER: Add image if valid
    // ========================================
    function addImage(url, source, slideIndex, isActive) {
      if (!url || seenUrls.has(url)) return false;
      if (!isVehiclePhotoUrl(url)) return false;
      
      seenUrls.add(url);
      
      // Estimate dimensions from URL
      let width = 0, height = 0;
      const sizeMatch = url.match(/(\\d{3,4})x(\\d{3,4})/);
      if (sizeMatch) {
        width = parseInt(sizeMatch[1]);
        height = parseInt(sizeMatch[2]);
      }
      
      // Skip thumbnails (small images)
      if (width > 0 && width < 300) {
        result.debug.filterReasons['too-small'] = (result.debug.filterReasons['too-small'] || 0) + 1;
        return false;
      }
      
      const matchesVin = urlMatchesVehicle(url);
      
      result.images.push({
        url: url,
        source: source,
        slideIndex: slideIndex,
        isActive: isActive,
        matchesVin: matchesVin,
        estimatedWidth: width,
        estimatedHeight: height,
        confidence: matchesVin ? 'high' : (isActive ? 'high' : 'medium')
      });
      
      result.debug.imagesExtracted++;
      return true;
    }
    
    // ========================================
    // STEP 1: Find the PRIMARY gallery
    // ========================================
    const gallerySelectors = [
      '.photo-gallery',
      '.photo-gallery__viewport', 
      '.mobile-slider',
      '.vehicle-gallery',
      '.vdp-gallery',
      '.main-gallery',
      '#vehicle-gallery',
      '.swiper-container',
      '.slick-slider',
      '[data-gallery="main"]',
      '[x-data*="gallery"]'
    ];
    
    let gallery = null;
    let gallerySelector = null;
    
    for (const selector of gallerySelectors) {
      const candidates = document.querySelectorAll(selector);
      for (const candidate of candidates) {
        // Skip if in excluded container
        if (isInExcludedContainer(candidate)) continue;
        
        // Check if it contains images
        const hasImages = candidate.querySelectorAll('img').length > 0;
        if (hasImages) {
          gallery = candidate;
          gallerySelector = selector;
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
    result.debug.gallerySelector = gallerySelector;
    
    // ========================================
    // STEP 2: Find all slides/items in gallery
    // ========================================
    const slideSelectors = [
      '.photo-gallery__slide',
      '.mobile-slider__slide',
      '.swiper-slide',
      '.slick-slide',
      '.gallery-item',
      '.gallery-slide',
      '[data-slide]',
      'li',  // Often galleries use <ul><li>
    ];
    
    let slides = [];
    for (const selector of slideSelectors) {
      const found = gallery.querySelectorAll(selector);
      if (found.length > 1) {  // Need at least 2 to be a gallery
        slides = Array.from(found);
        break;
      }
    }
    
    // Fallback: just get all images in gallery
    if (slides.length === 0) {
      slides = Array.from(gallery.querySelectorAll('img')).map((img, i) => {
        const wrapper = document.createElement('div');
        wrapper.appendChild(img.cloneNode(true));
        return wrapper;
      });
    }
    
    result.debug.slidesFound = slides.length;
    result.totalSlides = slides.length;
    
    // ========================================
    // STEP 3: Extract images from each slide
    // ========================================
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      
      // Check if this slide is "active" (currently displayed)
      const isActive = slide.classList?.contains('active') || 
                       slide.classList?.contains('slick-active') ||
                       slide.classList?.contains('swiper-slide-active') ||
                       slide.getAttribute('aria-hidden') === 'false';
      
      // Find images in this slide
      const imgs = slide.querySelectorAll('img');
      
      for (const img of imgs) {
        // Skip if in excluded area
        if (isInExcludedContainer(img)) continue;
        
        // Try multiple sources (lazy loading support)
        const sources = [
          img.src,
          img.currentSrc,
          img.getAttribute('data-src'),
          img.getAttribute('data-lazy-src'),
          img.getAttribute('data-original'),
          img.getAttribute('data-full-src'),
          img.getAttribute('data-large-src'),
          img.getAttribute('data-hi-res'),
          img.getAttribute('data-zoom-image')
        ].filter(Boolean);
        
        for (const src of sources) {
          addImage(src, isActive ? 'gallery-active' : 'gallery-slide', i, isActive);
        }
      }
      
      // Also check for background images
      const bgElements = slide.querySelectorAll('[style*="background"]');
      for (const el of bgElements) {
        const style = el.getAttribute('style') || '';
        const match = style.match(/url\\(['"]?([^'"\\)]+)['"]?\\)/);
        if (match && match[1]) {
          addImage(match[1], 'gallery-slide', i, isActive);
        }
      }
    }
    
    // ========================================
    // STEP 4: Check for high-res data attributes on gallery itself
    // ========================================
    const galleryDataAttrs = [
      'data-images',
      'data-photos', 
      'data-gallery-items',
      'x-data'
    ];
    
    for (const attr of galleryDataAttrs) {
      const data = gallery.getAttribute(attr);
      if (data && data.includes('http')) {
        try {
          // Try to parse as JSON
          const parsed = JSON.parse(data.replace(/&quot;/g, '"'));
          const extractUrls = (obj) => {
            if (typeof obj === 'string' && obj.match(/\\.(jpg|jpeg|png|webp)/i)) {
              addImage(obj, 'data-attr', -1, false);
            } else if (Array.isArray(obj)) {
              obj.forEach(extractUrls);
            } else if (typeof obj === 'object' && obj) {
              Object.values(obj).forEach(extractUrls);
            }
          };
          extractUrls(parsed);
        } catch (e) {
          // Not JSON, try regex extraction
          const urlMatches = data.matchAll(/(https?:\\/\\/[^"'\\s]+\\.(?:jpg|jpeg|png|webp))/gi);
          for (const match of urlMatches) {
            addImage(match[1], 'data-attr', -1, false);
          }
        }
      }
    }
    
    return result;
  })()`;
}

// =============================================================================
// GALLERY NAVIGATION - Click through every slide
// =============================================================================

/**
 * Click through every slide in the gallery to load full-resolution images
 * Returns the number of clicks performed
 */
export async function navigateEntireGallery(page: Page): Promise<{
  clicks: number;
  method: string;
}> {
  // First, try to find how many slides there are
  const slideCount = await page.evaluate(() => {
    const indicators = [
      '.photo-gallery__dots button',
      '.photo-gallery__pagination span',
      '.swiper-pagination-bullet',
      '.slick-dots li',
      '.gallery-dots span',
      '[data-slide-index]'
    ];
    
    for (const sel of indicators) {
      const dots = document.querySelectorAll(sel);
      if (dots.length > 1) return dots.length;
    }
    
    // Try counting slides directly
    const slideSelectors = [
      '.photo-gallery__slide',
      '.mobile-slider__slide', 
      '.swiper-slide',
      '.slick-slide:not(.slick-cloned)'
    ];
    
    for (const sel of slideSelectors) {
      const slides = document.querySelectorAll(sel);
      if (slides.length > 1) return slides.length;
    }
    
    return 0;
  });
  
  console.log(`    Found ${slideCount} slides in gallery`);
  
  // Strategy 1: Click on pagination dots directly (most reliable)
  const dotClicks = await clickPaginationDots(page, slideCount);
  if (dotClicks > 0) {
    return { clicks: dotClicks, method: 'pagination-dots' };
  }
  
  // Strategy 2: Click next button repeatedly
  const nextClicks = await clickNextButton(page, Math.max(slideCount, 50));
  if (nextClicks > 0) {
    return { clicks: nextClicks, method: 'next-button' };
  }
  
  // Strategy 3: Use keyboard arrows
  const keyClicks = await useKeyboardNavigation(page, Math.max(slideCount, 50));
  if (keyClicks > 0) {
    return { clicks: keyClicks, method: 'keyboard' };
  }
  
  return { clicks: 0, method: 'none' };
}

async function clickPaginationDots(page: Page, maxClicks: number): Promise<number> {
  const dotSelectors = [
    '.photo-gallery__dots button',
    '.photo-gallery__pagination span',
    '.swiper-pagination-bullet',
    '.slick-dots li button',
    '.gallery-dots span',
    '[data-slide-to]'
  ];
  
  for (const selector of dotSelectors) {
    const dots = await page.$$(selector);
    if (dots.length < 2) continue;
    
    let clicks = 0;
    for (let i = 0; i < Math.min(dots.length, maxClicks); i++) {
      try {
        await dots[i].click();
        clicks++;
        // Wait for image to load
        await new Promise(r => setTimeout(r, 300));
      } catch {
        break;
      }
    }
    
    if (clicks > 0) return clicks;
  }
  
  return 0;
}

async function clickNextButton(page: Page, maxClicks: number): Promise<number> {
  const nextSelectors = [
    '.photo-gallery__arrow--next',
    '.mobile-slider__arrow--next',
    '.swiper-button-next',
    '.slick-next',
    '[class*="gallery"] [class*="next"]',
    '[class*="slider"] [class*="next"]',
    'button[aria-label*="next" i]',
    '[data-direction="next"]'
  ];
  
  for (const selector of nextSelectors) {
    const btn = await page.$(selector);
    if (!btn) continue;
    
    let clicks = 0;
    let lastImageUrl = '';
    let sameImageCount = 0;
    
    for (let i = 0; i < maxClicks; i++) {
      try {
        // Check if button is still visible
        const isVisible = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && 
                 style.display !== 'none' && 
                 style.visibility !== 'hidden' &&
                 !el.hasAttribute('disabled');
        }, selector);
        
        if (!isVisible) break;
        
        await btn.click();
        clicks++;
        
        // Wait for transition
        await new Promise(r => setTimeout(r, 250));
        
        // Check if image changed (detect end of gallery)
        const currentImageUrl = await page.evaluate(() => {
          const active = document.querySelector('.photo-gallery__slide.active img, .swiper-slide-active img, .slick-active img');
          return active?.getAttribute('src') || '';
        });
        
        if (currentImageUrl === lastImageUrl) {
          sameImageCount++;
          if (sameImageCount >= 2) break; // Same image twice = end of gallery
        } else {
          sameImageCount = 0;
          lastImageUrl = currentImageUrl;
        }
        
      } catch {
        break;
      }
    }
    
    if (clicks > 0) return clicks;
  }
  
  return 0;
}

async function useKeyboardNavigation(page: Page, maxClicks: number): Promise<number> {
  // Focus on gallery first
  await page.evaluate(() => {
    const gallery = document.querySelector('.photo-gallery, .vehicle-gallery, .swiper-container');
    if (gallery && (gallery as HTMLElement).focus) {
      (gallery as HTMLElement).focus();
    }
  });
  
  let clicks = 0;
  for (let i = 0; i < maxClicks; i++) {
    try {
      await page.keyboard.press('ArrowRight');
      clicks++;
      await new Promise(r => setTimeout(r, 200));
    } catch {
      break;
    }
  }
  
  return clicks;
}

// =============================================================================
// MAIN EXTRACTION FUNCTION
// =============================================================================

/**
 * Extract ONLY the actual vehicle photos from a VDP page
 */
export async function extractVehicleImages(
  page: Page,
  vin: string | null,
  stockNumber: string | null
): Promise<ExtractionResult> {
  
  console.log(`    Extracting images (VIN: ${vin || 'unknown'}, Stock: ${stockNumber || 'unknown'})`);
  
  // Step 1: Navigate through entire gallery to load all images
  const navResult = await navigateEntireGallery(page);
  console.log(`    Gallery navigation: ${navResult.clicks} clicks via ${navResult.method}`);
  
  // Step 2: Wait for images to settle
  await new Promise(r => setTimeout(r, 800));
  
  // Step 3: Extract images using our precision script
  const extractionResult = await page.evaluate(createExtractionScript(vin, stockNumber)) as ExtractionResult;
  
  // Step 4: Maximize image URLs and deduplicate
  const processedImages: ExtractedImage[] = [];
  const seenBases = new Set<string>();
  
  for (const img of extractionResult.images) {
    const maximizedUrl = maximizeImageUrl(img.url);
    const base = maximizedUrl.split('?')[0].replace(/-\d+x\d+\./, '.');
    
    if (seenBases.has(base)) continue;
    seenBases.add(base);
    
    const dims = estimateDimensions(maximizedUrl);
    
    processedImages.push({
      ...img,
      url: maximizedUrl,
      originalUrl: img.url,
      estimatedWidth: dims.width || img.estimatedWidth,
      estimatedHeight: dims.height || img.estimatedHeight
    });
  }
  
  // Step 5: Sort by confidence and quality
  processedImages.sort((a, b) => {
    // High confidence first
    const confOrder = { high: 0, medium: 1, low: 2 };
    const confDiff = confOrder[a.confidence] - confOrder[b.confidence];
    if (confDiff !== 0) return confDiff;
    
    // Active slides first
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    
    // By slide index
    return a.slideIndex - b.slideIndex;
  });
  
  console.log(`    Extracted ${processedImages.length} images (filtered ${extractionResult.debug.imagesFiltered})`);
  
  return {
    images: processedImages,
    totalSlides: extractionResult.totalSlides,
    vin,
    stockNumber,
    debug: extractionResult.debug
  };
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate that extracted images belong to the correct vehicle
 */
export function validateImages(
  images: ExtractedImage[],
  expectedVin: string | null,
  expectedStock: string | null
): {
  valid: ExtractedImage[];
  suspicious: ExtractedImage[];
  confidence: 'high' | 'medium' | 'low';
} {
  const valid: ExtractedImage[] = [];
  const suspicious: ExtractedImage[] = [];
  
  for (const img of images) {
    // If VIN/Stock match, definitely valid
    if (img.matchesVin) {
      valid.push(img);
      continue;
    }
    
    // If from gallery-active source, likely valid
    if (img.source === 'gallery-active') {
      valid.push(img);
      continue;
    }
    
    // Check URL for suspicious patterns
    const lower = img.url.toLowerCase();
    const isSuspicious = 
      /similar|recommend|related|also-like|other/i.test(lower) ||
      img.confidence === 'low';
    
    if (isSuspicious) {
      suspicious.push(img);
    } else {
      valid.push(img);
    }
  }
  
  // Determine overall confidence
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (valid.length > 0) {
    const vinMatches = valid.filter(v => v.matchesVin).length;
    if (vinMatches > 0 || valid.length >= 10) {
      confidence = 'high';
    } else if (valid.length >= 5) {
      confidence = 'medium';
    }
  }
  
  return { valid, suspicious, confidence };
}

// =============================================================================
// EXPORT FOR USE
// =============================================================================

export default {
  extractVehicleImages,
  navigateEntireGallery,
  validateImages,
  maximizeImageUrl
};
