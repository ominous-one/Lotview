/**
 * PRECISION VEHICLE IMAGE EXTRACTOR
 * ==================================
 * 
 * Extracts ONLY images that belong to the specific vehicle being scraped.
 * Filters out:
 * - Similar/recommended vehicle thumbnails
 * - "You may also like" suggestions
 * - Promotional banners
 * - Dealer logos
 * - Stock photos of different vehicles
 * 
 * KEY STRATEGIES:
 * 1. Only extract from PRIMARY GALLERY container
 * 2. Match image URLs to VIN/Stock number when possible
 * 3. Click through EVERY slide to load full-resolution images
 * 4. Validate image dimensions (real photos are larger than thumbnails)
 * 5. Transform CDN URLs for maximum resolution
 */

import type { Page } from 'puppeteer';

export interface ExtractedImage {
  url: string;
  originalUrl?: string;  // Original URL before normalization (for VIN matching)
  source: 'gallery-active' | 'gallery-slide' | 'gallery-thumbnail' | 'data-attr' | 'background';
  slideIndex: number;
  isActive: boolean;
  matchesVin: boolean;
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

// Selectors for the main hero image / gallery trigger that opens fullscreen view
const GALLERY_TRIGGER_SELECTORS = [
  // Main hero image / container on typical dealer sites
  '.photo-gallery__main img',
  '.photo-gallery__main',
  '.vehicle-gallery__hero img',
  '.vehicle-gallery__hero',
  '.vdp-hero__image-container img',
  '.vdp-hero__image-container',
  '.vehicle-media__hero img',
  '.vehicle-media__hero',
  '.gallery-main img',
  '.gallery-main',
  '.vehicle-main-image',
  '.vehicle-main-image img',
  // Generic "open gallery" triggers
  '[data-gallery-open]',
  '[data-action="open-gallery"]',
  '[data-open="gallery"]',
  '[data-lightbox]',
  '.lightbox-trigger',
  '.gallery-trigger',
  '.fancybox-trigger'
];

// Selectors for fullscreen / lightbox overlay galleries
const OVERLAY_GALLERY_SELECTORS = [
  // Fullscreen / lightbox style galleries
  '.lightbox',
  '.lightbox__content',
  '.gallery-modal',
  '.gallery-modal__content',
  '.gallery--fullscreen',
  '.vehicle-gallery--fullscreen',
  '.fancybox-container',
  '.fancybox-stage',
  '.mfp-wrap',
  '.mfp-content',
  '.modal--gallery',
  // Photo gallery fullscreen modes
  '.photo-gallery--fullscreen',
  '.photo-gallery__fullscreen',
  '[class*="fullscreen-gallery"]',
  '[class*="gallery-fullscreen"]'
];

const PRIMARY_GALLERY_SELECTORS = [
  // Fullscreen / overlay galleries (prefer these - they have full-res images)
  ...OVERLAY_GALLERY_SELECTORS,
  // Inline / regular galleries
  '.photo-gallery',
  '.photo-gallery__viewport',
  '.photo-gallery__slides',
  '.mobile-slider',
  '.mobile-slider__viewport',
  '.vehicle-gallery',
  '.vehicle-media-gallery',
  '.vdp-gallery',
  '.vdp-media',
  '.main-gallery',
  '.primary-gallery',
  '#vehicle-gallery',
  '#main-gallery',
  '.swiper-container:not([class*="similar"]):not([class*="recommend"])',
  '.slick-slider:not([class*="similar"]):not([class*="recommend"])',
  '[data-gallery="main"]',
  '[data-gallery="primary"]',
  '[data-gallery="vehicle"]',
  '[x-data*="gallery"]',
];

const BLOCKED_PATTERNS = [
  'logo', 'icon', 'badge', 'banner', 'promo', 'button', 'arrow',
  'chevron', 'social', 'facebook', 'twitter', 'instagram', 'linkedin',
  'placeholder', 'no-image', 'coming-soon', 'spinner', 'loading',
  'pixel.gif', 'spacer', 'transparent', 'convertus.com/uploads/sites',
  'bg-', '-bg.', 'background', 'form-', 'welcome', 'get-approved',
  'pictogram', '1x1', 'tracking', 'analytics', 'pixel',
  'home-delivery', 'car-buying', 'hassle', 'quote-', '-dark.png', '-light.png'
];

const TRUSTED_CDN_PATTERNS = [
  'autotradercdn.ca', 'photos.autotrader', 'homenetiol.com', 'homenet-inc.com',
  'cargurus.com/images/forsale', 'dealercdn.com', 'ddclstatic.com',
  'dealerinspire.com', 'photos.dealer.com', 'spincar.com', 'evoxcdn.com',
  'vauto.com', '/vehicles/', '/inventory/', '/stock/', '/photos/', '/media/', '/gallery/'
];

export function maximizeImageUrl(url: string): string {
  if (!url) return url;
  
  // CONSERVATIVE APPROACH: Only transform URLs from CDNs we know support these parameters
  // For unknown CDNs, return the original URL to avoid 404s
  
  // AutoTrader CDN - known to support dynamic resizing
  if (/autotradercdn\.ca/i.test(url)) {
    const base = url.split('?')[0];
    return `${base}?w=2048&h=1536&fit=bounds&auto=webp&quality=90`;
  }
  
  // CarGurus - known to support dynamic resizing
  if (/cargurus\.com\/images\/forsale/i.test(url)) {
    const base = url.split('?')[0];
    return `${base}?io=true&width=2048&height=1536&fit=bounds&format=jpg&quality=90`;
  }
  
  // Cloudinary - known to support dynamic resizing
  if (/cloudinary\.com/i.test(url)) {
    return url.replace(/\/w_\d+/g, '/w_2048').replace(/\/h_\d+/g, '/h_1536').replace(/\/q_\d+/g, '/q_90');
  }
  
  // For all other CDNs (homenetiol, dealerinspire, ddclstatic, spincar, etc.)
  // DO NOT transform - many don't support arbitrary resolutions and will 404
  // Just return the original URL which is usually good enough resolution
  return url;
}

export function estimateDimensions(url: string): { width: number; height: number } {
  const sizeMatch = url.match(/(\d{3,4})x(\d{3,4})/);
  if (sizeMatch) {
    return { width: parseInt(sizeMatch[1]), height: parseInt(sizeMatch[2]) };
  }
  
  const wMatch = url.match(/[?&]w(?:idth)?=(\d+)/i);
  if (wMatch) {
    const w = parseInt(wMatch[1]);
    return { width: w, height: Math.round(w * 0.75) };
  }
  
  return { width: 0, height: 0 };
}

function createExtractionScript(vin: string | null, stockNumber: string | null): string {
  return `(function() {
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
    
    function urlMatchesVehicle(url) {
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
    
    function isVehiclePhotoUrl(url) {
      if (!url || url.length < 20) return false;
      const lower = url.toLowerCase();
      
      const blocked = ${JSON.stringify(BLOCKED_PATTERNS)};
      for (const b of blocked) {
        if (lower.includes(b)) {
          result.debug.filterReasons[b] = (result.debug.filterReasons[b] || 0) + 1;
          return false;
        }
      }
      
      const hasImageExt = /\\.(jpg|jpeg|png|webp|avif)/i.test(lower);
      const trustedCdns = ${JSON.stringify(TRUSTED_CDN_PATTERNS)};
      const isKnownCDN = trustedCdns.some(cdn => lower.includes(cdn.toLowerCase()));
      
      if (!hasImageExt && !isKnownCDN) {
        result.debug.filterReasons['no-image-ext'] = (result.debug.filterReasons['no-image-ext'] || 0) + 1;
        return false;
      }
      
      return true;
    }
    
    function isInExcludedContainer(element) {
      const excluded = ${JSON.stringify(EXCLUDED_CONTAINERS)};
      let current = element;
      while (current && current !== document.body) {
        for (const sel of excluded) {
          if (current.matches && current.matches(sel)) {
            result.debug.filterReasons['excluded-container'] = (result.debug.filterReasons['excluded-container'] || 0) + 1;
            return true;
          }
        }
        current = current.parentElement;
      }
      return false;
    }
    
    function normalizeUrl(src) {
      if (!src) return null;
      if (src.startsWith('data:') || src.startsWith('blob:')) return null;
      let normalized = src.trim();
      if (normalized.startsWith('//')) normalized = 'https:' + normalized;
      if (normalized.startsWith('/')) normalized = window.location.origin + normalized;
      if (!normalized.startsWith('http')) return null;
      return normalized;
    }
    
    function addImage(url, source, slideIndex, isActive) {
      const originalUrl = url;
      const normalized = normalizeUrl(url);
      if (!normalized) return false;
      if (!isVehiclePhotoUrl(normalized)) return false;
      
      // Check BOTH original and normalized URLs for VIN/stock match BEFORE duplicate check
      const matchesVin = urlMatchesVehicle(originalUrl) || urlMatchesVehicle(normalized);
      
      // For duplicates: still track VIN match even if URL already seen
      const baseUrl = normalized.split('?')[0];  // Dedupe on base URL
      if (seenUrls.has(baseUrl)) {
        // If this duplicate has VIN match, upgrade existing image
        if (matchesVin) {
          const existing = result.images.find(img => img.url.split('?')[0] === baseUrl);
          if (existing && !existing.matchesVin) {
            existing.matchesVin = true;
            existing.confidence = 'high';
            result.debug.vinMatchCount = (result.debug.vinMatchCount || 0) + 1;
          }
        }
        return false;
      }
      
      seenUrls.add(baseUrl);
      
      let width = 0, height = 0;
      const sizeMatch = normalized.match(/(\\d{3,4})x(\\d{3,4})/);
      if (sizeMatch) {
        width = parseInt(sizeMatch[1]);
        height = parseInt(sizeMatch[2]);
      }
      
      if (width > 0 && width < 200) {
        result.debug.filterReasons['too-small'] = (result.debug.filterReasons['too-small'] || 0) + 1;
        return false;
      }
      
      result.images.push({
        url: normalized,
        originalUrl: originalUrl,
        source: source,
        slideIndex: slideIndex,
        isActive: isActive,
        matchesVin: matchesVin,
        estimatedWidth: width,
        estimatedHeight: height,
        confidence: matchesVin ? 'high' : (isActive ? 'high' : 'medium')
      });
      
      result.debug.imagesExtracted++;
      if (matchesVin) result.debug.vinMatchCount = (result.debug.vinMatchCount || 0) + 1;
      return true;
    }
    
    const gallerySelectors = ${JSON.stringify(PRIMARY_GALLERY_SELECTORS)};
    
    let gallery = null;
    let gallerySelector = null;
    
    for (const selector of gallerySelectors) {
      try {
        const candidates = document.querySelectorAll(selector);
        for (const candidate of candidates) {
          if (isInExcludedContainer(candidate)) continue;
          const hasImages = candidate.querySelectorAll('img').length > 0;
          if (hasImages) {
            gallery = candidate;
            gallerySelector = selector;
            break;
          }
        }
        if (gallery) break;
      } catch (e) {}
    }
    
    if (!gallery) {
      result.debug.galleryFound = false;
      return result;
    }
    
    result.debug.galleryFound = true;
    result.debug.gallerySelector = gallerySelector;
    
    const slideSelectors = [
      '.photo-gallery__slide',
      '.mobile-slider__slide',
      '.swiper-slide',
      '.slick-slide:not(.slick-cloned)',
      '.gallery-item',
      '.gallery-slide',
      '[data-slide]'
    ];
    
    let slides = [];
    for (const selector of slideSelectors) {
      const found = gallery.querySelectorAll(selector);
      if (found.length > 1) {
        slides = Array.from(found);
        break;
      }
    }
    
    if (slides.length === 0) {
      const imgs = gallery.querySelectorAll('img');
      if (imgs.length > 0) {
        slides = Array.from(imgs).map((img, i) => {
          const wrapper = { querySelectorAll: (sel) => sel === 'img' ? [img] : [], classList: { contains: () => false }, getAttribute: () => null };
          return wrapper;
        });
      }
    }
    
    result.debug.slidesFound = slides.length;
    result.totalSlides = slides.length;
    
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      
      const isActive = slide.classList?.contains('active') ||
                       slide.classList?.contains('slick-active') ||
                       slide.classList?.contains('swiper-slide-active') ||
                       slide.getAttribute?.('aria-hidden') === 'false';
      
      const imgs = typeof slide.querySelectorAll === 'function' ? slide.querySelectorAll('img') : [];
      
      for (const img of imgs) {
        if (isInExcludedContainer(img)) continue;
        
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
      
      if (typeof slide.querySelectorAll === 'function') {
        const bgElements = slide.querySelectorAll('[style*="background"]');
        for (const el of bgElements) {
          const style = el.getAttribute('style') || '';
          const match = style.match(/url\\(['"]?([^'"\\)]+)['"]?\\)/);
          if (match && match[1]) {
            addImage(match[1], 'background', i, isActive);
          }
        }
      }
    }
    
    const galleryDataAttrs = ['data-images', 'data-photos', 'data-gallery-items', 'x-data'];
    for (const attr of galleryDataAttrs) {
      const data = gallery.getAttribute(attr);
      if (data && data.includes('http')) {
        try {
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
    try {
      const dots = await page.$$(selector);
      if (dots.length < 2) continue;
      
      let clicks = 0;
      for (let i = 0; i < Math.min(dots.length, maxClicks); i++) {
        try {
          await dots[i].click();
          clicks++;
          await new Promise(r => setTimeout(r, 250));
        } catch {
          break;
        }
      }
      
      if (clicks > 0) return clicks;
    } catch {}
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
    try {
      const btn = await page.$(selector);
      if (!btn) continue;
      
      let clicks = 0;
      let lastImageUrl = '';
      let sameImageCount = 0;
      
      for (let i = 0; i < maxClicks; i++) {
        try {
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
          
          await new Promise(r => setTimeout(r, 200));
          
          const currentImageUrl = await page.evaluate(() => {
            const active = document.querySelector('.photo-gallery__slide.active img, .swiper-slide-active img, .slick-active img, [aria-hidden="false"] img');
            return active?.getAttribute('src') || '';
          });
          
          if (currentImageUrl === lastImageUrl) {
            sameImageCount++;
            if (sameImageCount >= 2) break;
          } else {
            sameImageCount = 0;
            lastImageUrl = currentImageUrl;
          }
        } catch {
          break;
        }
      }
      
      if (clicks > 0) return clicks;
    } catch {}
  }
  
  return 0;
}

async function useKeyboardNavigation(page: Page, maxClicks: number): Promise<number> {
  await page.evaluate(() => {
    const gallery = document.querySelector('.photo-gallery, .vehicle-gallery, .swiper-container, .mobile-slider');
    if (gallery && (gallery as HTMLElement).focus) {
      (gallery as HTMLElement).focus();
    }
  });
  
  let clicks = 0;
  for (let i = 0; i < maxClicks; i++) {
    try {
      await page.keyboard.press('ArrowRight');
      clicks++;
      await new Promise(r => setTimeout(r, 150));
    } catch {
      break;
    }
  }
  
  return clicks;
}

/**
 * Opens the fullscreen/lightbox gallery by clicking the main hero image
 * This ensures we get high-resolution images, not thumbnail strips
 */
async function openPrimaryGallery(page: Page): Promise<{ opened: boolean; method: string }> {
  try {
    // Create an inline script to avoid __name reference issues from tsx/esbuild
    const galleryOpenScript = `(async function() {
      var triggerSelectors = ${JSON.stringify(GALLERY_TRIGGER_SELECTORS)};
      var overlaySelectors = ${JSON.stringify(OVERLAY_GALLERY_SELECTORS)};
      
      function hasOverlay() {
        for (var i = 0; i < overlaySelectors.length; i++) {
          if (document.querySelector(overlaySelectors[i])) return true;
        }
        return false;
      }

      // If a fullscreen gallery is already open, do nothing
      if (hasOverlay()) {
        return { opened: false, method: 'overlay-already-open' };
      }

      // Find something clickable (hero image / open-gallery button)
      var trigger = null;
      for (var i = 0; i < triggerSelectors.length; i++) {
        var el = document.querySelector(triggerSelectors[i]);
        if (el) {
          trigger = el;
          break;
        }
      }

      if (!trigger) {
        // No obvious trigger – we'll just work with the inline gallery
        return { opened: false, method: 'no-trigger-found' };
      }

      // Click the hero / trigger
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      var start = Date.now();
      var timeout = 1500;

      // Wait up to ~1.5s for an overlay gallery to appear
      while (Date.now() - start < timeout) {
        if (hasOverlay()) {
          return { opened: true, method: 'trigger-clicked-overlay-opened' };
        }
        await new Promise(function(r) { setTimeout(r, 50); });
      }

      // Click didn't open a separate overlay – inline gallery only
      return { opened: false, method: 'trigger-clicked-inline-only' };
    })()`;

    const result = await page.evaluate(galleryOpenScript) as { opened: boolean; method: string };

    console.log('openPrimaryGallery:', result);
    return result;
  } catch (err) {
    console.warn('openPrimaryGallery failed:', err);
    return { opened: false, method: 'error' };
  }
}

export async function navigateEntireGallery(page: Page): Promise<{ clicks: number; method: string }> {
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
  
  const maxClicks = Math.max(slideCount, 50);
  
  const dotClicks = await clickPaginationDots(page, maxClicks);
  if (dotClicks > 0) {
    return { clicks: dotClicks, method: 'pagination-dots' };
  }
  
  const nextClicks = await clickNextButton(page, maxClicks);
  if (nextClicks > 0) {
    return { clicks: nextClicks, method: 'next-button' };
  }
  
  const keyClicks = await useKeyboardNavigation(page, Math.min(maxClicks, 30));
  if (keyClicks > 0) {
    return { clicks: keyClicks, method: 'keyboard' };
  }
  
  return { clicks: 0, method: 'none' };
}

export async function extractVehicleImages(
  page: Page,
  vin: string | null,
  stockNumber: string | null
): Promise<ExtractionResult> {
  
  // 1) Try to open the main hero gallery / fullscreen lightbox
  // This ensures we get high-resolution images, not thumbnail strips
  const galleryOpenResult = await openPrimaryGallery(page);
  
  // Give lightbox time to fully render if it opened
  if (galleryOpenResult.opened) {
    await new Promise(r => setTimeout(r, 800));
  }
  
  // 2) Click through the slides (arrows, dots, keyboard) so all big images load
  const navResult = await navigateEntireGallery(page);
  
  await new Promise(r => setTimeout(r, 600));
  
  const extractionResult = await page.evaluate(createExtractionScript(vin, stockNumber)) as ExtractionResult;
  
  const processedImages: ExtractedImage[] = [];
  const seenBases = new Set<string>();
  
  for (const img of extractionResult.images) {
    const maximizedUrl = maximizeImageUrl(img.url);
    const base = maximizedUrl.split('?')[0].replace(/-\d+x\d+\./, '.').replace(/_\d+x\d+\./, '.');
    
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
  
  processedImages.sort((a, b) => {
    const confOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const confDiff = confOrder[a.confidence] - confOrder[b.confidence];
    if (confDiff !== 0) return confDiff;
    
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    
    return a.slideIndex - b.slideIndex;
  });
  
  return {
    images: processedImages,
    totalSlides: extractionResult.totalSlides,
    vin,
    stockNumber,
    debug: {
      ...extractionResult.debug,
      imagesExtracted: processedImages.length,
      galleryOpening: galleryOpenResult,
      galleryNavigation: navResult
    } as any
  };
}

export function validateImages(
  images: ExtractedImage[],
  expectedVin: string | null,
  expectedStock: string | null
): {
  valid: ExtractedImage[];
  suspicious: ExtractedImage[];
  confidence: 'high' | 'medium' | 'low';
  hasVinMatches: boolean;
  vinMatchCount: number;
} {
  const vinMatches: ExtractedImage[] = [];
  const galleryImages: ExtractedImage[] = [];  // Both active and slide images
  const suspicious: ExtractedImage[] = [];
  
  for (const img of images) {
    const lower = img.url.toLowerCase();
    
    // Block suspicious URLs outright
    const isSuspiciousUrl =
      /similar|recommend|related|also-like|other|comparison|compete/i.test(lower) ||
      img.confidence === 'low';
    
    if (isSuspiciousUrl) {
      suspicious.push(img);
      continue;
    }
    
    // Categorize by VIN match or gallery source
    if (img.matchesVin) {
      vinMatches.push(img);
    } else if (img.source === 'gallery-active' || img.source === 'gallery-slide') {
      // Accept BOTH active and slide images from the gallery
      galleryImages.push(img);
    } else {
      suspicious.push(img);
    }
  }
  
  const vinMatchCount = vinMatches.length;
  const hasVinMatches = vinMatchCount > 0;
  
  let valid: ExtractedImage[];
  let confidence: 'high' | 'medium' | 'low';
  
  if (hasVinMatches) {
    // VIN matches found: ONLY accept VIN-matching images
    valid = vinMatches;
    // Move gallery images to suspicious since they don't match VIN
    suspicious.push(...galleryImages);
    confidence = vinMatchCount >= 5 ? 'high' : 'medium';
  } else if (galleryImages.length >= 3) {
    // No VIN matches, but enough gallery images from slides to trust
    valid = galleryImages;
    confidence = galleryImages.length >= 15 ? 'high' : (galleryImages.length >= 8 ? 'medium' : 'low');
  } else {
    // Insufficient evidence - return empty to trigger fallback
    valid = [];
    suspicious.push(...galleryImages);
    confidence = 'low';
  }
  
  return { valid, suspicious, confidence, hasVinMatches, vinMatchCount };
}

export function calculateImageQualityRating(imageCount: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (imageCount >= 20) return 'excellent';
  if (imageCount >= 10) return 'good';
  if (imageCount >= 5) return 'fair';
  return 'poor';
}

export function calculateDataQualityScore(data: {
  vin: string | null;
  price: number | null;
  odometer: number | null;
  imageCount: number;
  descriptionLength: number;
  hasVinMatchingImages: boolean;
}): number {
  let score = 0;
  
  if (data.vin) score += 25;
  if (data.price && data.price >= 1000) score += 25;
  if (data.odometer && data.odometer > 0) score += 15;
  
  if (data.imageCount >= 20) score += 20;
  else if (data.imageCount >= 10) score += 15;
  else if (data.imageCount >= 5) score += 10;
  else if (data.imageCount >= 1) score += 5;
  
  if (data.descriptionLength > 200) score += 10;
  else if (data.descriptionLength > 50) score += 5;
  
  if (data.hasVinMatchingImages) score += 5;
  
  return Math.min(100, score);
}

export default {
  extractVehicleImages,
  navigateEntireGallery,
  validateImages,
  maximizeImageUrl,
  calculateImageQualityRating,
  calculateDataQualityScore
};
