/**
 * Image Extraction Utilities
 * 
 * Handles extraction of vehicle photos from dealer websites with:
 * - Smart CDN detection
 * - Lazy-load image capturing
 * - Gallery carousel navigation
 * - Background image extraction
 * - Deduplication and quality filtering
 */

import { TRUSTED_IMAGE_CDNS, BLOCKED_IMAGE_PATTERNS } from './dealer-config';
import type { Page } from 'puppeteer';

export interface ImageExtractionResult {
  images: string[];
  debug: {
    galleryContainersFound: number;
    galleryImagesFound: number;
    cdnImagesFound: number;
    backgroundImagesFound: number;
    totalBeforeDedup: number;
    totalAfterDedup: number;
    blockedCount: number;
  };
}

/**
 * Check if a URL is from a trusted vehicle photo CDN
 */
export function isTrustedImageCDN(url: string): boolean {
  if (!url || url.length < 10) return false;
  
  const urlLower = url.toLowerCase();
  
  // First check if blocked
  for (const pattern of BLOCKED_IMAGE_PATTERNS) {
    if (urlLower.includes(pattern.toLowerCase())) {
      return false;
    }
  }
  
  // Check if from trusted CDN
  for (const cdn of TRUSTED_IMAGE_CDNS) {
    if (urlLower.includes(cdn.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if URL looks like a vehicle photo (fallback for unknown CDNs)
 */
export function looksLikeVehiclePhoto(url: string): boolean {
  if (!url || url.length < 20) return false;
  
  const urlLower = url.toLowerCase();
  
  // Must be an image
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.avif'];
  const hasImageExtension = imageExtensions.some(ext => urlLower.includes(ext));
  if (!hasImageExtension && !urlLower.includes('image') && !urlLower.includes('photo')) {
    return false;
  }
  
  // Vehicle photo indicators
  const vehicleIndicators = [
    'vehicle', 'car', 'auto', 'inventory', 'stock', 'lot',
    'exterior', 'interior', 'front', 'rear', 'side',
    'dash', 'wheel', 'engine', 'trunk', 'seat'
  ];
  
  const hasVehicleIndicator = vehicleIndicators.some(ind => urlLower.includes(ind));
  
  // Size indicators (larger images are usually vehicle photos)
  const sizePatterns = [
    /\d{3,4}x\d{3,4}/,  // e.g., 1024x768
    /w=\d{3,4}/,         // e.g., w=1024
    /width=\d{3,4}/,     // e.g., width=1024
    /size=\w+/,          // e.g., size=large
  ];
  
  const hasSizeIndicator = sizePatterns.some(pat => pat.test(urlLower));
  
  // If it's blocked, reject
  for (const pattern of BLOCKED_IMAGE_PATTERNS) {
    if (urlLower.includes(pattern.toLowerCase())) {
      return false;
    }
  }
  
  // Accept if has vehicle indicators or size indicators
  return hasVehicleIndicator || hasSizeIndicator;
}

/**
 * Normalize image URL (add protocol, remove duplicates)
 */
export function normalizeImageUrl(src: string, baseOrigin?: string): string | null {
  if (!src || src.length < 5) return null;
  
  let url = src.trim();
  
  // Handle protocol-relative URLs
  if (url.startsWith('//')) {
    url = 'https:' + url;
  }
  // Handle relative URLs
  else if (url.startsWith('/') && baseOrigin) {
    url = baseOrigin + url;
  }
  // Handle data URLs (skip them)
  else if (url.startsWith('data:')) {
    return null;
  }
  // Handle blob URLs (skip them)
  else if (url.startsWith('blob:')) {
    return null;
  }
  
  // Must start with http
  if (!url.startsWith('http')) {
    return null;
  }
  
  return url;
}

/**
 * Upgrade image URL to higher resolution if possible
 */
export function upgradeImageResolution(url: string): string {
  let upgraded = url;
  
  // AutoTrader CDN - try to get higher resolution
  if (url.includes('autotradercdn.ca')) {
    // Replace common size patterns with larger ones
    upgraded = upgraded
      .replace(/\-\d+x\d+\./, '-2048x1536.')  // Replace size suffix
      .replace(/w=\d+/, 'w=2048')              // Replace width param
      .replace(/width=\d+/, 'width=2048')
      .replace(/h=\d+/, 'h=1536')
      .replace(/height=\d+/, 'height=1536');
  }
  
  // CarGurus - upgrade to max quality
  if (url.includes('cargurus.com/images/forsale')) {
    // Remove existing size params and add max quality
    const baseUrl = url.split('?')[0];
    upgraded = baseUrl + '?io=true&width=2048&height=1536&fit=bounds&format=jpg&auto=webp';
  }
  
  // DealerInspire
  if (url.includes('dealerinspire.com')) {
    upgraded = upgraded
      .replace(/\/thumb\//, '/large/')
      .replace(/\/small\//, '/large/')
      .replace(/\/medium\//, '/large/');
  }
  
  return upgraded;
}

/**
 * Navigate through image gallery carousel to load all lazy images
 */
export async function navigateGalleryCarousel(
  page: Page, 
  nextButtonSelectors: string[],
  maxClicks: number = 50,
  clickDelay: number = 150
): Promise<number> {
  let totalClicks = 0;
  
  for (const selector of nextButtonSelectors) {
    try {
      const nextBtn = await page.$(selector);
      if (!nextBtn) continue;
      
      // Click through the gallery
      for (let i = 0; i < maxClicks; i++) {
        try {
          // Check if button is still clickable
          const isClickable = await page.evaluate((sel) => {
            const btn = document.querySelector(sel);
            if (!btn) return false;
            const style = window.getComputedStyle(btn);
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   !btn.hasAttribute('disabled');
          }, selector);
          
          if (!isClickable) break;
          
          await nextBtn.click();
          totalClicks++;
          
          // Wait for image to load
          await new Promise(resolve => setTimeout(resolve, clickDelay));
          
        } catch (e) {
          // Button may have become unavailable
          break;
        }
      }
      
      // Found and clicked a gallery button, no need to try others
      if (totalClicks > 0) break;
      
    } catch (e) {
      // Continue to next selector
    }
  }
  
  return totalClicks;
}

/**
 * Extract all images from page - main extraction function
 * This is meant to be run inside page.evaluate()
 */
export function getImageExtractionScript(trustedCdns: string[], blockedPatterns: string[]): string {
  // Return a string that can be evaluated in page context
  return `(function() {
    const TRUSTED_CDNS = ${JSON.stringify(trustedCdns)};
    const BLOCKED_PATTERNS = ${JSON.stringify(blockedPatterns)};
    
    const debug = {
      galleryContainersFound: 0,
      galleryImagesFound: 0,
      cdnImagesFound: 0,
      backgroundImagesFound: 0,
      totalBeforeDedup: 0,
      totalAfterDedup: 0,
      blockedCount: 0
    };
    
    const processedUrls = new Set();
    const images = [];
    
    function isBlocked(url) {
      if (!url) return true;
      const lower = url.toLowerCase();
      for (const pattern of BLOCKED_PATTERNS) {
        if (lower.includes(pattern.toLowerCase())) {
          debug.blockedCount++;
          return true;
        }
      }
      return false;
    }
    
    function isTrustedCDN(url) {
      if (!url) return false;
      const lower = url.toLowerCase();
      for (const cdn of TRUSTED_CDNS) {
        if (lower.includes(cdn.toLowerCase())) {
          return true;
        }
      }
      return false;
    }
    
    function looksLikeVehiclePhoto(url) {
      if (!url || url.length < 20) return false;
      const lower = url.toLowerCase();
      
      // Must have image extension or be from image endpoint
      const imgIndicators = ['.jpg', '.jpeg', '.png', '.webp', 'image', 'photo'];
      if (!imgIndicators.some(ind => lower.includes(ind))) return false;
      
      // Vehicle indicators
      const vehicleIndicators = ['vehicle', 'car', 'auto', 'inventory', 'stock', 'exterior', 'interior'];
      if (vehicleIndicators.some(ind => lower.includes(ind))) return true;
      
      // Size indicates real photo
      if (/\\d{3,4}x\\d{3,4}/.test(lower)) return true;
      if (/w=\\d{3,4}/.test(lower)) return true;
      
      return false;
    }
    
    function normalizeUrl(src) {
      if (!src || src.length < 5) return null;
      let url = src.trim();
      
      if (url.startsWith('//')) url = 'https:' + url;
      else if (url.startsWith('/')) url = window.location.origin + url;
      else if (url.startsWith('data:') || url.startsWith('blob:')) return null;
      
      if (!url.startsWith('http')) return null;
      return url;
    }
    
    function addImage(src) {
      const url = normalizeUrl(src);
      if (!url) return false;
      if (processedUrls.has(url)) return false;
      if (isBlocked(url)) return false;
      
      // Must be from trusted CDN or look like vehicle photo
      if (isTrustedCDN(url) || looksLikeVehiclePhoto(url)) {
        processedUrls.add(url);
        images.push(url);
        debug.totalBeforeDedup++;
        return true;
      }
      
      return false;
    }
    
    // STRATEGY 1: Gallery containers (highest priority)
    const gallerySelectors = [
      '.photo-gallery', '.mobile-slider', '.vehicle-gallery', 
      '.gallery-container', '[class*="vehicle-photo"]', 
      '[class*="main-image"]', '[class*="media-gallery"]',
      '.slick-slider', '.swiper-container', '[class*="carousel"]'
    ];
    
    const galleryContainers = document.querySelectorAll(gallerySelectors.join(', '));
    debug.galleryContainersFound = galleryContainers.length;
    
    galleryContainers.forEach(container => {
      const imgs = container.querySelectorAll('img');
      imgs.forEach(img => {
        // Try multiple sources for lazy-loaded images
        const sources = [
          img.src,
          img.currentSrc,
          img.getAttribute('data-src'),
          img.getAttribute('data-lazy-src'),
          img.getAttribute('data-original'),
          img.getAttribute('data-image'),
          img.getAttribute('data-full-size'),
          img.getAttribute('data-large-src')
        ];
        
        sources.forEach(src => {
          if (src && addImage(src)) {
            debug.galleryImagesFound++;
          }
        });
      });
    });
    
    // STRATEGY 2: All images from trusted CDNs
    const allImages = document.querySelectorAll('img');
    allImages.forEach(img => {
      const sources = [img.src, img.currentSrc];
      sources.forEach(src => {
        if (src && isTrustedCDN(src) && addImage(src)) {
          debug.cdnImagesFound++;
        }
      });
    });
    
    // STRATEGY 3: Background images from trusted CDNs
    const elementsWithBg = document.querySelectorAll('[style*="background"]');
    elementsWithBg.forEach(el => {
      const style = el.getAttribute('style') || '';
      const match = style.match(/url\\s*\\(\\s*['"]?([^'"\\)]+)['"]?\\s*\\)/i);
      if (match && match[1]) {
        const src = match[1];
        if (isTrustedCDN(src) && addImage(src)) {
          debug.backgroundImagesFound++;
        }
      }
    });
    
    // STRATEGY 4: Look for image data in script tags (some sites embed image arrays)
    const scripts = document.querySelectorAll('script:not([src])');
    scripts.forEach(script => {
      const content = script.textContent || '';
      
      // Look for JSON arrays of image URLs
      const urlMatches = content.matchAll(/"(https?:\\/\\/[^"]+(?:jpg|jpeg|png|webp)[^"]*)"/gi);
      for (const match of urlMatches) {
        const url = match[1].replace(/\\\\/g, '/');
        if (isTrustedCDN(url)) {
          addImage(url);
        }
      }
    });
    
    debug.totalAfterDedup = images.length;
    
    return {
      images: images,
      debug: debug
    };
  })()`;
}

/**
 * Full image extraction from a page (call from Node.js)
 */
export async function extractImagesFromPage(
  page: Page,
  galleryNextSelectors: string[]
): Promise<ImageExtractionResult> {
  // First, navigate through the gallery to load all lazy images
  const clicks = await navigateGalleryCarousel(page, galleryNextSelectors, 50, 150);
  console.log(`    → Gallery: clicked ${clicks} times`);
  
  // Wait for images to load after gallery navigation
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Run the extraction script
  const result = await page.evaluate(
    getImageExtractionScript(TRUSTED_IMAGE_CDNS, BLOCKED_IMAGE_PATTERNS)
  );
  
  // Upgrade resolution on extracted images
  const upgradedImages = result.images.map(upgradeImageResolution);
  
  return {
    images: upgradedImages,
    debug: result.debug
  };
}
