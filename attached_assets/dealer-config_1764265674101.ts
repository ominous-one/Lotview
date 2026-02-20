/**
 * Dealer Configuration System
 * 
 * This module allows you to easily add new dealerships by just providing:
 * 1. Their website URL
 * 2. Their CarGurus page URL (optional, for enrichment)
 * 
 * The system auto-detects the website platform and applies the correct scraping strategy.
 */

export interface DealerConfig {
  id: number;
  name: string;
  location: string;
  
  // Primary website scraping
  website: {
    inventoryUrl: string;
    domain: string;
    platform: 'edealer' | 'dealer-inspire' | 'dealer-com' | 'generic';
  };
  
  // CarGurus enrichment (optional)
  cargurus?: {
    dealerPageUrl: string;
    dealerId?: string;
  };
  
  // Custom selectors (override platform defaults)
  customSelectors?: {
    vehicleLinks?: string;
    priceSelector?: string;
    gallerySelector?: string;
    vinSelector?: string;
  };
}

/**
 * Platform Detection
 * Automatically detects the dealer website platform based on URL patterns and page structure
 */
export function detectPlatform(url: string, pageHtml?: string): DealerConfig['website']['platform'] {
  const urlLower = url.toLowerCase();
  
  // eDealer/Convertus platform (Olympic, Boundary, Kia Vancouver use this)
  if (urlLower.includes('/vehicles/') && urlLower.includes('view=grid')) {
    return 'edealer';
  }
  
  // Dealer Inspire platform
  if (urlLower.includes('dealerinspire.com') || (pageHtml && pageHtml.includes('dealer-inspire'))) {
    return 'dealer-inspire';
  }
  
  // Dealer.com platform
  if (urlLower.includes('dealer.com') || (pageHtml && pageHtml.includes('dealer.com'))) {
    return 'dealer-com';
  }
  
  return 'generic';
}

/**
 * Platform-specific selector configurations
 */
export const PLATFORM_SELECTORS = {
  edealer: {
    vehicleLinks: 'a[href*="/vehicles/2"]',
    vdpUrlPattern: /\/vehicles\/(\d{4})\/([a-z-]+)\/([a-z0-9-]+)\/([a-z-]+)\/([a-z]+)\/(\d+)\//i,
    gallerySelectors: [
      '.photo-gallery',
      '.mobile-slider', 
      '.vehicle-gallery',
      '.gallery-container',
      '[class*="vehicle-photo"]',
      '[class*="main-image"]'
    ],
    galleryNextButton: [
      '.photo-gallery__arrow--next',
      '.mobile-slider__arrow--next',
      '[class*="gallery"] [class*="next"]',
      '.swiper-button-next'
    ],
    priceSelectors: [
      '.price-block__price--primary',
      '.price-block__price',
      '.main-price',
      '[data-field="price"]',
      '.vehicle-price__price',
      '.vehicle-price'
    ],
    vinPattern: /VIN[:\s]*([A-HJ-NPR-Z0-9]{17})/i,
    odometerPattern: /([0-9,]+)\s*(km|kilometers?)/i
  },
  
  'dealer-inspire': {
    vehicleLinks: 'a[href*="/inventory/"]',
    vdpUrlPattern: /\/inventory\/[^\/]+\/(\d+)\/?/i,
    gallerySelectors: ['.vehicle-media', '.photo-gallery', '[class*="gallery"]'],
    galleryNextButton: ['.slick-next', '.carousel-next', '[class*="next"]'],
    priceSelectors: ['.price', '.vehicle-price', '[data-price]', '.final-price'],
    vinPattern: /VIN[:\s]*([A-HJ-NPR-Z0-9]{17})/i,
    odometerPattern: /([0-9,]+)\s*(mi|miles?|km|kilometers?)/i
  },
  
  'dealer-com': {
    vehicleLinks: 'a[href*="/used/"]',
    vdpUrlPattern: /\/used\/[^\/]+\/(\d+)\/?/i,
    gallerySelectors: ['.media-gallery', '.vehicle-photos', '[class*="gallery"]'],
    galleryNextButton: ['.next-photo', '.gallery-next', '[class*="next"]'],
    priceSelectors: ['.price-value', '.vehicle-price', '[itemprop="price"]'],
    vinPattern: /VIN[:\s]*([A-HJ-NPR-Z0-9]{17})/i,
    odometerPattern: /([0-9,]+)\s*(mi|miles?|km|kilometers?)/i
  },
  
  generic: {
    vehicleLinks: 'a[href*="/vehicle"], a[href*="/inventory"], a[href*="/used"]',
    vdpUrlPattern: /\/(vehicle|inventory|used)\/[^\/]+\/(\d+)\/?/i,
    gallerySelectors: ['[class*="gallery"]', '[class*="slider"]', '[class*="carousel"]'],
    galleryNextButton: ['[class*="next"]', '.slick-next', '.swiper-button-next'],
    priceSelectors: ['[class*="price"]', '[itemprop="price"]', '[data-price]'],
    vinPattern: /VIN[:\s]*([A-HJ-NPR-Z0-9]{17})/i,
    odometerPattern: /([0-9,]+)\s*(mi|miles?|km|kilometers?)/i
  }
};

/**
 * Trusted image CDN domains - images from these sources are high quality vehicle photos
 */
export const TRUSTED_IMAGE_CDNS = [
  'autotradercdn.ca/photos',
  'photos.autotrader.ca',
  'cargurus.com/images/forsale',
  'ddclstatic.com',
  'dealercdn.com',
  'dealerinspire.com/vehicles',
  'photos.dealer.com',
  'gdealer.com',
  'evoxcdn.com',
  'ws-assets.dealercom.net',
  'lotstalk.net',
  'vauto.com',
  'homenetiol.com',    // HomeNet inventory images
  'homenet-inc.com',
  'cdnmedia.endeavorsuite.com',
  'images.foxdealer.com',
  'spincar.com',
  '360.spincar.com',
  'izmostock.com',     // Stock photos for new vehicles
];

/**
 * Blocked image patterns - promotional/banner images to exclude
 */
export const BLOCKED_IMAGE_PATTERNS = [
  'cdn-convertus.com/uploads/sites/',  // Site promotional images
  'form-',              // Form backgrounds
  'bg-',                // Background images  
  '-bg.',               // Background suffix
  'background',         // Background images
  'banner',             // Banner images
  'Welcome',            // Welcome banners
  'Get-Approved',       // Promotional
  'Pictogram',          // Icons
  'quote-',             // Quote icons
  'icon',               // Icons
  'logo',               // Logos
  'badge',              // Badge images
  'Home-Delivery',      // Promotional
  'hassle',             // Promotional
  'placeholder',        // Placeholder images
  'no-image',           // Missing image placeholders
  'coming-soon',        // Coming soon placeholders
];

/**
 * Default dealers - pre-configured for quick setup
 */
export const DEFAULT_DEALERS: DealerConfig[] = [
  {
    id: 1,
    name: 'Olympic Hyundai Vancouver',
    location: 'Vancouver',
    website: {
      inventoryUrl: 'https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used',
      domain: 'olympichyundaivancouver.com',
      platform: 'edealer'
    },
    cargurus: {
      dealerPageUrl: 'https://www.cargurus.ca/Cars/m-Olympic-Hyundai-Vancouver-sp459833',
      dealerId: 'sp459833'
    }
  },
  {
    id: 2,
    name: 'Boundary Hyundai',
    location: 'Burnaby',
    website: {
      inventoryUrl: 'https://www.boundaryhyundai.com/vehicles/used/?st=price,desc&view=grid&sc=used',
      domain: 'boundaryhyundai.com',
      platform: 'edealer'
    },
    cargurus: {
      dealerPageUrl: 'https://www.cargurus.ca/Cars/m-Boundary-Hyundai-sp393663',
      dealerId: 'sp393663'
    }
  },
  {
    id: 3,
    name: 'Kia Vancouver',
    location: 'Vancouver',
    website: {
      inventoryUrl: 'https://www.kiavancouver.com/vehicles/used/?st=year,desc&view=grid&sc=used',
      domain: 'kiavancouver.com',
      platform: 'edealer'
    },
    cargurus: {
      dealerPageUrl: 'https://www.cargurus.ca/Cars/m-Kia-Vancouver-sp357122',
      dealerId: 'sp357122'
    }
  }
];

/**
 * Helper to create a new dealer config from just URLs
 */
export function createDealerConfig(
  id: number,
  name: string,
  location: string,
  inventoryUrl: string,
  cargurusUrl?: string
): DealerConfig {
  const url = new URL(inventoryUrl);
  const domain = url.hostname.replace('www.', '');
  const platform = detectPlatform(inventoryUrl);
  
  const config: DealerConfig = {
    id,
    name,
    location,
    website: {
      inventoryUrl,
      domain,
      platform
    }
  };
  
  if (cargurusUrl) {
    const cgMatch = cargurusUrl.match(/sp(\d+)/);
    config.cargurus = {
      dealerPageUrl: cargurusUrl,
      dealerId: cgMatch ? `sp${cgMatch[1]}` : undefined
    };
  }
  
  return config;
}
