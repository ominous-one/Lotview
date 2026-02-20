import { storage } from './storage';
import { scrapeAllDealershipsIncremental, upsertVehicleByVin, checkVehicleNeedsEnrichment, updateVehiclePriceOnly, type ScrapedVehicle } from './scraper';
import { getGlobalApifyService, getApifyServiceForDealership } from './apify-service';
import { 
  getBrowserlessServiceForDealership, 
  getGlobalBrowserlessService,
  type BrowserlessScrapeResult 
} from './browserless-service';
import { BrowserlessUnifiedService } from './browserless-unified';
import type { InsertScrapeRun, Vehicle } from '@shared/schema';
import { db } from './db';
import { vehicles, scrapeSources, dealerships } from '@shared/schema';
import { eq, and, inArray, desc, like } from 'drizzle-orm';
import { logInfo, logWarn, logError } from './error-utils';
import * as cheerio from 'cheerio';
import { maximizeImageUrl } from './precision-image-extractor';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 30000]; // 5s, 15s, 30s exponential backoff

/**
 * Detect if HTML is a Cloudflare block/challenge page instead of real content.
 * These pages contain strings that would otherwise produce garbage data when parsed.
 */
function isCloudflareBlockPage(html: string): boolean {
  const lowerHtml = html.toLowerCase();
  return (
    lowerHtml.includes('attention required') ||
    lowerHtml.includes('you have been blocked') ||
    lowerHtml.includes('cf-wrapper') ||
    lowerHtml.includes('cf-error-details') ||
    lowerHtml.includes('cloudflare ray id') ||
    lowerHtml.includes('unable to access') ||
    lowerHtml.includes('enable javascript and cookies') ||
    lowerHtml.includes('checking your browser') ||
    (lowerHtml.includes('cdn-cgi') && lowerHtml.includes('challenge'))
  );
}

function normalizeAutoTraderPhotoUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url) return url;

  if (url.includes('&amp;')) {
    url = url.replace(/&amp;/g, '&');
  }

  if (/autotradercdn\.ca/i.test(url)) {
    url = url.replace(/-\d+x\d+(\b|$)/i, '-2048x1536');
    url = url.replace(/-\d+x\d+(\.(?:jpg|jpeg|png|webp))(?:$|\?)/i, '-2048x1536$1');
  }

  return maximizeImageUrl(url);
}

function isOlympicHyundaiDomain(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'olympichyundaivancouver.com' || h.endsWith('.olympichyundaivancouver.com');
}

/**
 * Extract Carfax badge names from HTML using multiple trusted methods:
 * 1. Carfax CDN SVG URLs (most reliable)
 * 2. Carfax widget containers on the page (elements with 'carfax' in class/id)
 * 
 * We only extract badges from verified Carfax elements - not the entire page.
 */
function extractCarfaxBadges(html: string): string[] {
  const badges: string[] = [];
  const $ = cheerio.load(html);
  
  // Strategy 1: Carfax CDN badge SVG URLs (most authoritative)
  const svgMatches = html.match(/cdn\.carfax\.ca\/badging[^"'\s>]+\.svg/gi) || [];
  const badgeNames = new Set(svgMatches.map(url => url.toLowerCase()));
  
  // Map SVG filenames to badge display names
  if ([...badgeNames].some(b => b.includes('oneowner') || b.includes('one-owner'))) {
    badges.push('One Owner');
  }
  if ([...badgeNames].some(b => b.includes('accidentfree') || b.includes('noaccident') || b.includes('no-accident'))) {
    badges.push('No Reported Accidents');
  }
  if ([...badgeNames].some(b => b.includes('servicehistory') || b.includes('service-history'))) {
    badges.push('Service History');
  }
  if ([...badgeNames].some(b => b.includes('personaluse') || b.includes('personal-use'))) {
    badges.push('Personal Use Only');
  }
  if ([...badgeNames].some(b => b.includes('lowkilom') || b.includes('low-kilom'))) {
    badges.push('Low Kilometers');
  }
  
  if (badges.length > 0) {
    logInfo('[Carfax Badges] Extracted from Carfax CDN SVG URLs', { badges, svgCount: svgMatches.length });
    return badges; // SVG badges are most reliable, use those
  }
  
  // Strategy 2: Look for Carfax widget containers on the page
  // These are elements that contain 'carfax' in their class or id, with badge text inside
  const carfaxContainerSelectors = [
    '[class*="carfax"]',
    '[id*="carfax"]',
    '[class*="Carfax"]',
    '[id*="Carfax"]',
    'a[href*="carfax"]',
    '[data-carfax]',
  ];
  
  for (const selector of carfaxContainerSelectors) {
    $(selector).each((_, el) => {
      const containerText = $(el).text().toLowerCase().trim();
      // Only process if it's a small container (< 200 chars) - avoid matching entire page sections
      if (containerText.length > 0 && containerText.length < 200) {
        // Look for specific badge texts within verified Carfax containers
        if (/one\s*owner|1\s*owner/i.test(containerText) && !badges.includes('One Owner')) {
          badges.push('One Owner');
          logInfo('[Carfax Badges] Found "One Owner" in Carfax widget container', { selector });
        }
        if (/no\s*accident|accident\s*free/i.test(containerText) && !badges.includes('No Reported Accidents')) {
          badges.push('No Reported Accidents');
          logInfo('[Carfax Badges] Found "No Accidents" in Carfax widget container', { selector });
        }
        if (/service\s*history|service\s*record/i.test(containerText) && !badges.includes('Service History')) {
          badges.push('Service History');
          logInfo('[Carfax Badges] Found "Service History" in Carfax widget container', { selector });
        }
      }
    });
  }
  
  // Strategy 3: Look for Carfax badge images with alt text
  $('img[src*="carfax"], img[alt*="carfax"], img[alt*="Carfax"]').each((_, img) => {
    const alt = $(img).attr('alt')?.toLowerCase() || '';
    const src = $(img).attr('src')?.toLowerCase() || '';
    const combined = alt + ' ' + src;
    
    if (/one\s*owner|oneowner/i.test(combined) && !badges.includes('One Owner')) {
      badges.push('One Owner');
      logInfo('[Carfax Badges] Found "One Owner" in Carfax image alt/src', { alt, src });
    }
    if (/no\s*accident|accident\s*free|noaccident/i.test(combined) && !badges.includes('No Reported Accidents')) {
      badges.push('No Reported Accidents');
      logInfo('[Carfax Badges] Found "No Accidents" in Carfax image alt/src', { alt, src });
    }
  });
  
  if (badges.length > 0) {
    logInfo('[Carfax Badges] Extracted from Carfax widget containers', { badges });
  }
  
  return badges;
}

/**
 * Extract Carfax report URL from HTML
 */
function extractCarfaxUrl(html: string): string | null {
  const $ = cheerio.load(html);
  
  // Strategy 1: Look for vhr.carfax.ca links (the actual report links)
  const vhrPattern = /https?:\/\/vhr\.carfax\.ca\/\?id=[A-Za-z0-9%\/+=]+/g;
  const vhrMatches = html.match(vhrPattern);
  if (vhrMatches && vhrMatches.length > 0) {
    logInfo('[Carfax Extraction] Found vhr.carfax.ca link via regex', { url: vhrMatches[0] });
    return vhrMatches[0];
  }
  
  // Strategy 2: Look for Carfax links in href attributes with vhr subdomain
  const carfaxLinks = $('a[href*="carfax"]');
  for (let i = 0; i < carfaxLinks.length; i++) {
    const href = $(carfaxLinks[i]).attr('href');
    if (href && href.includes('vhr.carfax')) {
      logInfo('[Carfax Extraction] Found vhr.carfax link in href', { url: href });
      return href;
    }
  }
  
  // Strategy 3: Look for onclick handlers with Carfax URLs
  const onclickPattern = /onclick\s*=\s*["'][^"']*vhr\.carfax\.ca[^"']*["']/gi;
  const onclickMatches = html.match(onclickPattern);
  if (onclickMatches) {
    for (const match of onclickMatches) {
      const urlMatch = match.match(/https?:\/\/vhr\.carfax\.ca\/[^"'\s)]+/);
      if (urlMatch) {
        logInfo('[Carfax Extraction] Found vhr.carfax link in onclick', { url: urlMatch[0] });
        return urlMatch[0];
      }
    }
  }
  
  // Strategy 4: Look for data-* attributes containing Carfax URLs
  const dataElements = $('[data-url], [data-href], [data-link], [data-carfax], [data-carfax-url]');
  for (let i = 0; i < dataElements.length; i++) {
    const elem = dataElements.eq(i);
    const dataUrl = elem.attr('data-url') || elem.attr('data-href') || 
                    elem.attr('data-link') || elem.attr('data-carfax') || 
                    elem.attr('data-carfax-url');
    if (dataUrl && dataUrl.includes('vhr.carfax')) {
      logInfo('[Carfax Extraction] Found vhr.carfax in data attribute', { url: dataUrl });
      return dataUrl;
    }
  }
  
  // Strategy 5: Look for direct Carfax links with VIN-specific paths
  for (let i = 0; i < carfaxLinks.length; i++) {
    const href = $(carfaxLinks[i]).attr('href');
    if (href && (href.includes('/vehicle/') || href.includes('/vhr/') || href.includes('vin='))) {
      return href;
    }
  }
  
  // Strategy 6: Check data attributes on any element
  const dataCarfax = $('[data-carfax], [data-carfax-url], [data-carfax-link]').first();
  if (dataCarfax.length) {
    const url = dataCarfax.attr('data-carfax') || dataCarfax.attr('data-carfax-url') || dataCarfax.attr('data-carfax-link');
    if (url && !url.match(/^https?:\/\/(www\.)?carfax\.(ca|com)\/?$/)) {
      return url;
    }
  }
  
  // Strategy 7: Look for any Carfax link (excluding homepage)
  for (let i = 0; i < carfaxLinks.length; i++) {
    const href = $(carfaxLinks[i]).attr('href');
    if (href && !href.match(/^https?:\/\/(www\.)?carfax\.(ca|com)\/?$/)) {
      return href;
    }
  }
  
  return null;
}

/**
 * Extract stock number from HTML
 * Tries multiple strategies: hidden inputs, data attributes, text patterns
 */
function extractStockNumber(html: string, $: cheerio.CheerioAPI): string | null {
  // Strategy 1: Look for hidden inputs with stock-related names
  const stockInputSelectors = [
    'input[name*="stock"]',
    'input[name*="Stock"]',
    'input[id*="stock"]',
    'input[id*="Stock"]',
    'input[name="vdp-stock"]',
    'input[name="stockNumber"]',
    'input[name="stock_number"]',
    'input[name="stockNo"]',
  ];
  
  for (const selector of stockInputSelectors) {
    const input = $(selector).first();
    if (input.length > 0) {
      const value = input.val();
      if (typeof value === 'string' && value.trim().length > 0 && value.length < 30) {
        logInfo('[Stock Extraction] Found stock number in hidden input', { selector, value });
        return value.trim();
      }
    }
  }
  
  // Strategy 2: Look for data attributes containing stock number
  const dataElements = $('[data-stock], [data-stocknumber], [data-stock-number], [data-stockno]');
  for (let i = 0; i < dataElements.length; i++) {
    const elem = dataElements.eq(i);
    const stockValue = elem.attr('data-stock') || elem.attr('data-stocknumber') || 
                       elem.attr('data-stock-number') || elem.attr('data-stockno');
    if (stockValue && stockValue.trim().length > 0 && stockValue.length < 30) {
      logInfo('[Stock Extraction] Found stock number in data attribute', { value: stockValue });
      return stockValue.trim();
    }
  }
  
  // Strategy 3: Look for text patterns like "Stock #: ABC123" or "Stock: ABC123"
  const stockPatterns = [
    /Stock\s*#?\s*:?\s*([A-Z0-9-]+)/i,
    /Stock\s*(?:Number|No\.?)\s*:?\s*([A-Z0-9-]+)/i,
    /Stk\s*#?\s*:?\s*([A-Z0-9-]+)/i,
    /Inventory\s*#?\s*:?\s*([A-Z0-9-]+)/i,
  ];
  
  for (const pattern of stockPatterns) {
    const match = html.match(pattern);
    if (match && match[1] && match[1].length >= 3 && match[1].length < 30) {
      // Validate it looks like a stock number (alphanumeric, not a common word)
      const candidate = match[1].trim();
      if (!/^(the|and|for|car|new|used|sale|price)$/i.test(candidate)) {
        logInfo('[Stock Extraction] Found stock number via text pattern', { pattern: pattern.toString(), value: candidate });
        return candidate;
      }
    }
  }
  
  // Strategy 4: Look for elements with stock-related class names
  const stockClassSelectors = [
    '.stock-number',
    '.stocknumber',
    '.stock-no',
    '.vehicle-stock',
    '[class*="stock"]',
  ];
  
  for (const selector of stockClassSelectors) {
    const elem = $(selector).first();
    if (elem.length > 0) {
      let text = elem.text().trim();
      // Extract just the stock number value if it contains labels
      const valueMatch = text.match(/[A-Z0-9-]{3,20}/i);
      if (valueMatch && valueMatch[0].length >= 3) {
        logInfo('[Stock Extraction] Found stock number in class element', { selector, value: valueMatch[0] });
        return valueMatch[0];
      }
    }
  }
  
  // Strategy 5: Extract from URL if it contains an inventory ID (last resort)
  const urlIdMatch = html.match(/\/vehicles\/\d{4}\/[^/]+\/[^/]+\/[^/]+\/[^/]+\/(\d+)\//);
  if (urlIdMatch && urlIdMatch[1]) {
    const inventoryId = urlIdMatch[1];
    if (inventoryId.length >= 5) {
      logInfo('[Stock Extraction] Using URL inventory ID as fallback stock number', { value: inventoryId });
      return inventoryId;
    }
  }
  
  return null;
}

interface VdpContent {
  vdpDescription: string | null;
  techSpecs: string | null;
  carfaxBadges: string[];
  carfaxUrl: string | null;
  stockNumber: string | null;
}

/**
 * Extract VDP description and tech specs from a vehicle detail page HTML
 * Uses Cheerio to parse the HTML and extract structured content
 */
function extractVdpContent(html: string): VdpContent {
  const $ = cheerio.load(html);
  
  // Extract vehicle description/overview
  let vdpDescription: string | null = null;
  
  // Selectors to find vehicle description content
  const descriptionSelectors = [
    '.vehicle-description',
    '.vehicle-overview',
    '.comments-from-seller',
    '#description',
    '.vehicle-comments',
    '.dealer-comments',
    '[class*="description"]',
    '[class*="overview"]',
  ];
  
  for (const selector of descriptionSelectors) {
    const descEl = $(selector).first(); // Take only the first match
    if (descEl.length > 0) {
      let text = descEl.text().trim();
      // Only accept descriptions with meaningful content (more than 50 chars)
      if (text.length > 50 && !text.toLowerCase().includes('call for price')) {
        // Skip if it looks like sidebar content with multiple vehicle listings
        const salePriceMatches = (text.match(/Sale Price:/gi) || []).length;
        if (salePriceMatches > 2) {
          continue;
        }
        
        // Clean up the description
        // 1. Remove "Overview" prefix if it appears at the start
        if (/^Overview\s+/i.test(text)) {
          text = text.replace(/^Overview\s+/i, '');
        }
        // 2. Truncate before dealership boilerplate
        const boilerplateIdx = text.indexOf('Pricing for pre-owned vehicles excludes');
        if (boilerplateIdx > 50) {
          text = text.substring(0, boilerplateIdx);
        }
        // 3. Truncate before other vehicle listings
        const otherListingMatch = text.match(/\d{4}\s+\w+\s+\w+.*?Sale Price:/i);
        if (otherListingMatch && otherListingMatch.index && otherListingMatch.index > 50) {
          text = text.substring(0, otherListingMatch.index);
        }
        
        vdpDescription = text.trim();
        if (vdpDescription.length > 50) {
          break; // Found a valid description
        }
      }
    }
  }
  
  // Extract tech specs from the Olympic Hyundai VDP structure
  // Olympic uses .techspecs-tab.mb-md with category headings
  const techSpecs: {
    features: string[];
    mechanical: string[];
    exterior: string[];
    interior: string[];
    entertainment: string[];
    safety: string[];
  } = {
    features: [],
    mechanical: [],
    exterior: [],
    interior: [],
    entertainment: [],
    safety: [],
  };
  
  // Try Olympic Hyundai's specific structure first
  const techSpecsContainer = $('.techspecs-tab.mb-md, .techspecs-tab, .tech-specs, .specifications');
  
  if (techSpecsContainer.length > 0) {
    // Find category headings and their associated lists
    techSpecsContainer.find('h3, h4, .spec-category, .category-heading').each((_, heading) => {
      const headingText = $(heading).text().toLowerCase().trim();
      const items: string[] = [];
      
      // Find the list items following this heading
      let nextEl = $(heading).next();
      while (nextEl.length > 0 && !nextEl.is('h3, h4, .spec-category, .category-heading')) {
        nextEl.find('li').each((_, li) => {
          const itemText = $(li).text().trim();
          if (itemText.length > 2 && itemText.length < 200) {
            items.push(itemText);
          }
        });
        nextEl = nextEl.next();
      }
      
      // Categorize based on heading
      if (headingText.includes('mechanical') || headingText.includes('engine') || headingText.includes('powertrain')) {
        techSpecs.mechanical.push(...items);
      } else if (headingText.includes('exterior')) {
        techSpecs.exterior.push(...items);
      } else if (headingText.includes('interior')) {
        techSpecs.interior.push(...items);
      } else if (headingText.includes('entertainment') || headingText.includes('media') || headingText.includes('audio')) {
        techSpecs.entertainment.push(...items);
      } else if (headingText.includes('safety') || headingText.includes('security')) {
        techSpecs.safety.push(...items);
      } else if (headingText.includes('feature') || headingText.includes('option') || headingText.includes('equipment')) {
        techSpecs.features.push(...items);
      }
    });
  }
  
  // ALSO extract from "Options" section which is SEPARATE from Tech Specs
  // Olympic Hyundai VDP has Options -> Features section with important items like "Premium Synthetic Seats"
  const optionsSectionSelectors = [
    '.options-section',
    '.vehicle-options',
    '#options',
    '[class*="options"]',
  ];
  
  // Find the Options section by looking for h3/h4 containing "Options" or "Features"
  $('h3, h4, h2').each((_, heading) => {
    const headingText = $(heading).text().toLowerCase().trim();
    
    // Look for "Options" or standalone "Features" section
    if (headingText.includes('options') || headingText === 'features') {
      // Find list items in the next sibling elements
      let nextEl = $(heading).next();
      let foundItems = 0;
      
      while (nextEl.length > 0 && foundItems < 100) {
        // Check if we hit another major heading (stop there)
        if (nextEl.is('h2, h3') && !nextEl.text().toLowerCase().includes('feature')) {
          break;
        }
        
        // Also look for sub-headings like "#### Features" within Options
        const subHeadingText = nextEl.text().toLowerCase().trim();
        if (nextEl.is('h4, h5') && subHeadingText.includes('feature')) {
          // This is the Features sub-section, extract from its siblings
          let featureEl = nextEl.next();
          while (featureEl.length > 0 && !featureEl.is('h3, h4, h5')) {
            featureEl.find('li').each((_, li) => {
              const itemText = $(li).text().trim();
              if (itemText.length > 2 && itemText.length < 200 && !techSpecs.features.includes(itemText)) {
                techSpecs.features.push(itemText);
                foundItems++;
              }
            });
            featureEl = featureEl.next();
          }
        }
        
        // Also check for direct list items
        nextEl.find('li').each((_, li) => {
          const itemText = $(li).text().trim();
          if (itemText.length > 2 && itemText.length < 200 && !techSpecs.features.includes(itemText)) {
            techSpecs.features.push(itemText);
            foundItems++;
          }
        });
        
        nextEl = nextEl.next();
      }
    }
  });
  
  // Fallback: look for common feature list patterns
  if (Object.values(techSpecs).every(arr => arr.length === 0)) {
    const featureSelectors = [
      '.feature-list li',
      '.vehicle-features li',
      '.options-list li',
      '.equipment-list li',
      '.specs-list li',
      '[class*="feature"] li',
      '[class*="option"] li',
      '.key-features li',
    ];
    
    for (const selector of featureSelectors) {
      $(selector).each((_, li) => {
        const text = $(li).text().trim();
        if (text.length > 2 && text.length < 200) {
          techSpecs.features.push(text);
        }
      });
      if (techSpecs.features.length > 0) break;
    }
  }
  
  // Only return techSpecs if we found any content
  const hasTechSpecs = Object.values(techSpecs).some(arr => arr.length > 0);
  
  // Extract Carfax badges and URL from the HTML
  const carfaxBadges = extractCarfaxBadges(html);
  const carfaxUrl = extractCarfaxUrl(html);
  
  // Extract stock number
  const stockNumber = extractStockNumber(html, $);
  
  return {
    vdpDescription,
    techSpecs: hasTechSpecs ? JSON.stringify(techSpecs) : null,
    carfaxBadges,
    carfaxUrl,
    stockNumber,
  };
}

/**
 * Fetch VDP page and extract description and tech specs
 * Uses multiple fallbacks: ZenRows -> ScrapingBee -> Direct fetch
 */
async function fetchVdpContent(vdpUrl: string): Promise<VdpContent> {
  // Try each scraping service in order until one succeeds
  const scrapers = [
    { name: 'ZenRows', fn: fetchWithZenRows },
    { name: 'ScrapingBee', fn: fetchWithScrapingBee },
    { name: 'Direct', fn: fetchDirectHttp },
  ];
  
  for (const scraper of scrapers) {
    try {
      const html = await scraper.fn(vdpUrl);
      if (html && html.length > 1000 && !isCloudflareBlockPage(html)) {
        const content = extractVdpContent(html);
        if (content.vdpDescription || content.techSpecs) {
          logInfo(`[VDP Scraper] Successfully extracted content using ${scraper.name}`, { 
            service: 'scraper', method: 'vdp', 
            hasDesc: !!content.vdpDescription, 
            hasSpecs: !!content.techSpecs 
          });
          return content;
        }
      }
    } catch (error) {
      logWarn(`[VDP Scraper] ${scraper.name} failed`, { 
        service: 'scraper', method: 'vdp', 
        vdpUrl, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
  
  return { vdpDescription: null, techSpecs: null, carfaxBadges: [], carfaxUrl: null, stockNumber: null };
}

async function fetchWithZenRows(vdpUrl: string): Promise<string | null> {
  const apiKey = process.env.ZENROWS_API_KEY;
  if (!apiKey) return null;
  
  try {
    // Use antibot=true for Cloudflare bypass, wait 6 seconds for Carfax widget to load
    const params = new URLSearchParams({
      apikey: apiKey,
      url: vdpUrl,
      js_render: 'true',
      antibot: 'true',  // Enables Cloudflare bypass
      wait: '6000',
    });
    const zenRowsUrl = `https://api.zenrows.com/v1/?${params}`;
    const response = await fetch(zenRowsUrl, { 
      method: 'GET', 
      headers: { 'Accept': 'text/html' },
      signal: AbortSignal.timeout(90000), // 90 second timeout for antibot mode
    });
    
    if (!response.ok) return null;
    return response.text();
  } catch (error) {
    logWarn('[ZenRows VDP] Network error', { vdpUrl, error: String(error) });
    return null;
  }
}

async function fetchWithScrapingBee(vdpUrl: string): Promise<string | null> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) return null;
  
  try {
    // Added wait=6000 to allow Carfax widget to load
    const scrapingBeeUrl = `https://app.scrapingbee.com/api/v1/?api_key=${apiKey}&url=${encodeURIComponent(vdpUrl)}&render_js=true&premium_proxy=true&wait=6000`;
    const response = await fetch(scrapingBeeUrl, { 
      method: 'GET', 
      headers: { 'Accept': 'text/html' },
      signal: AbortSignal.timeout(60000), // 60 second timeout
    });
    
    if (!response.ok) return null;
    return response.text();
  } catch (error) {
    logWarn('[ScrapingBee VDP] Network error', { vdpUrl, error: String(error) });
    return null;
  }
}

async function fetchDirectHttp(vdpUrl: string): Promise<string | null> {
  try {
    // Direct fetch for non-protected pages
    const response = await fetch(vdpUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });
    
    if (!response.ok) return null;
    return response.text();
  } catch (error) {
    logWarn('[Direct HTTP] Network error', { vdpUrl, error: String(error) });
    return null;
  }
}

const BLOCKED_IMAGE_PATTERNS = [
  '.svg', '/headers/', '/themes/', '/logos/', 'hyundai.svg',
  'hyundai-header', 'favicon', '/icons/', 'achilles',
  'convertus-achilles', '/wp-content/themes/', 'brand-', '-brand',
  '/assets/images/', 'logo', 'icon', 'badge', 'banner', 'promo',
  'button', 'arrow', 'placeholder', 'no-image', 'spinner', 'loading',
  'bg-', '-bg.', 'form-', 'welcome', 'get-approved', 'pictogram',
  'tracking', '-dark.png', '-light.png', 'award', 'winning',
  'cdn-convertus.com/uploads/sites/', 'hassle', 'home-delivery',
  'car-buying', 'quote-', 'special', 'offer'
];

function isBlockedImage(url: string): boolean {
  const lower = url.toLowerCase();
  for (const pattern of BLOCKED_IMAGE_PATTERNS) {
    if (lower.includes(pattern)) return true;
  }
  return false;
}

function filterVehicleImages(urls: string[]): string[] {
  return urls.filter(url => !isBlockedImage(url));
}

/**
 * Infer body style from make/model names
 * This is more reliable than parsing page text which often contains generic "car/truck" text
 */
function inferBodyStyleFromModel(make: string, model: string): string {
  const makeLower = make.toLowerCase().trim();
  const modelLower = model.toLowerCase().trim();
  const combined = `${makeLower} ${modelLower}`;

  // SUVs/Crossovers - most common for dealership inventory
  const suvPatterns = [
    // Hyundai
    'tucson', 'santa fe', 'santafe', 'kona', 'venue', 'palisade', 'ioniq 5', 'ioniq5',
    // Kia
    'sportage', 'sorento', 'telluride', 'seltos', 'niro', 'ev6', 'ev9',
    // Toyota
    'rav4', 'highlander', '4runner', 'sequoia', 'land cruiser', 'venza', 'corolla cross', 'bz4x', 'grand highlander',
    // Honda
    'cr-v', 'crv', 'hr-v', 'hrv', 'pilot', 'passport', 'prologue',
    // Subaru
    'crosstrek', 'outback', 'forester', 'ascent', 'solterra',
    // Mazda
    'cx-3', 'cx3', 'cx-30', 'cx30', 'cx-5', 'cx5', 'cx-50', 'cx50', 'cx-70', 'cx70', 'cx-90', 'cx90',
    // Nissan
    'rogue', 'murano', 'pathfinder', 'armada', 'kicks', 'ariya',
    // Ford
    'escape', 'edge', 'explorer', 'expedition', 'bronco', 'mustang mach-e',
    // Chevrolet
    'equinox', 'traverse', 'blazer', 'tahoe', 'suburban', 'trailblazer', 'trax',
    // GMC
    'terrain', 'acadia', 'yukon',
    // Jeep
    'wrangler', 'grand cherokee', 'cherokee', 'compass', 'renegade', 'wagoneer', 'grand wagoneer', 'gladiator',
    // Volvo
    'xc40', 'xc60', 'xc90',
    // BMW
    'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'ix',
    // Mercedes
    'gla', 'glb', 'glc', 'gle', 'gls', 'eqb', 'eqc', 'eqs suv', 'eqe suv',
    // Audi
    'q3', 'q4', 'q5', 'q7', 'q8', 'e-tron',
    // Lexus
    'nx', 'rx', 'gx', 'lx', 'ux', 'rz',
    // Acura
    'rdx', 'mdx', 'zdx',
    // Infiniti
    'qx50', 'qx55', 'qx60', 'qx80',
    // Lincoln
    'corsair', 'nautilus', 'aviator', 'navigator',
    // Cadillac
    'xt4', 'xt5', 'xt6', 'escalade', 'lyriq',
    // Tesla
    'model x', 'model y',
    // Volkswagen
    'tiguan', 'atlas', 'taos', 'id.4',
    // Porsche
    'cayenne', 'macan',
    // Land Rover
    'range rover', 'discovery', 'defender', 'velar', 'evoque',
    // Polestar
    'polestar 3', // Polestar 3 is an SUV
    // Rivian
    'r1s',
    // Mitsubishi
    'outlander', 'eclipse cross',
    // Buick
    'encore', 'envision', 'enclave',
    // Dodge
    'durango', 'hornet',
  ];

  // Sedans
  const sedanPatterns = [
    // Hyundai
    'sonata', 'elantra', 'accent', 'ioniq 6', 'ioniq6',
    // Kia
    'k5', 'forte', 'rio', 'stinger',
    // Toyota
    'camry', 'corolla', 'avalon', 'prius', 'mirai', 'crown',
    // Honda
    'civic', 'accord', 'insight',
    // Subaru
    'legacy', 'impreza', 'wrx',
    // Mazda
    'mazda3', 'mazda 3', 'mazda6', 'mazda 6',
    // Nissan
    'altima', 'sentra', 'versa', 'maxima', 'leaf',
    // Ford
    'fusion',
    // Chevrolet
    'malibu', 'camaro',
    // BMW
    '2 series', '3 series', '4 series', '5 series', '7 series', '8 series', 'i4', 'i7', '530e', '330e', '530i', '540i', '330i', '340i',
    // Mercedes
    'a-class', 'c-class', 'e-class', 's-class', 'cla', 'eqe', 'eqs',
    // Audi
    'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 's3', 's4', 's5', 's6', 's7', 's8', 'rs',
    // Lexus
    'is', 'es', 'ls', 'gs',
    // Acura
    'tlx', 'integra',
    // Infiniti
    'q50', 'q60',
    // Lincoln
    'continental', 'mkz',
    // Cadillac
    'ct4', 'ct5',
    // Tesla
    'model 3', 'model s',
    // Volkswagen
    'jetta', 'passat', 'arteon',
    // Genesis
    'g70', 'g80', 'g90',
    // Volvo
    's60', 's90',
    // Polestar
    'polestar 2', // Polestar 2 is a fastback/sedan
  ];

  // Trucks/Pickups
  const truckPatterns = [
    'f-150', 'f150', 'f 150', 'f-250', 'f250', 'f 250', 'f-350', 'f350', 'f 350', 'ranger', 'maverick',
    'silverado', 'colorado', 'sierra',
    'ram 1500', 'ram 2500', 'ram 3500',
    'tundra', 'tacoma',
    'frontier', 'titan',
    'ridgeline',
    'santa cruz',
    'r1t', // Rivian
    'cybertruck',
    'canyon', 'hummer ev pickup',
    'lightning', // F-150 Lightning
  ];

  // Hatchbacks
  const hatchbackPatterns = [
    'golf', 'gti', 'soul', 'veloster', 'fit', 'yaris', 'corolla hatchback',
    'mazda3 hatchback', 'civic hatchback', 'impreza hatchback', 'i3', 'mini',
    'bolt', 'bolt ev', 'bolt euv', 'leaf',
  ];

  // Coupes
  const coupePatterns = [
    'mustang', 'camaro', 'challenger', 'charger', '86', 'brz', 'supra', 'nissan z',
    'corvette', 'gt-r', 'nsx', 'lc ', 'rc ', '2 series coupe', '4 series coupe',
    '8 series coupe', 'c-class coupe', 'e-class coupe', 'a5 coupe', 'tt ',
  ];

  // Wagons
  const wagonPatterns = [
    'outback', 'v60', 'v90', 'a4 allroad', 'allroad', 'e-class wagon',
    'sportwagen', 'golf alltrack',
  ];

  // Minivans
  const minivanPatterns = [
    'sienna', 'odyssey', 'pacifica', 'carnival', 'grand caravan', 'voyager',
    'sedona', 'quest', 'metris', 'transit connect',
  ];

  // Check patterns in order of specificity
  for (const pattern of truckPatterns) {
    if (combined.includes(pattern)) return 'Truck';
  }
  for (const pattern of minivanPatterns) {
    if (combined.includes(pattern)) return 'Minivan';
  }
  for (const pattern of wagonPatterns) {
    if (combined.includes(pattern)) return 'Wagon';
  }
  for (const pattern of coupePatterns) {
    if (combined.includes(pattern)) return 'Coupe';
  }
  for (const pattern of hatchbackPatterns) {
    if (combined.includes(pattern)) return 'Hatchback';
  }
  for (const pattern of sedanPatterns) {
    if (combined.includes(pattern)) return 'Sedan';
  }
  for (const pattern of suvPatterns) {
    if (combined.includes(pattern)) return 'SUV';
  }

  // Default to SUV for unknown crossovers (most common for dealerships)
  return 'SUV';
}

/**
 * Validate and filter CPO badge based on business rules:
 * CPO (Certified Pre-Owned) only applies to:
 * - Hyundai vehicles
 * - 2022 or newer model year
 * - Less than 80,000 km
 * - MUST have a known odometer (not null/0)
 */
function validateCPOBadge(badges: string[], make: string, year: number, odometer: number | null): string[] {
  const hasCPO = badges.includes('Certified Pre-Owned');
  if (!hasCPO) return badges;
  
  const isHyundai = make.toLowerCase().includes('hyundai');
  const isRecentYear = year >= 2022;
  // Odometer must be a known value (not null, not 0 which indicates extraction failed)
  const hasValidOdometer = odometer !== null && odometer > 0;
  const isLowKm = hasValidOdometer && odometer < 80000;
  
  // Only keep CPO if all conditions are met (including having a valid odometer)
  if (isHyundai && isRecentYear && isLowKm) {
    return badges;
  }
  
  // Remove CPO badge if conditions are not met
  return badges.filter(b => b !== 'Certified Pre-Owned');
}

/**
 * Extract exterior and interior colors from VDP HTML
 * Olympic Hyundai pages show "Exterior Colour: Blue" format
 */
function extractColors(html: string): { exterior: string | null; interior: string | null } {
  let exterior: string | null = null;
  let interior: string | null = null;
  
  const validColors = [
    'black', 'white', 'grey', 'gray', 'silver', 'red', 'blue', 'green', 'brown', 'beige', 'tan',
    'yellow', 'orange', 'purple', 'gold', 'charcoal', 'ivory', 'cream', 'burgundy', 'maroon',
    'navy', 'bronze', 'champagne', 'pearl', 'platinum', 'copper', 'midnight', 'graphite',
    'dark grey', 'dark gray', 'dark blue', 'dark red', 'dark green', 'light grey', 'light gray',
    'light blue', 'magnetic grey', 'phantom black', 'atlas white', 'shimmering silver',
    'ultimate red', 'electric shadow', 'abyss black', 'serenity white', 'cypress green',
  ];

  function isValidColor(value: string): boolean {
    if (!value || value.length < 3 || value.length > 30) return false;
    const lower = value.toLowerCase().trim();
    if (validColors.some(c => lower.includes(c))) return true;
    if (/\b(with|and|features|comfortable|versatile|upscale|advanced|safety|accents|premium)\b/i.test(value)) return false;
    if (value.split(' ').length > 3) return false;
    return false;
  }

  // Match "Exterior Colour: Blue" or "Exterior Color: Blue" patterns
  const extPatterns = [
    /exterior\s*colou?r[:\s]+([A-Za-z\s]+?)(?:<|&|\n|,|;|\||$)/i,
    /colou?r\s*(?:\(exterior\)|exterior)[:\s]+([A-Za-z\s]+?)(?:<|&|\n|,|;|\||$)/i,
  ];
  for (const pattern of extPatterns) {
    const match = html.match(pattern);
    if (match && isValidColor(match[1].trim())) {
      exterior = match[1].trim();
      break;
    }
  }
  
  // Match interior color patterns
  const intPatterns = [
    /interior\s*colou?r[:\s]+([A-Za-z\s]+?)(?:<|&|\n|,|;|\||$)/i,
    /colou?r\s*(?:\(interior\)|interior)[:\s]+([A-Za-z\s]+?)(?:<|&|\n|,|;|\||$)/i,
  ];
  for (const pattern of intPatterns) {
    const match = html.match(pattern);
    if (match && isValidColor(match[1].trim())) {
      interior = match[1].trim();
      break;
    }
  }
  
  return { exterior, interior };
}

/**
 * Extract transmission type from VDP HTML
 */
function extractTransmission(html: string): string | null {
  const text = html.toLowerCase();
  // Match "Transmission: Automatic" pattern from Olympic pages
  const transmissionMatch = html.match(/transmission[:\s]+([A-Za-z]+)/i);
  if (transmissionMatch) {
    const trans = transmissionMatch[1].toLowerCase();
    if (trans.includes('auto')) return 'Automatic';
    if (trans.includes('manual')) return 'Manual';
    if (trans.includes('cvt')) return 'CVT';
  }
  // Fallback to text search
  if (/\bautomatic\b|\bauto trans\b/.test(text)) return 'Automatic';
  if (/\bmanual\b|\bstick shift\b|\b6-speed manual\b|\b5-speed manual\b/.test(text)) return 'Manual';
  if (/\bcvt\b/.test(text)) return 'CVT';
  return null;
}

/**
 * Extract drivetrain from VDP HTML
 */
function extractDrivetrain(html: string): string | null {
  const text = html.toLowerCase();
  // Match "Drive Train: AWD" pattern from Olympic pages
  const driveMatch = html.match(/drive\s*train[:\s]+([A-Za-z0-9]+)/i);
  if (driveMatch) {
    const drive = driveMatch[1].toLowerCase();
    if (drive.includes('awd') || drive.includes('all')) return 'AWD';
    if (drive.includes('4wd') || drive.includes('4x4')) return '4WD';
    if (drive.includes('fwd') || drive.includes('front')) return 'FWD';
    if (drive.includes('rwd') || drive.includes('rear')) return 'RWD';
  }
  // Fallback to text search
  if (/\bawd\b|\ball[\s-]?wheel[\s-]?drive\b/.test(text)) return 'AWD';
  if (/\b4wd\b|\bfour[\s-]?wheel[\s-]?drive\b|\b4x4\b/.test(text)) return '4WD';
  if (/\bfwd\b|\bfront[\s-]?wheel[\s-]?drive\b/.test(text)) return 'FWD';
  if (/\brwd\b|\brear[\s-]?wheel[\s-]?drive\b/.test(text)) return 'RWD';
  return null;
}

/**
 * Determine fuel type from model name - most reliable method
 */
function getFuelTypeFromModel(make: string, model: string): string | null {
  const fullModel = `${make} ${model}`.toLowerCase();
  
  // Known Electric vehicles
  if (/ioniq\s*5|ioniq\s*6|ioniq5|ioniq6/i.test(fullModel)) return 'Electric';
  if (/kona\s*electric/i.test(fullModel)) return 'Electric';
  if (/polestar/i.test(fullModel)) return 'Electric';
  if (/tesla/i.test(fullModel)) return 'Electric';
  if (/\bzdx\b/i.test(fullModel)) return 'Electric'; // Acura ZDX is electric
  if (/\bev6\b/i.test(fullModel)) return 'Electric';
  if (/\bleaf\b/i.test(fullModel)) return 'Electric';
  if (/bolt\s*(ev|euv)?/i.test(fullModel) && /chevrolet|chevy/i.test(fullModel)) return 'Electric';
  if (/mach-e|mustang\s*mach/i.test(fullModel)) return 'Electric';
  if (/id\.\d/i.test(fullModel)) return 'Electric'; // VW ID.4, ID.5, etc
  if (/\bniro\s*ev\b/i.test(fullModel)) return 'Electric';
  if (/ariya/i.test(fullModel)) return 'Electric';
  if (/solterra/i.test(fullModel)) return 'Electric';
  if (/bz4x/i.test(fullModel)) return 'Electric';
  
  // Known Hybrid/PHEV vehicles
  if (/\bhybrid\b/i.test(fullModel)) return 'Hybrid';
  if (/\bphev\b/i.test(fullModel)) return 'Hybrid';
  if (/plug[\s-]?in/i.test(fullModel)) return 'Hybrid';
  if (/\b4xe\b/i.test(fullModel)) return 'Hybrid'; // Jeep 4xe models
  if (/\bprime\b/i.test(fullModel)) return 'Hybrid'; // Toyota Prime
  if (/recharge/i.test(fullModel)) return 'Hybrid'; // Volvo Recharge (PHEV unless pure EV confirmed)
  
  return null;
}

/**
 * Extract fuel type from VDP HTML - uses model name first, then structured data
 * IMPORTANT: Must avoid false positives from "electric power steering", "electric windows", etc.
 */
function extractFuelType(html: string, make?: string, model?: string): string {
  const $ = cheerio.load(html);
  
  // PRIORITY 1: Check model name directly (most reliable)
  if (make && model) {
    const modelFuel = getFuelTypeFromModel(make, model);
    if (modelFuel) return modelFuel;
  }
  
  // PRIORITY 2: Try to extract from page title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    const titleText = titleMatch[1];
    const vehicleMatch = titleText.match(/\d{4}\s+(\w+)\s+(.+?)(?:\s*[-|]|$)/);
    if (vehicleMatch) {
      const titleMake = vehicleMatch[1];
      const titleModel = vehicleMatch[2];
      const modelFuel = getFuelTypeFromModel(titleMake, titleModel);
      if (modelFuel) return modelFuel;
    }
  }
  
  // PRIORITY 3: Look for JSON-LD structured data (most authoritative)
  // Handles arrays, @graph structures, and nested vehicle objects
  try {
    const scripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      const text = $(scripts[i]).text();
      if (text.includes('Vehicle') || text.includes('Car') || text.includes('fuelType')) {
        try {
          const data = JSON.parse(text);
          
          // Helper to extract fuel type from any vehicle-like object
          const extractFromObject = (obj: any): string | null => {
            if (!obj || typeof obj !== 'object') return null;
            const fuelVal = obj.fuelType || obj.vehicleEngine?.fuelType || obj.fuel;
            if (fuelVal) {
              const fuel = String(fuelVal).toLowerCase();
              if (fuel.includes('electric')) return 'Electric';
              if (fuel.includes('hybrid') || fuel.includes('plug')) return 'Hybrid';
              if (fuel.includes('diesel')) return 'Diesel';
              if (fuel.includes('gas') || fuel.includes('petrol')) return 'Gasoline';
            }
            return null;
          };
          
          // Handle @graph arrays
          if (data['@graph'] && Array.isArray(data['@graph'])) {
            for (const item of data['@graph']) {
              const fuel = extractFromObject(item);
              if (fuel) return fuel;
            }
          }
          // Handle top-level arrays
          else if (Array.isArray(data)) {
            for (const item of data) {
              const fuel = extractFromObject(item);
              if (fuel) return fuel;
            }
          }
          // Handle single object
          else {
            const fuel = extractFromObject(data);
            if (fuel) return fuel;
          }
        } catch (parseErr) {
          // Individual JSON parse failed, try next script
        }
      }
    }
  } catch (e) {
    // Script access failed, continue with other methods
  }
  
  // PRIORITY 4: Look for SPECIFIC fuel type labels (not generic text)
  // Olympic Hyundai uses: <dt>FUEL TYPE</dt><dd>Electric</dd> or similar patterns
  // Expanded to handle "Fuel", "Powertrain", "Engine Type" variants
  const dtDdPatterns = [
    /<dt[^>]*>\s*fuel\s*(?:type)?\s*<\/dt>\s*<dd[^>]*>\s*([^<]+)/i,
    /<th[^>]*>\s*fuel\s*(?:type)?\s*<\/th>\s*<td[^>]*>\s*([^<]+)/i,
    /<dt[^>]*>\s*powertrain\s*<\/dt>\s*<dd[^>]*>\s*([^<]+)/i,
    /<th[^>]*>\s*powertrain\s*<\/th>\s*<td[^>]*>\s*([^<]+)/i,
    /<dt[^>]*>\s*engine\s*type\s*<\/dt>\s*<dd[^>]*>\s*([^<]+)/i,
    /<span[^>]*class="[^"]*label[^"]*"[^>]*>\s*fuel\s*(?:type)?\s*<\/span>\s*<span[^>]*>\s*([^<]+)/i,
    /<div[^>]*class="[^"]*spec-label[^"]*"[^>]*>\s*fuel\s*(?:type)?\s*<\/div>\s*<div[^>]*class="[^"]*spec-value[^"]*"[^>]*>\s*([^<]+)/i,
    />\s*fuel\s*(?:type)?:\s*<\/[^>]+>\s*<[^>]+>\s*([^<]+)/i,
  ];
  
  for (const pattern of dtDdPatterns) {
    const match = html.match(pattern);
    if (match) {
      const fuel = match[1].toLowerCase().trim();
      // CRITICAL: Only accept exact fuel type values, not text that happens to contain these words
      if (/^electric$/i.test(fuel)) return 'Electric';
      if (/^hybrid$/i.test(fuel) || /^plug[\s-]?in\s*hybrid$/i.test(fuel)) return 'Hybrid';
      if (/^diesel$/i.test(fuel)) return 'Diesel';
      if (/^gas$/i.test(fuel) || /^gasoline$/i.test(fuel) || /^petrol$/i.test(fuel) || /^unleaded$/i.test(fuel)) return 'Gasoline';
    }
  }
  
  // PRIORITY 5: Look for hidden inputs or data attributes specifically for fuel type
  const fuelInput = $('input[name*="fuel"], input[name*="fuelType"], [data-fuel-type]');
  if (fuelInput.length > 0) {
    const fuelValue = (fuelInput.val() as string || fuelInput.attr('data-fuel-type') || '').toLowerCase().trim();
    if (fuelValue === 'electric') return 'Electric';
    if (fuelValue === 'hybrid' || fuelValue.includes('plug')) return 'Hybrid';
    if (fuelValue === 'diesel') return 'Diesel';
    if (fuelValue === 'gas' || fuelValue === 'gasoline') return 'Gasoline';
  }
  
  // DEFAULT: Most vehicles are gasoline - safer than guessing "Electric" from false positives
  return 'Gasoline';
}

/**
 * Validation result for vehicle data
 */
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate vehicle data before saving to prevent bad data from being stored.
 * This is the "law" for all scraping operations - vehicles that fail validation are rejected.
 * 
 * VALIDATION RULES:
 * 1. Required fields: year, make, model must be present
 * 2. Year: Must be between 1990 and current year + 2
 * 3. Price: Must be between $5,000 and $500,000 (or null for "Call for Price")
 * 4. Odometer: Must be explicitly extracted (not default value), 0-500,000 km range
 * 5. Images: Must have at least 1 valid vehicle photo
 * 6. VIN: If present, must be 17 characters
 */
function validateVehicleData(vehicle: {
  year: number;
  make: string;
  model: string;
  trim?: string;
  price: number | null;
  odometer: number | null;
  images: string[];
  vin?: string;
  wasOdometerExtracted?: boolean; // Flag to indicate if odometer was explicitly extracted
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const currentYear = new Date().getFullYear();

  // 1. Required fields
  if (!vehicle.year || vehicle.year < 1990 || vehicle.year > currentYear + 2) {
    errors.push(`Invalid year: ${vehicle.year} (must be 1990-${currentYear + 2})`);
  }
  if (!vehicle.make || vehicle.make.trim().length < 2) {
    errors.push(`Missing or invalid make: "${vehicle.make}"`);
  }
  if (!vehicle.model || vehicle.model.trim().length < 1) {
    errors.push(`Missing or invalid model: "${vehicle.model}"`);
  }

  // 2. Price validation (allow null for "Call for Price" or 0 for pending enrichment)
  if (vehicle.price !== null && vehicle.price !== 0) {
    if (vehicle.price < 0) {
      errors.push(`Invalid price: $${vehicle.price} (cannot be negative)`);
    } else if (vehicle.price < 5000) {
      warnings.push(`Price low: $${vehicle.price} (typical minimum $5,000)`);
    } else if (vehicle.price > 500000) {
      warnings.push(`Price high: $${vehicle.price} (typical maximum $500,000)`);
    }
  } else if (vehicle.price === 0) {
    warnings.push('Price is 0 (pending enrichment)');
  }

  // 3. Odometer validation - allow any value, just warn on suspicious ones
  if (vehicle.odometer !== null) {
    if (vehicle.odometer < 0) {
      warnings.push(`Negative odometer: ${vehicle.odometer} km`);
    } else if (vehicle.odometer > 500000) {
      warnings.push(`High odometer: ${vehicle.odometer} km`);
    } else if (vehicle.odometer === 100 || vehicle.odometer === 0) {
      // These are common default/fallback values - likely extraction failed
      if (vehicle.year < currentYear) {
        warnings.push(`Suspicious odometer: ${vehicle.odometer} km may be a default value`);
      }
    }
  } else {
    // Null odometer - just a warning, don't reject the vehicle
    if (vehicle.year < currentYear) {
      warnings.push(`Missing odometer for ${vehicle.year} used vehicle`);
    }
  }

  // 4. Images validation - warn if no images, but don't reject
  const validImages = vehicle.images.filter(url => !isBlockedImage(url));
  if (validImages.length === 0) {
    warnings.push('No valid vehicle images found (pending enrichment)');
  }

  // 5. VIN validation (if present)
  if (vehicle.vin && !vehicle.vin.startsWith('ZENROWS-') && !vehicle.vin.startsWith('SCRAPINGBEE-')) {
    if (vehicle.vin.length !== 17) {
      warnings.push(`Invalid VIN length: "${vehicle.vin}" (should be 17 characters)`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Log validation failure for a vehicle
 */
function logValidationFailure(vehicle: { year: number; make: string; model: string; dealerVdpUrl?: string }, result: ValidationResult): void {
  console.error(`[Robust Scraper] ❌ VALIDATION FAILED for ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
  console.error(`  URL: ${vehicle.dealerVdpUrl || 'unknown'}`);
  result.errors.forEach(err => console.error(`  ERROR: ${err}`));
  result.warnings.forEach(warn => console.warn(`  WARNING: ${warn}`));
}

function extractPhotoUrlsFromSrcset(srcset: string): string[] {
  const urls: string[] = [];
  for (const part of srcset.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const firstToken = trimmed.split(/\s+/)[0];
    if (firstToken) urls.push(firstToken);
  }
  return urls;
}

function extractAutotraderPhotoUrlsFromHtml(html: string): string[] {
  const matches = html.match(/https?:\/\/[^\s"'<>\\)]+/gi) || [];
  const urls: string[] = [];
  for (const u of matches) {
    const lower = u.toLowerCase();
    if (!lower.includes('autotradercdn.ca') && !lower.includes('photomanager')) continue;
    if (!/\.(jpe?g|png|webp)(?:$|[?#-])/i.test(lower)) continue;
    urls.push(u);
  }
  return urls;
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const base = url.split('?')[0]?.toLowerCase() ?? url.toLowerCase();
    if (seen.has(base)) continue;
    seen.add(base);
    out.push(url);
  }
  return out;
}

function extractOlympicImagesFromCheerio(v$: cheerio.CheerioAPI, html: string): string[] {
  const candidates: string[] = [];

  const attrNames = [
    'src',
    'data-src',
    'data-lazy-src',
    'data-original',
    'data-full-src',
    'data-large-src',
    'data-zoom-image',
  ] as const;

  // PRIORITY 1: Look for images ONLY in the main vehicle gallery container
  // This prevents grabbing images from "related vehicles" or "similar listings" sections
  const gallerySelectors = [
    '.vdp-gallery',
    '.gallery-thumbs',
    '.photo-gallery',
    '.vehicle-gallery',
    '.main-gallery',
    '.slider-main',
    '.vdp-photos',
    '.photoswipe-gallery',
    '[data-gallery="main"]',
    '.swiper-wrapper:first', // First swiper is usually main gallery
  ];

  let galleryContainer = null;
  for (const selector of gallerySelectors) {
    const container = v$(selector).first();
    if (container.length > 0) {
      galleryContainer = container;
      break;
    }
  }

  // Extract from gallery container if found
  if (galleryContainer) {
    galleryContainer.find('img, source').each((_, elem) => {
      for (const attr of attrNames) {
        const val = v$(elem).attr(attr);
        if (val) candidates.push(val);
      }
      const srcset = v$(elem).attr('srcset') || v$(elem).attr('data-srcset');
      if (srcset) {
        candidates.push(...extractPhotoUrlsFromSrcset(srcset));
      }
    });

    galleryContainer.find('[style*="background-image"]').each((_, elem) => {
      const style = v$(elem).attr('style') || '';
      const bgMatch = style.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/i);
      if (bgMatch?.[1]) candidates.push(bgMatch[1]);
    });
  }

  // PRIORITY 2: If no gallery container found, look for images in header/hero area only
  // Avoid "related listings" sections which typically appear lower on the page
  if (candidates.length === 0) {
    // Only extract from upper part of page (before any "related" sections)
    const upperPagePatterns = [
      '.vdp-header',
      '.vehicle-header',
      'main',
      '#vdp-content',
      '.vehicle-detail',
    ];
    
    for (const selector of upperPagePatterns) {
      const container = v$(selector).first();
      if (container.length > 0) {
        container.find('img, source').each((_, elem) => {
          for (const attr of attrNames) {
            const val = v$(elem).attr(attr);
            if (val) candidates.push(val);
          }
        });
        if (candidates.length > 0) break;
      }
    }
  }

  // PRIORITY 3: Look for data-photonum or similar attributes which indicate main gallery images
  if (candidates.length === 0) {
    v$('[data-photonum], [data-index], [data-slide-index]').each((_, elem) => {
      const img = v$(elem).find('img').first();
      if (img.length > 0) {
        for (const attr of attrNames) {
          const val = img.attr(attr);
          if (val) candidates.push(val);
        }
      }
    });
  }

  // PRIORITY 4: Only as last resort, extract autotrader URLs but EXCLUDE "similar/related" sections
  if (candidates.length === 0) {
    // Use Cheerio to surgically remove related sections before extracting URLs
    // This is more reliable than regex for nested HTML
    const cleanedDoc = v$.root().clone();
    
    // Remove Recommended Vehicles section and similar elements by selector
    const sectionsToRemove = [
      '.recommended-vehicles',
      '.similar-vehicles', 
      '.related-vehicles',
      '.also-viewed',
      '[class*="recommended"]',
      '[class*="similar-listing"]',
      '[class*="related-listing"]',
      'section:has(h2:contains("Recommended"))',
      'section:has(h3:contains("Recommended"))',
      'div:has(h2:contains("Recommended Vehicles"))',
      'div:has(h3:contains("Recommended Vehicles"))',
      'section:has(h2:contains("Similar"))',
      'section:has(h2:contains("Related"))',
      // Common patterns for recommendation carousels
      '.vehicle-carousel:not(:first)',
      '.listings-carousel',
    ];
    
    sectionsToRemove.forEach(selector => {
      try {
        cleanedDoc.find(selector).remove();
      } catch (e) {
        // Some selectors may not be supported, ignore
      }
    });
    
    // Also use text-based removal for "Recommended Vehicles" heading and its siblings
    cleanedDoc.find('h2, h3, h4').each((_, heading) => {
      const text = v$(heading).text().toLowerCase();
      if (text.includes('recommended') || text.includes('similar vehicles') || text.includes('related vehicles')) {
        // Remove this heading and all following siblings (the recommendation section)
        const parent = v$(heading).parent();
        v$(heading).nextAll().remove();
        v$(heading).remove();
      }
    });
    
    const cleanedHtml = cleanedDoc.html() || '';
    candidates.push(...extractAutotraderPhotoUrlsFromHtml(cleanedHtml));
  }

  const normalized = candidates
    .map((u) => (u.startsWith('//') ? `https:${u}` : u))
    .filter((u) => u.startsWith('http') && !u.includes('base64'))
    .map(normalizeAutoTraderPhotoUrl);

  // CRITICAL: Validate all images come from the same CDN folder
  // AutoTrader CDN URLs have format: .../photos/import/YYYYMM/DDDD/FOLDER_ID/...
  // All images for ONE vehicle should share the same FOLDER_ID
  const filtered = filterVehicleImages(dedupeUrls(normalized));
  return validateSameFolderImages(filtered);
}

/**
 * Validates that all extracted images come from the same CDN folder.
 * This prevents mixing images from different vehicles (e.g., from Recommended Vehicles section).
 * 
 * AutoTrader CDN URL pattern: /photos/import/YYYYMM/DDDD/FOLDER_ID/filename.jpg
 * Each vehicle has a unique FOLDER_ID - all images for one vehicle share it.
 */
function validateSameFolderImages(images: string[]): string[] {
  if (images.length === 0) return images;
  
  // Extract folder IDs from AutoTrader CDN URLs
  const folderPattern = /\/photos\/import\/\d+\/\d+\/(\d+)\//i;
  const folderCounts = new Map<string, string[]>();
  const nonCdnImages: string[] = [];
  
  for (const img of images) {
    const match = img.match(folderPattern);
    if (match && match[1]) {
      const folderId = match[1];
      if (!folderCounts.has(folderId)) {
        folderCounts.set(folderId, []);
      }
      folderCounts.get(folderId)!.push(img);
    } else {
      // Non-CDN image, keep separately
      nonCdnImages.push(img);
    }
  }
  
  // If we have multiple folder IDs, something went wrong
  // Use only images from the folder with the most images (likely the correct vehicle)
  if (folderCounts.size > 1) {
    let maxFolder = '';
    let maxCount = 0;
    for (const [folderId, imgs] of folderCounts) {
      if (imgs.length > maxCount) {
        maxCount = imgs.length;
        maxFolder = folderId;
      }
    }
    
    const rejectedFolders = [...folderCounts.keys()].filter(f => f !== maxFolder);
    logWarn('[Image Validation] Multiple CDN folders detected - filtering to primary folder', {
      primaryFolder: maxFolder,
      primaryCount: maxCount,
      rejectedFolders,
      rejectedCounts: rejectedFolders.map(f => folderCounts.get(f)?.length || 0)
    });
    
    // Return only images from the primary (most common) folder
    return folderCounts.get(maxFolder) || [];
  }
  
  // Single folder or no CDN images - return all
  if (folderCounts.size === 1) {
    const [, imgs] = [...folderCounts.entries()][0];
    return imgs;
  }
  
  // No CDN images found, return non-CDN images
  return nonCdnImages;
}

function extractGenericImagesFromCheerio(v$: cheerio.CheerioAPI, vdpUrl: string): string[] {
  let origin = '';
  try {
    origin = new URL(vdpUrl).origin;
  } catch {
    origin = '';
  }

  const candidates: string[] = [];
  const attrNames = [
    'src',
    'data-src',
    'data-lazy-src',
    'data-original',
    'data-full-src',
    'data-large-src',
    'data-zoom-image',
  ] as const;

  v$('img, source').each((_, elem) => {
    for (const attr of attrNames) {
      const val = v$(elem).attr(attr);
      if (val) candidates.push(val);
    }
    const srcset = v$(elem).attr('srcset') || v$(elem).attr('data-srcset');
    if (srcset) candidates.push(...extractPhotoUrlsFromSrcset(srcset));
  });

  v$('[style*="background-image"]').each((_, elem) => {
    const style = v$(elem).attr('style') || '';
    const bgMatch = style.match(/url\(["']?([^"')]+)["']?\)/i);
    if (bgMatch?.[1]) candidates.push(bgMatch[1]);
  });

  const normalized = candidates
    .map((u) => (u.startsWith('//') ? `https:${u}` : u))
    .map((u) => (u.startsWith('/') && origin ? `${origin}${u}` : u))
    .filter((u) => u.startsWith('http') && !u.includes('base64'))
    .filter((u) => /\.(jpe?g|png|webp)(?:$|[?#-])/i.test(u));

  return filterVehicleImages(dedupeUrls(normalized));
}

interface ScrapeResult {
  success: boolean;
  vehiclesFound: number;
  vehiclesInserted: number;
  vehiclesUpdated: number;
  vehiclesDeleted: number;
  vehiclesRejected: number; // Vehicles that failed validation and were not saved
  method: 'zenrows' | 'scrapingbee' | 'puppeteer' | 'browserless' | 'apify' | 'cache_preserve';
  error?: string;
  retryCount: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * ZenRows Cloud Scrape (Primary - Cloudflare Bypass)
 * 
 * Uses ZenRows API with Canadian residential proxies to bypass aggressive
 * Cloudflare Enterprise protection on dealership websites like olympichyundaivancouver.com.
 */
async function attemptZenRowsScrape(dealershipId?: number): Promise<{
  success: boolean;
  vehiclesImported: number;
  vehiclesInserted: number;
  vehiclesUpdated: number;
  vehiclesDeleted: number;
  vehiclesRejected: number;
  error?: string;
}> {
  try {
    const zenrowsService = new BrowserlessUnifiedService();
    
    if (!zenrowsService.isZenRowsConfigured()) {
      return { success: false, vehiclesImported: 0, vehiclesInserted: 0, vehiclesUpdated: 0, vehiclesDeleted: 0, vehiclesRejected: 0, error: 'ZenRows API key not configured' };
    }

    logInfo('[Robust Scraper] ZenRows configured. Fetching scrape sources...', { service: 'scraper', method: 'zenrows' });

    const sources = dealershipId
      ? await db.select().from(scrapeSources).where(
          and(eq(scrapeSources.dealershipId, dealershipId), eq(scrapeSources.isActive, true))
        )
      : await db.select().from(scrapeSources).where(eq(scrapeSources.isActive, true));

    if (sources.length === 0) {
      return { success: false, vehiclesImported: 0, vehiclesInserted: 0, vehiclesUpdated: 0, vehiclesDeleted: 0, vehiclesRejected: 0, error: 'No active scrape sources configured' };
    }

    // Get all dealership info for accurate location data
    const dealershipList = await db.select().from(dealerships);
    const dealershipMap = new Map(dealershipList.map(d => [d.id, d]));

    let totalImported = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalRejected = 0;
    const foundVdpUrls: Set<string> = new Set(); // Track all VDP URLs found during scrape
    let olympicProcessed = 0;
    let olympicZeroImageCount = 0;
    const blockedVdpUrls: { url: string; sourceHostname: string; dealershipId: number; dealership: any }[] = []; // Retry queue for blocked VDPs

    for (const source of sources) {
      logInfo('[Robust Scraper] ZenRows scraping source', { service: 'scraper', method: 'zenrows', sourceName: source.sourceName, sourceUrl: source.sourceUrl });
      
      try {
        let sourceHostname = '';
        try {
          sourceHostname = new URL(source.sourceUrl).hostname;
        } catch {
          sourceHostname = '';
        }

        // Scrape the listing page with scroll-to-bottom enabled for lazy-loading
        const listingResult = await zenrowsService.zenRowsScrape(source.sourceUrl, {
          scrollToBottom: true  // Enable scrolling for lazy-loaded inventory pages
        });
        
        if (!listingResult.success || !listingResult.html) {
          logWarn('[Robust Scraper] ZenRows failed to get listing page', { service: 'scraper', method: 'zenrows', sourceName: source.sourceName, error: listingResult.error });
          continue;
        }

        // CRITICAL: Detect Cloudflare block pages on listing page
        if (isCloudflareBlockPage(listingResult.html)) {
          logWarn('[Robust Scraper] ZenRows received Cloudflare block page on listing page', { service: 'scraper', method: 'zenrows', sourceName: source.sourceName });
          continue;
        }

        // Parse listing HTML to extract vehicle URLs
        const $ = cheerio.load(listingResult.html);
        const vehicleUrls: string[] = [];
        
        // Extract vehicle detail page URLs
        $('a[href*="/vehicles/"]').each((_, elem) => {
          const href = $(elem).attr('href');
          if (href && /\/vehicles\/\d{4}\/[a-z-]+\/[a-z0-9-]+/i.test(href)) {
            let fullUrl = href;
            if (href.startsWith('/')) {
              try {
                const urlObj = new URL(source.sourceUrl);
                fullUrl = `${urlObj.origin}${href}`;
              } catch {}
            }
            if (!vehicleUrls.includes(fullUrl)) {
              vehicleUrls.push(fullUrl);
            }
          }
        });

        logInfo('[Robust Scraper] ZenRows found vehicle URLs', { service: 'scraper', method: 'zenrows', vehicleUrlCount: vehicleUrls.length, sourceName: source.sourceName });

        // Process each VDP (with rate limiting)
        for (const vdpUrl of vehicleUrls) {
          try {
            // OPTIMIZATION: Skip VDP re-scraping if vehicle already has 12+ images (complete data)
            // Only price updates needed - those happen via SRP or force re-scrape
            const existingComplete = await db.select({ 
              id: vehicles.id, 
              vin: vehicles.vin, 
              images: vehicles.images,
              price: vehicles.price 
            })
              .from(vehicles)
              .where(and(
                eq(vehicles.dealershipId, source.dealershipId),
                eq(vehicles.dealerVdpUrl, vdpUrl)
              ))
              .limit(1);
            
            if (existingComplete.length > 0 && existingComplete[0].images && existingComplete[0].images.length >= 12) {
              logInfo('[Robust Scraper] Skipping VDP scrape - vehicle has 12+ images (complete)', { 
                service: 'scraper', method: 'zenrows', vdpUrl, 
                vehicleId: existingComplete[0].id, 
                imageCount: existingComplete[0].images.length 
              });
              foundVdpUrls.add(vdpUrl); // Mark as found to prevent deletion
              continue; // Skip to next vehicle
            }
            
            await sleep(5000); // Rate limit: 5 seconds between VDP requests to avoid Cloudflare blocks
            
            const vdpResult = await zenrowsService.zenRowsScrape(vdpUrl);
            
            if (!vdpResult.success || !vdpResult.html) {
              logWarn('[Robust Scraper] ZenRows failed to get VDP', { service: 'scraper', method: 'zenrows', vdpUrl, error: vdpResult.error });
              continue;
            }

            // CRITICAL: Detect Cloudflare block pages that would produce garbage data
            // Try ScrapingBee as fallback if ZenRows gets blocked
            if (isCloudflareBlockPage(vdpResult.html)) {
              logWarn('[Robust Scraper] ZenRows received Cloudflare block page, trying ScrapingBee fallback', { service: 'scraper', method: 'zenrows', vdpUrl });
              
              // Fallback attempt with ScrapingBee
              await sleep(1500);
              const scrapingBeeResult = await zenrowsService.scrapingBeeScrape(vdpUrl);
              
              if (scrapingBeeResult.success && scrapingBeeResult.html && !isCloudflareBlockPage(scrapingBeeResult.html)) {
                logInfo('[Robust Scraper] ScrapingBee fallback succeeded for VDP', { service: 'scraper', method: 'scrapingbee-fallback', vdpUrl });
                // Use ScrapingBee result instead
                vdpResult.html = scrapingBeeResult.html;
                vdpResult.success = true;
              } else {
                logWarn('[Robust Scraper] ScrapingBee fallback also failed, importing with basic URL data', { service: 'scraper', method: 'zenrows', vdpUrl });
                // Queue for retry
                const dealership = dealershipMap.get(source.dealershipId);
                blockedVdpUrls.push({ url: vdpUrl, sourceHostname, dealershipId: source.dealershipId, dealership });
                
                // IMPORTANT: Before creating a PENDING placeholder, check if vehicle with same VDP URL already exists
                // This prevents duplicate records from accumulating on each scrape run
                const existingByUrl = await db.select({ id: vehicles.id, vin: vehicles.vin })
                  .from(vehicles)
                  .where(and(
                    eq(vehicles.dealershipId, source.dealershipId),
                    eq(vehicles.dealerVdpUrl, vdpUrl)
                  ))
                  .limit(1);
                
                if (existingByUrl.length > 0) {
                  logInfo('[Robust Scraper] Vehicle with same VDP URL already exists, skipping placeholder creation', { 
                    service: 'scraper', method: 'zenrows', vdpUrl, existingId: existingByUrl[0].id, existingVin: existingByUrl[0].vin 
                  });
                  continue;
                }
                
                // Extract year, make, model from URL
                const basicUrlMatch = vdpUrl.match(/\/vehicles\/(\d{4})\/([a-z-]+)\/([a-z0-9-]+)/i);
                if (basicUrlMatch) {
                  const basicYear = parseInt(basicUrlMatch[1]);
                  const basicMake = basicUrlMatch[2].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  const basicModel = basicUrlMatch[3].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  
                  // Generate a temporary VIN since we couldn't get the real one
                  const tempVin = `PENDING-${Date.now()}-${Math.random().toString(36).substring(7)}`;
                  
                  // Create basic vehicle record - it will be enriched on next successful scrape
                  const basicVehicle = {
                    dealershipId: source.dealershipId,
                    year: basicYear,
                    make: basicMake,
                    model: basicModel,
                    trim: 'Base',
                    type: 'SUV',
                    price: 0, // Placeholder - will be enriched on next successful VDP scrape
                    odometer: 0, // Placeholder - will be enriched on next successful VDP scrape
                    images: [],
                    badges: [],
                    location: 'Vancouver, BC',
                    dealership: dealership?.name || 'Olympic Hyundai Vancouver',
                    description: '',
                    vin: tempVin,
                    stockNumber: '',
                    dealerVdpUrl: vdpUrl,
                  };
                  
                  // Only basic validation on year/make/model (skip full validation for pending enrichment)
                  if (basicYear >= 1990 && basicMake.length >= 2 && basicModel.length >= 1) {
                    try {
                      await storage.createVehicle(basicVehicle as any);
                      logInfo('[Robust Scraper] Imported vehicle with basic URL data (pending enrichment)', { 
                        service: 'scraper', method: 'zenrows', year: basicYear, make: basicMake, model: basicModel, vdpUrl 
                      });
                      totalInserted++;
                      totalImported++;
                    } catch (e: any) {
                      if (e.message?.includes('duplicate') || e.code === '23505') {
                        logInfo('[Robust Scraper] Vehicle already exists, skipping basic import', { 
                          service: 'scraper', method: 'zenrows', year: basicYear, make: basicMake, model: basicModel 
                        });
                      } else {
                        logWarn('[Robust Scraper] Failed to import basic vehicle', { 
                          service: 'scraper', method: 'zenrows', error: e.message 
                        });
                      }
                    }
                  }
                }
                continue;
              }
            }

            // Parse VDP to extract vehicle data
            const v$ = cheerio.load(vdpResult.html);
            
            // Extract year, make, model from URL or page title
            const urlMatch = vdpUrl.match(/\/vehicles\/(\d{4})\/([a-z-]+)\/([a-z0-9-]+)/i);
            if (!urlMatch) continue;
            
            const year = parseInt(urlMatch[1]);
            const make = urlMatch[2].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const model = urlMatch[3].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            
            // Extract trim using vdp-trim hidden input (primary source for Olympic Hyundai)
            let trim = '';
            let vehicleHighlights = '';

            function extractHighlightsFromRaw(rawTrim: string): string {
              const pipeIndex = rawTrim.indexOf('|');
              if (pipeIndex === -1) return '';
              const afterTrim = rawTrim.substring(pipeIndex + 1).trim();
              const parts = afterTrim.split('|').map((p: string) => p.trim()).filter((p: string) => p.length > 0);
              return parts.join(' | ');
            }

            const badgeSuffixes = [
              /\s*\|\s*ONE OWNER.*/i, /\s*\|\s*LOW MILEAGE.*/i, /\s*\|\s*NO ACCIDENTS.*/i,
              /\s*\|\s*CERTIFIED.*/i, /\s*\|\s*BC VEHICLE.*/i, /\s*\|\s*LOCAL.*/i,
              /\s*\|\s*LEATHER.*/i, /\s*\|\s*SUNROOF.*/i, /\s*\|\s*HEATED.*/i,
              /\s*\|\s*NAVIGATION.*/i, /\s*\|\s*BLUETOOTH.*/i, /\s*\|\s*CAMERA.*/i,
              /\s*\|\s*CLEAN.*/i, /\s*\|\s*CARFAX.*/i, /\s*\|\s*WARRANTY.*/i,
              /\s*\|\s*FREE.*/i, /\s*\|\s*SALE.*/i, /\s*\|\s*SPECIAL.*/i,
            ];

            function cleanTrimValue(raw: string): string {
              let cleaned = raw;
              for (const pat of badgeSuffixes) {
                cleaned = cleaned.replace(pat, '');
              }
              return cleaned.replace(/\s*\|\s*$/g, '').trim();
            }

            const trimInvalidValues = ['trim', 'n/a', 'na', 'unknown', 'tbd', 'null', 'undefined', 'none', 'base'];
            const trimInvalidPatterns = ['interior', 'exterior', 'insert', 'color', 'colour', 'used', 'new', 'pre-owned',
              'certified', 'vancouver', 'burnaby', 'for sale', 'buy', 'inventory', 'stock', 'price', 'details', 'overview'];

            function isValidTrim(v: string): boolean {
              const lower = v.toLowerCase();
              if (trimInvalidValues.includes(lower)) return false;
              if (v.length < 2 || v.length > 60) return false;
              if (trimInvalidPatterns.some(inv => lower.includes(inv))) return false;
              return true;
            }

            // PRIMARY: vdp-trim hidden input
            const vdpTrimMatch = vdpResult.html.match(/name="vdp-trim"\s*value="([^"]+)"/i);
            if (vdpTrimMatch && vdpTrimMatch[1]) {
              const rawTrimVal = vdpTrimMatch[1].trim();
              vehicleHighlights = extractHighlightsFromRaw(rawTrimVal);
              const cleaned = cleanTrimValue(rawTrimVal);
              if (isValidTrim(cleaned)) trim = cleaned;
            }

            // FALLBACK 1: H1 tag
            if (!trim) {
              const h1Match = vdpResult.html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
              if (h1Match) {
                const escRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const makeP = escRegex(make).replace(/\s+/g, '[\\s-]+');
                const modelP = escRegex(model).replace(/\s+/g, '[\\s-]+');
                const titlePattern = new RegExp(`^\\d{4}\\s+${makeP}\\s+${modelP}\\s+(.+)$`, 'i');
                const titleMatch = h1Match[1].trim().match(titlePattern);
                if (titleMatch && titleMatch[1]) {
                  const cleaned = cleanTrimValue(titleMatch[1].trim());
                  if (isValidTrim(cleaned)) trim = cleaned;
                }
              }
            }

            // FALLBACK 2: og:title
            if (!trim) {
              const ogMatch = vdpResult.html.match(/og:title[^>]*content="([^"]+)"/i);
              if (ogMatch && ogMatch[1]) {
                const escRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const makeP = escRegex(make).replace(/\s+/g, '[\\s-]+');
                const modelP = escRegex(model).replace(/\s+/g, '[\\s-]+');
                const titlePattern = new RegExp(`^\\d{4}\\s+${makeP}\\s+${modelP}\\s+(.+)$`, 'i');
                const titleMatch = ogMatch[1].trim().match(titlePattern);
                if (titleMatch && titleMatch[1]) {
                  const cleaned = cleanTrimValue(titleMatch[1].trim());
                  if (isValidTrim(cleaned)) trim = cleaned;
                }
              }
            }

            // FALLBACK 3: structured data
            if (!trim) {
              const structuredPatterns = [/data-trim="([^"]+)"/i, /"trim"[:\s]*"([^"]+)"/i, /"vehicleConfiguration"[:\s]*"([^"]+)"/i];
              for (const pat of structuredPatterns) {
                const m = vdpResult.html.match(pat);
                if (m && m[1]) {
                  const cleaned = cleanTrimValue(m[1].trim());
                  if (isValidTrim(cleaned)) { trim = cleaned; break; }
                }
              }
            }
            
            // Try to extract VIN
            let vin = '';
            const vinMatch = vdpResult.html.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
            if (vinMatch) vin = vinMatch[1].toUpperCase();
            
            // Try to extract cash/sale price - look for specific price labels
            let price = 0;
            // Quick price extraction for optimization check
            const quickPriceMatch = vdpResult.html.match(/name="vdp-price"\s*value="\$\s*([\d,]+)"/i);
            if (quickPriceMatch) {
              price = parseInt(quickPriceMatch[1].replace(/,/g, ''));
            }
            
            // OPTIMIZATION: Check if this vehicle exists and already has VDP details
            // If so, only update the price and skip full VDP parsing
            if (vin) {
              const enrichmentStatus = await checkVehicleNeedsEnrichment(vin, source.dealershipId);
              
              if (enrichmentStatus.exists && !enrichmentStatus.needsEnrichment && enrichmentStatus.id) {
                // Vehicle exists and is already enriched - just update price if changed
                if (price > 0 && price !== enrichmentStatus.currentPrice) {
                  await updateVehiclePriceOnly(enrichmentStatus.id, price);
                  logInfo('[Robust Scraper] Price-only update for enriched vehicle', { 
                    service: 'scraper', method: 'zenrows', vin, 
                    oldPrice: enrichmentStatus.currentPrice, newPrice: price 
                  });
                  totalUpdated++;
                } else {
                  logInfo('[Robust Scraper] Skipped VDP parsing - vehicle already enriched, price unchanged', { 
                    service: 'scraper', method: 'zenrows', vin, year, make, model 
                  });
                }
                totalImported++;
                continue; // Skip full VDP parsing
              }
            }
            
            // Full price extraction for new/unenriched vehicles
            price = 0;
            // Try different price patterns in order of preference
            const pricePatterns = [
              // Hidden input with vdp-price (Olympic Hyundai specific)
              /name="vdp-price"\s*value="\$\s*([\d,]+)"/i,
              /value="\$\s*([\d,]+)"\s*name="vdp-price"/i,
              // Meta description pattern: "for only $22,888 CAD"
              /for\s+only\s+\$\s*([\d,]+)/i,
              // Cash price pattern
              /cash\s*price[:\s]*\$\s*([\d,]+)/i,
              // Sale price pattern  
              /sale\s*price[:\s]*\$\s*([\d,]+)/i,
              // Our price pattern
              /our\s*price[:\s]*\$\s*([\d,]+)/i,
              // Internet price pattern
              /internet\s*price[:\s]*\$\s*([\d,]+)/i,
              // Price in a price class element
              /class="[^"]*price[^"]*"[^>]*>\s*\$\s*([\d,]+)/i,
              // Generic dollar amount (fallback) - look for prices in typical range
              /\$\s*([\d,]+)/,
            ];
            
            for (const pattern of pricePatterns) {
              const match = vdpResult.html.match(pattern);
              if (match) {
                const extractedPrice = parseInt(match[1].replace(/,/g, ''));
                // Validate price is in a reasonable vehicle price range
                if (extractedPrice >= 5000 && extractedPrice <= 500000) {
                  price = extractedPrice;
                  break;
                }
              }
            }
            
            // Extract images - look for autotradercdn.ca photo URLs (used by Olympic Hyundai)
            const olympicImages = extractOlympicImagesFromCheerio(v$, vdpResult.html);
            const images = olympicImages.length > 0 ? olympicImages : extractGenericImagesFromCheerio(v$, vdpUrl);

            if (isOlympicHyundaiDomain(sourceHostname)) {
              olympicProcessed++;
              if (olympicImages.length === 0) olympicZeroImageCount++;
            }

            // Try to extract odometer - prioritize hidden input fields
            let odometer = 0;
            const odometerPatterns = [
              // Hidden input with vdp-odometer (Olympic Hyundai specific) - MOST RELIABLE
              /name="vdp-odometer"\s*value="(\d+)"/i,
              /value="(\d+)"\s*name="vdp-odometer"/i,
              // Structured data odometer value
              /odometer[^}]*value["\s:]+(\d+)/i,
              // Explicit odometer labels
              /odometer[:\s]+(\d{1,3}(?:,\d{3})*)/i,
              /kilometres?[:\s]+(\d{1,3}(?:,\d{3})*)/i,
              /mileage[:\s]+(\d{1,3}(?:,\d{3})*)/i,
              // XX,XXX KM pattern (avoid fuel economy like L/100Km)
              />\s*(\d{1,3}(?:,\d{3})+)\s*km\s*</i,
            ];
            for (const pattern of odometerPatterns) {
              const match = vdpResult.html.match(pattern);
              if (match) {
                const value = parseInt(match[1].replace(/,/g, ''));
                // Validate: should be reasonable mileage (0 to 500,000 km)
                if (value >= 0 && value <= 500000) {
                  odometer = value;
                  break;
                }
              }
            }

            // Extract badges from page content - look for badge elements and text patterns
            const pageText = vdpResult.html.toLowerCase();
            const badges: string[] = [];
            
            // Look for badge-like HTML elements (spans, divs with badge/tag/label classes)
            const badgeElementMatches = vdpResult.html.match(/<(?:span|div|a)[^>]*class="[^"]*(?:badge|tag|label|pill|chip)[^"]*"[^>]*>([^<]+)<\/(?:span|div|a)>/gi) || [];
            for (const badgeMatch of badgeElementMatches) {
              const textMatch = badgeMatch.match(/>([^<]+)</);
              if (textMatch) {
                const badgeText = textMatch[1].trim();
                if (badgeText && badgeText.length < 30) {
                  // Normalize common badge texts
                  const normalized = badgeText.toLowerCase();
                  if (/no\s*accident|accident\s*free/.test(normalized) && !badges.includes('No Accidents')) {
                    badges.push('No Accidents');
                  } else if (/one\s*owner|1\s*owner|single\s*owner/.test(normalized) && !badges.includes('One Owner')) {
                    badges.push('One Owner');
                  } else if (/certified|cpo|pre-owned/.test(normalized) && !badges.includes('Certified Pre-Owned')) {
                    badges.push('Certified Pre-Owned');
                  } else if (/low\s*km|low\s*kilo|low\s*mileage/.test(normalized) && !badges.includes('Low Kilometers')) {
                    badges.push('Low Kilometers');
                  } else if (/clean\s*title|clear\s*title/.test(normalized) && !badges.includes('Clean Title')) {
                    badges.push('Clean Title');
                  }
                }
              }
            }
            
            // REMOVED: Text-based pattern matching fallback was causing false positives
            // by matching boilerplate text on dealer sites (e.g. "We check for accidents")
            // Only trust Carfax CDN SVG badges as authoritative source for history badges

            // Determine body type using model-based inference (more reliable than page text)
            const bodyType = inferBodyStyleFromModel(make, model);

            // Extract vehicle details for Facebook Marketplace form
            const colors = extractColors(vdpResult.html);
            const transmission = extractTransmission(vdpResult.html);
            const drivetrain = extractDrivetrain(vdpResult.html);
            const fuelType = extractFuelType(vdpResult.html, make, model);

            // Upsert vehicle
            if (year && make && model) {
              // Get dealership info for accurate location
              const dealershipInfo = dealershipMap.get(source.dealershipId);
              const location = dealershipInfo?.city || 'Vancouver';
              const dealershipName = dealershipInfo?.name || source.sourceName;

              // Extract VDP description and tech specs from the HTML we already have
              const vdpContent = extractVdpContent(vdpResult.html);
              if (vdpContent.vdpDescription) {
                logInfo('[Robust Scraper] VDP description extracted (ZenRows)', { service: 'scraper', method: 'zenrows', year, make, model, descLength: vdpContent.vdpDescription.length });
              }
              if (vdpContent.techSpecs) {
                logInfo('[Robust Scraper] Tech specs extracted (ZenRows)', { service: 'scraper', method: 'zenrows', year, make, model });
              }

              const vehicle: ScrapedVehicle = {
                year,
                make,
                model,
                trim,
                highlights: vehicleHighlights || undefined,
                type: bodyType,
                price: price || null,
                odometer: odometer || null,
                images: images.slice(0, 25),
                badges: validateCPOBadge(badges, make, year, odometer),
                location,
                dealership: dealershipName,
                dealershipId: source.dealershipId,
                description: '',
                vin: vin || `ZENROWS-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                dealerVdpUrl: vdpUrl,
                vdpDescription: vdpContent.vdpDescription,
                techSpecs: vdpContent.techSpecs,
                carfaxUrl: vdpContent.carfaxUrl || undefined,
                carfaxBadges: vdpContent.carfaxBadges.length > 0 ? vdpContent.carfaxBadges : undefined,
                stockNumber: vdpContent.stockNumber || undefined,
                // Vehicle details for Facebook Marketplace
                exteriorColour: colors.exterior,
                interiorColour: colors.interior,
                transmission,
                drivetrain,
                fuelType,
              };

              // Log Carfax data extraction
              if (vdpContent.carfaxUrl || vdpContent.carfaxBadges.length > 0) {
                logInfo('[Robust Scraper] Carfax data extracted (ZenRows)', { 
                  service: 'scraper', method: 'zenrows', year, make, model, 
                  hasCarfaxUrl: !!vdpContent.carfaxUrl,
                  carfaxBadges: vdpContent.carfaxBadges 
                });
              }

              // VALIDATION GATE: Reject vehicles with bad data
              const validationResult = validateVehicleData(vehicle);
              if (!validationResult.isValid) {
                logValidationFailure(vehicle, validationResult);
                totalRejected++;
                continue; // Skip this vehicle - do not save bad data
              }
              if (validationResult.warnings.length > 0) {
                validationResult.warnings.forEach(w => logWarn(`[Robust Scraper] Validation warning for ${year} ${make} ${model}: ${w}`, { service: 'scraper', method: 'zenrows' }));
              }

              const upsertResult = await upsertVehicleByVin(vehicle);
              totalImported++;
              foundVdpUrls.add(vdpUrl); // Track this VDP URL as found
              if (upsertResult.action === 'inserted') {
                totalInserted++;
              } else {
                totalUpdated++;
              }
              logInfo('[Robust Scraper] ZenRows imported vehicle', { service: 'scraper', method: 'zenrows', year, make, model, vin: vehicle.vin, action: upsertResult.action });
              
              // CLEANUP: Delete any PENDING placeholder records with the same VDP URL
              // This ensures we don't have duplicates when a vehicle is successfully scraped
              const deletedPending = await db.delete(vehicles)
                .where(and(
                  eq(vehicles.dealershipId, source.dealershipId),
                  eq(vehicles.dealerVdpUrl, vdpUrl),
                  like(vehicles.vin, 'PENDING-%')
                ))
                .returning({ id: vehicles.id });
              
              if (deletedPending.length > 0) {
                logInfo('[Robust Scraper] Cleaned up PENDING placeholder(s) for enriched vehicle', { 
                  service: 'scraper', method: 'zenrows', vin: vehicle.vin, deletedCount: deletedPending.length 
                });
              }
            }
          } catch (vdpError) {
            logWarn('[Robust Scraper] ZenRows VDP error', { service: 'scraper', method: 'zenrows', vdpUrl, error: vdpError instanceof Error ? vdpError.message : String(vdpError) });
          }
        }
      } catch (sourceError) {
        logError('[Robust Scraper] ZenRows source error', sourceError instanceof Error ? sourceError : new Error(String(sourceError)), { service: 'scraper', method: 'zenrows', sourceName: source.sourceName });
      }
    }

    // RETRY BLOCKED VDPs with longer delays and alternative provider (Zyte)
    if (blockedVdpUrls.length > 0) {
      logInfo('[Robust Scraper] Retrying blocked VDPs with 30-second delays using Zyte', { 
        service: 'scraper', 
        method: 'zenrows-retry', 
        blockedCount: blockedVdpUrls.length,
        blockedUrls: blockedVdpUrls.map(b => b.url)
      });
      
      for (const blocked of blockedVdpUrls) {
        try {
          // Add to foundVdpUrls immediately so vehicle doesn't get deleted (we know it exists on site)
          foundVdpUrls.add(blocked.url);
          
          await sleep(30000); // Wait 30 seconds between retry attempts
          
          logInfo('[Robust Scraper] Retrying blocked VDP via Zyte', { service: 'scraper', method: 'zyte-retry', vdpUrl: blocked.url });
          
          // Try Zyte API for retry (different provider than ZenRows/ScrapingBee)
          let retryHtml: string | null = null;
          const zyteResult = await zenrowsService.zyteScrape(blocked.url);
          
          if (zyteResult.success && zyteResult.html && !isCloudflareBlockPage(zyteResult.html)) {
            retryHtml = zyteResult.html;
            logInfo('[Robust Scraper] Zyte retry succeeded', { service: 'scraper', method: 'zyte-retry', vdpUrl: blocked.url });
          } else {
            // Try ZenRows again as last resort with extra delay
            await sleep(15000);
            const zenrowsRetry = await zenrowsService.zenRowsScrape(blocked.url);
            
            if (zenrowsRetry.success && zenrowsRetry.html && !isCloudflareBlockPage(zenrowsRetry.html)) {
              retryHtml = zenrowsRetry.html;
              logInfo('[Robust Scraper] ZenRows retry succeeded', { service: 'scraper', method: 'zenrows-retry', vdpUrl: blocked.url });
            }
          }
          
          if (!retryHtml) {
            logWarn('[Robust Scraper] All retries failed for blocked VDP, keeping existing data', { service: 'scraper', method: 'zenrows-retry', vdpUrl: blocked.url });
            continue;
          }
          
          // Parse VDP to extract vehicle data
          const v$ = cheerio.load(retryHtml);
          
          // Extract year, make, model from URL
          const urlMatch = blocked.url.match(/\/vehicles\/(\d{4})\/([a-z-]+)\/([a-z0-9-]+)/i);
          if (!urlMatch) continue;
          
          const year = parseInt(urlMatch[1]);
          const make = urlMatch[2].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const model = urlMatch[3].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          
          // Extract VIN
          let vin = '';
          v$('*').each((_, el) => {
            if (vin) return;
            const text = v$(el).text() || '';
            const vinMatch = text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
            if (vinMatch) vin = vinMatch[1].toUpperCase();
          });
          
          if (!vin) {
            logWarn('[Robust Scraper] No VIN found for retried VDP, skipping', { service: 'scraper', method: 'zenrows-retry', vdpUrl: blocked.url });
            continue;
          }
          
          // Extract price
          let price: number | null = null;
          const priceInput = v$('input[name="vdp-price"]').val() || v$('input.vdp-price').val();
          if (priceInput) {
            const priceNum = parseInt(String(priceInput).replace(/[^0-9]/g, ''));
            if (priceNum > 0) price = priceNum;
          }
          if (!price) {
            v$('*').each((_, el) => {
              if (price) return;
              const text = v$(el).text() || '';
              const match = text.match(/\$\s*([0-9,]+)/);
              if (match) {
                const parsed = parseInt(match[1].replace(/,/g, ''));
                if (parsed >= 5000 && parsed <= 500000) {
                  price = parsed;
                }
              }
            });
          }
          
          // Extract odometer
          let odometer: number | null = null;
          const odomInput = v$('input[name="vdp-odometer"]').val() || v$('input.vdp-odometer').val();
          if (odomInput) {
            const odomNum = parseInt(String(odomInput).replace(/[^0-9]/g, ''));
            if (odomNum > 0) odometer = odomNum;
          }
          
          // Extract images
          const imageUrls: string[] = [];
          v$('img').each((_, img) => {
            const src = v$(img).attr('src') || v$(img).attr('data-src') || '';
            if (src && !isBlockedImage(src) && (src.includes('/vehicles/') || src.includes('autotrader') || src.includes('vauto'))) {
              const normalized = normalizeAutoTraderPhotoUrl(src);
              if (!imageUrls.includes(normalized)) {
                imageUrls.push(normalized);
              }
            }
          });
          
          // Validate data
          const validation = validateVehicleData({ year, make, model, price, odometer, images: imageUrls });
          if (!validation.isValid) {
            logWarn('[Robust Scraper] Retried vehicle failed validation', { 
              service: 'scraper', 
              method: 'zenrows-retry', 
              vdpUrl: blocked.url, 
              errors: validation.errors 
            });
            totalRejected++;
            continue;
          }
          
          // Build location from dealership
          let location = 'Vancouver, BC';
          if (blocked.dealership) {
            location = `${blocked.dealership.city || 'Vancouver'}, ${blocked.dealership.province || 'BC'}`;
          }
          
          // Infer fuel type from model name
          const modelLower = model.toLowerCase();
          let fuelType = 'Gas';
          if (modelLower.includes('electric') || modelLower.includes('ev') || modelLower.includes('ioniq 5') || modelLower.includes('ioniq 6') || modelLower.includes('kona electric')) {
            fuelType = 'Electric';
          } else if (modelLower.includes('hybrid') || modelLower.includes('phev')) {
            fuelType = 'Hybrid';
          }
          
          // Upsert vehicle - ScrapedVehicle requires dealershipId in the object
          const result = await upsertVehicleByVin({
            vin,
            year,
            make,
            model,
            trim: '',
            type: inferBodyStyleFromModel(make, model),
            price,
            odometer,
            images: imageUrls,
            badges: [],
            location,
            dealership: blocked.dealership?.name || 'Olympic Hyundai Vancouver',
            dealershipId: blocked.dealershipId,
            description: '',
            dealerVdpUrl: blocked.url,
          });
          
          if (result) {
            totalImported++;
            if (result.action === 'inserted') totalInserted++;
            else if (result.action === 'updated') totalUpdated++;
            
            logInfo('[Robust Scraper] Retry imported vehicle', { 
              service: 'scraper', 
              method: 'zenrows-retry', 
              year, make, model, vin, 
              action: result.action 
            });
          }
        } catch (retryError) {
          logError('[Robust Scraper] Error retrying blocked VDP', retryError instanceof Error ? retryError : new Error(String(retryError)), { vdpUrl: blocked.url });
        }
      }
    }

    // Check for stale vehicles that may no longer be on the website
    // SAFETY: Only consider deletion if we scraped at least 15 vehicles to avoid
    // accidentally deleting inventory due to partial scrape failures
    let totalDeleted = 0;
    const olympicZeroRatio = olympicProcessed > 0 ? olympicZeroImageCount / olympicProcessed : 0;
    const olympicImageQualityOk = olympicProcessed < 10 || olympicZeroRatio <= 0.3;

    if (!olympicImageQualityOk) {
      logWarn('[Robust Scraper] ZenRows scrape produced too many 0-image Olympic vehicles; triggering fallback', {
        service: 'scraper',
        method: 'zenrows',
        olympicProcessed,
        olympicZeroImageCount,
        olympicZeroRatio,
      });
      return {
        success: false,
        vehiclesImported: totalImported,
        vehiclesInserted: totalInserted,
        vehiclesUpdated: totalUpdated,
        vehiclesDeleted: 0,
        vehiclesRejected: totalRejected,
        error: `Olympic image extraction degraded: ${olympicZeroImageCount}/${olympicProcessed} vehicles missing images`,
      };
    }

    // SAFE STALE VEHICLE HANDLING: Use missed_scrape_count instead of immediate deletion
    // - Vehicles found in scrape: reset missed_scrape_count to 0
    // - Vehicles NOT found in scrape: increment missed_scrape_count
    // - Only delete after 3 consecutive misses AND if scrape found minimum vehicles
    const MINIMUM_VEHICLES_FOR_STALE_CHECK = 15;
    const CONSECUTIVE_MISSES_FOR_DELETION = 3;
    
    if (totalImported >= MINIMUM_VEHICLES_FOR_STALE_CHECK && foundVdpUrls.size > 0) {
      const dealershipIds = sources.map(s => s.dealershipId);
      const existingVehicles = await db.select({ 
        id: vehicles.id, 
        dealerVdpUrl: vehicles.dealerVdpUrl, 
        year: vehicles.year, 
        make: vehicles.make, 
        model: vehicles.model,
        missedScrapeCount: vehicles.missedScrapeCount 
      })
        .from(vehicles)
        .where(inArray(vehicles.dealershipId, dealershipIds));
      
      // Find vehicles that ARE in the scraped results - reset their missed count
      const foundVehicleIds = existingVehicles
        .filter(v => v.dealerVdpUrl && foundVdpUrls.has(v.dealerVdpUrl))
        .map(v => v.id);
      
      if (foundVehicleIds.length > 0) {
        await db.update(vehicles)
          .set({ missedScrapeCount: 0, lastScrapedAt: new Date() })
          .where(inArray(vehicles.id, foundVehicleIds));
      }
      
      // Find vehicles NOT in scraped results - increment missed count
      const missedVehicles = existingVehicles.filter(v => {
        if (!v.dealerVdpUrl) return false;
        return !foundVdpUrls.has(v.dealerVdpUrl);
      });
      
      for (const missed of missedVehicles) {
        await db.update(vehicles)
          .set({ missedScrapeCount: (missed.missedScrapeCount || 0) + 1 })
          .where(eq(vehicles.id, missed.id));
      }
      
      if (missedVehicles.length > 0) {
        logInfo('[Robust Scraper] ZenRows incremented missed count for vehicles not found', { 
          service: 'scraper', 
          method: 'zenrows', 
          missedCount: missedVehicles.length,
          missedVehicles: missedVehicles.slice(0, 5).map(v => `${v.year} ${v.make} ${v.model} (missed: ${(v.missedScrapeCount || 0) + 1})`)
        });
      }
      
      // Only delete vehicles that have been missed for CONSECUTIVE_MISSES_FOR_DELETION consecutive scrapes
      const vehiclesToDelete = existingVehicles.filter(v => {
        if (!v.dealerVdpUrl) return false;
        if (foundVdpUrls.has(v.dealerVdpUrl)) return false;
        return (v.missedScrapeCount || 0) >= CONSECUTIVE_MISSES_FOR_DELETION - 1; // -1 because we just incremented
      });

      if (vehiclesToDelete.length > 0) {
        const idsToDelete = vehiclesToDelete.map(v => v.id);
        await db.delete(vehicles).where(inArray(vehicles.id, idsToDelete));
        totalDeleted = vehiclesToDelete.length;
        logInfo('[Robust Scraper] ZenRows deleted vehicles missing for 3+ consecutive scrapes', { 
          service: 'scraper', 
          method: 'zenrows', 
          deletedCount: totalDeleted,
          deletedVehicles: vehiclesToDelete.map(v => `${v.year} ${v.make} ${v.model}`)
        });
      }
    } else if (totalImported > 0 && totalImported < MINIMUM_VEHICLES_FOR_STALE_CHECK) {
      logWarn('[Robust Scraper] ZenRows skipping stale check - not enough vehicles scraped', {
        service: 'scraper',
        method: 'zenrows',
        vehiclesImported: totalImported,
        minimumRequired: MINIMUM_VEHICLES_FOR_STALE_CHECK,
      });
    }

    if (totalImported > 0) {
      return { success: true, vehiclesImported: totalImported, vehiclesInserted: totalInserted, vehiclesUpdated: totalUpdated, vehiclesDeleted: totalDeleted, vehiclesRejected: totalRejected };
    }

    return { success: false, vehiclesImported: 0, vehiclesInserted: 0, vehiclesUpdated: 0, vehiclesDeleted: 0, vehiclesRejected: totalRejected, error: 'ZenRows scraped but found no vehicles' };
  } catch (error) {
    return {
      success: false,
      vehiclesImported: 0,
      vehiclesInserted: 0,
      vehiclesUpdated: 0,
      vehiclesDeleted: 0,
      vehiclesRejected: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * ScrapingBee Cloud Scrape (Secondary - Cloudflare Bypass Fallback)
 * 
 * Uses ScrapingBee API with stealth proxies and Canadian geo-targeting 
 * as a fallback when ZenRows fails or reaches usage limits.
 */
async function attemptScrapingBeeScrape(dealershipId?: number): Promise<{
  success: boolean;
  vehiclesImported: number;
  vehiclesInserted: number;
  vehiclesUpdated: number;
  vehiclesDeleted: number;
  vehiclesRejected: number;
  error?: string;
}> {
  try {
    const scrapingBeeService = new BrowserlessUnifiedService();
    
    if (!scrapingBeeService.isScrapingBeeConfigured()) {
      return { success: false, vehiclesImported: 0, vehiclesInserted: 0, vehiclesUpdated: 0, vehiclesDeleted: 0, vehiclesRejected: 0, error: 'ScrapingBee API key not configured' };
    }

    logInfo('[Robust Scraper] ScrapingBee configured. Fetching scrape sources...', { service: 'scraper', method: 'scrapingbee' });

    const sources = dealershipId
      ? await db.select().from(scrapeSources).where(
          and(eq(scrapeSources.dealershipId, dealershipId), eq(scrapeSources.isActive, true))
        )
      : await db.select().from(scrapeSources).where(eq(scrapeSources.isActive, true));

    if (sources.length === 0) {
      return { success: false, vehiclesImported: 0, vehiclesInserted: 0, vehiclesUpdated: 0, vehiclesDeleted: 0, vehiclesRejected: 0, error: 'No active scrape sources configured' };
    }

    // Get all dealership info for accurate location data
    const dealershipList = await db.select().from(dealerships);
    const dealershipMap = new Map(dealershipList.map(d => [d.id, d]));

    let totalImported = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalRejected = 0;
    const foundVdpUrls: Set<string> = new Set(); // Track all VDP URLs found during scrape
    let olympicProcessed = 0;
    let olympicZeroImageCount = 0;

    for (const source of sources) {
      logInfo('[Robust Scraper] ScrapingBee scraping source', { service: 'scraper', method: 'scrapingbee', sourceName: source.sourceName, sourceUrl: source.sourceUrl });
      
      try {
        let sourceHostname = '';
        try {
          sourceHostname = new URL(source.sourceUrl).hostname;
        } catch {
          sourceHostname = '';
        }

        // Scrape the listing page with scroll-to-bottom enabled for lazy-loading
        const listingResult = await scrapingBeeService.scrapingBeeScrape(source.sourceUrl, {
          scrollToBottom: true  // Enable scrolling for lazy-loaded inventory pages
        });
        
        if (!listingResult.success || !listingResult.html) {
          logWarn('[Robust Scraper] ScrapingBee failed to get listing page', { service: 'scraper', method: 'scrapingbee', sourceName: source.sourceName, error: listingResult.error });
          continue;
        }

        // CRITICAL: Detect Cloudflare block pages on listing page
        if (isCloudflareBlockPage(listingResult.html)) {
          logWarn('[Robust Scraper] ScrapingBee received Cloudflare block page on listing page', { service: 'scraper', method: 'scrapingbee', sourceName: source.sourceName });
          continue;
        }

        // Parse listing HTML to extract vehicle URLs
        const $ = cheerio.load(listingResult.html);
        const vehicleUrls: string[] = [];
        
        // Extract vehicle detail page URLs
        $('a[href*="/vehicles/"]').each((_, elem) => {
          const href = $(elem).attr('href');
          if (href && /\/vehicles\/\d{4}\/[a-z-]+\/[a-z0-9-]+/i.test(href)) {
            let fullUrl = href;
            if (href.startsWith('/')) {
              try {
                const urlObj = new URL(source.sourceUrl);
                fullUrl = `${urlObj.origin}${href}`;
              } catch {}
            }
            if (!vehicleUrls.includes(fullUrl)) {
              vehicleUrls.push(fullUrl);
            }
          }
        });

        logInfo('[Robust Scraper] ScrapingBee found vehicle URLs', { service: 'scraper', method: 'scrapingbee', vehicleUrlCount: vehicleUrls.length, sourceName: source.sourceName });

        // Process each VDP (with rate limiting)
        for (const vdpUrl of vehicleUrls) {
          try {
            // OPTIMIZATION: Skip VDP re-scraping if vehicle already has 12+ images (complete data)
            const existingComplete = await db.select({ 
              id: vehicles.id, 
              vin: vehicles.vin, 
              images: vehicles.images,
              price: vehicles.price 
            })
              .from(vehicles)
              .where(and(
                eq(vehicles.dealershipId, source.dealershipId),
                eq(vehicles.dealerVdpUrl, vdpUrl)
              ))
              .limit(1);
            
            if (existingComplete.length > 0 && existingComplete[0].images && existingComplete[0].images.length >= 12) {
              logInfo('[Robust Scraper] Skipping VDP scrape - vehicle has 12+ images (complete)', { 
                service: 'scraper', method: 'scrapingbee', vdpUrl, 
                vehicleId: existingComplete[0].id, 
                imageCount: existingComplete[0].images.length 
              });
              foundVdpUrls.add(vdpUrl); // Mark as found to prevent deletion
              continue; // Skip to next vehicle
            }
            
            await sleep(5000); // Rate limit: 5 seconds between VDP requests to avoid Cloudflare blocks
            
            const vdpResult = await scrapingBeeService.scrapingBeeScrape(vdpUrl);
            
            if (!vdpResult.success || !vdpResult.html) {
              logWarn('[Robust Scraper] ScrapingBee failed to get VDP', { service: 'scraper', method: 'scrapingbee', vdpUrl, error: vdpResult.error });
              continue;
            }

            // CRITICAL: Detect Cloudflare block pages that would produce garbage data
            if (isCloudflareBlockPage(vdpResult.html)) {
              logWarn('[Robust Scraper] ScrapingBee received Cloudflare block page, skipping VDP', { service: 'scraper', method: 'scrapingbee', vdpUrl });
              continue;
            }

            // Parse VDP to extract vehicle data
            const v$ = cheerio.load(vdpResult.html);
            
            // Extract core vehicle info from VDP page
            const titleElement = v$('h1, .vehicle-title, [class*="title"]').first().text().trim();
            const titleMatch = titleElement.match(/(\d{4})\s+([A-Za-z]+)\s+(.+)/);
            
            if (!titleMatch) {
              logWarn('[Robust Scraper] ScrapingBee could not parse vehicle title', { service: 'scraper', method: 'scrapingbee', vdpUrl, title: titleElement });
              continue;
            }

            const year = parseInt(titleMatch[1]);
            const make = titleMatch[2];
            const model = titleMatch[3].split(/\s+(?:AWD|FWD|4WD|RWD|4x4|N Line|Ultimate|Limited|SE|SEL|Essential|Preferred)/i)[0].trim();

            // Extract trim using vdp-trim hidden input (primary) with fallbacks
            let trim = '';
            let sbHighlights = '';

            function sbExtractHighlights(rawTrim: string): string {
              const pipeIndex = rawTrim.indexOf('|');
              if (pipeIndex === -1) return '';
              const afterTrim = rawTrim.substring(pipeIndex + 1).trim();
              const parts = afterTrim.split('|').map((p: string) => p.trim()).filter((p: string) => p.length > 0);
              return parts.join(' | ');
            }
            
            const sbBadgeSuffixes = [
              /\s*\|\s*ONE OWNER.*/i, /\s*\|\s*LOW MILEAGE.*/i, /\s*\|\s*NO ACCIDENTS.*/i,
              /\s*\|\s*CERTIFIED.*/i, /\s*\|\s*BC VEHICLE.*/i, /\s*\|\s*LOCAL.*/i,
              /\s*\|\s*LEATHER.*/i, /\s*\|\s*SUNROOF.*/i, /\s*\|\s*HEATED.*/i,
              /\s*\|\s*NAVIGATION.*/i, /\s*\|\s*CLEAN.*/i, /\s*\|\s*CARFAX.*/i,
            ];
            function sbCleanTrim(raw: string): string {
              let cleaned = raw;
              for (const pat of sbBadgeSuffixes) cleaned = cleaned.replace(pat, '');
              return cleaned.replace(/\s*\|\s*$/g, '').trim();
            }
            const sbTrimInvalid = ['trim', 'n/a', 'na', 'unknown', 'tbd', 'null', 'undefined', 'none', 'base'];
            const sbTrimInvalidPat = ['interior', 'exterior', 'insert', 'color', 'colour', 'used', 'new', 'pre-owned',
              'certified', 'vancouver', 'for sale', 'inventory', 'stock', 'price', 'details', 'overview'];
            function sbIsValidTrim(v: string): boolean {
              const lower = v.toLowerCase();
              if (sbTrimInvalid.includes(lower)) return false;
              if (v.length < 2 || v.length > 60) return false;
              if (sbTrimInvalidPat.some(inv => lower.includes(inv))) return false;
              return true;
            }
            
            const sbVdpTrimMatch = vdpResult.html.match(/name="vdp-trim"\s*value="([^"]+)"/i);
            if (sbVdpTrimMatch && sbVdpTrimMatch[1]) {
              const rawVal = sbVdpTrimMatch[1].trim();
              sbHighlights = sbExtractHighlights(rawVal);
              const cleaned = sbCleanTrim(rawVal);
              if (sbIsValidTrim(cleaned)) trim = cleaned;
            }
            if (!trim) {
              const sbH1Match = vdpResult.html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
              if (sbH1Match) {
                const escRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const makeP = escRegex(make).replace(/\s+/g, '[\\s-]+');
                const modelP = escRegex(model).replace(/\s+/g, '[\\s-]+');
                const tp = new RegExp(`^\\d{4}\\s+${makeP}\\s+${modelP}\\s+(.+)$`, 'i');
                const tm = sbH1Match[1].trim().match(tp);
                if (tm && tm[1]) { const c = sbCleanTrim(tm[1].trim()); if (sbIsValidTrim(c)) trim = c; }
              }
            }
            if (!trim) {
              const ogMatch = vdpResult.html.match(/og:title[^>]*content="([^"]+)"/i);
              if (ogMatch && ogMatch[1]) {
                const escRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const makeP = escRegex(make).replace(/\s+/g, '[\\s-]+');
                const modelP = escRegex(model).replace(/\s+/g, '[\\s-]+');
                const tp = new RegExp(`^\\d{4}\\s+${makeP}\\s+${modelP}\\s+(.+)$`, 'i');
                const tm = ogMatch[1].trim().match(tp);
                if (tm && tm[1]) { const c = sbCleanTrim(tm[1].trim()); if (sbIsValidTrim(c)) trim = c; }
              }
            }

            // Extract cash/sale price - look for specific price labels
            let price: number | null = null;
            const pricePatterns = [
              // Hidden input with vdp-price (Olympic Hyundai specific)
              /name="vdp-price"\s*value="\$\s*([\d,]+)"/i,
              /value="\$\s*([\d,]+)"\s*name="vdp-price"/i,
              // Meta description pattern: "for only $22,888 CAD"
              /for\s+only\s+\$\s*([\d,]+)/i,
              /cash\s*price[:\s]*\$\s*([\d,]+)/i,
              /sale\s*price[:\s]*\$\s*([\d,]+)/i,
              /our\s*price[:\s]*\$\s*([\d,]+)/i,
              /internet\s*price[:\s]*\$\s*([\d,]+)/i,
              /class="[^"]*price[^"]*"[^>]*>\s*\$\s*([\d,]+)/i,
              /\$\s*([\d,]+)/,
            ];
            for (const pattern of pricePatterns) {
              const match = vdpResult.html.match(pattern);
              if (match) {
                const extractedPrice = parseInt(match[1].replace(/,/g, ''));
                if (extractedPrice >= 5000 && extractedPrice <= 500000) {
                  price = extractedPrice;
                  break;
                }
              }
            }

            // Extract odometer - prioritize hidden input fields
            let odometer: number | null = null;
            const pageHtml = vdpResult.html;
            const odometerPatterns = [
              // Hidden input with vdp-odometer (Olympic Hyundai specific) - MOST RELIABLE
              /name="vdp-odometer"\s*value="(\d+)"/i,
              /value="(\d+)"\s*name="vdp-odometer"/i,
              // Structured data odometer value
              /odometer[^}]*value["\s:]+(\d+)/i,
              // Explicit odometer labels
              /odometer[:\s]+(\d{1,3}(?:,\d{3})*)/i,
              /kilometres?[:\s]+(\d{1,3}(?:,\d{3})*)/i,
              /mileage[:\s]+(\d{1,3}(?:,\d{3})*)/i,
              // XX,XXX KM pattern (avoid fuel economy like L/100Km)
              />\s*(\d{1,3}(?:,\d{3})+)\s*km\s*</i,
            ];
            for (const pattern of odometerPatterns) {
              const match = pageHtml.match(pattern);
              if (match) {
                const value = parseInt(match[1].replace(/,/g, ''));
                // Validate: should be reasonable mileage (0 to 500,000 km)
                if (value >= 0 && value <= 500000) {
                  odometer = value;
                  break;
                }
              }
            }
            // Fallback: try DOM elements
            if (odometer === null) {
              v$('[class*="km"], [class*="mileage"], [class*="odometer"]').each((_, elem) => {
                const text = v$(elem).text();
                const kmMatch = text.match(/([\d,]+)\s*km/i);
                if (kmMatch) {
                  const value = parseInt(kmMatch[1].replace(/,/g, ''));
                  if (value >= 0 && value <= 500000) {
                    odometer = value;
                  }
                }
              });
            }

            // Extract VIN
            let vin: string | null = null;
            v$('[class*="vin"], [data-vin], dt:contains("VIN")').each((_, elem) => {
              const text = v$(elem).text();
              const vinMatch = text.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
              if (vinMatch) {
                vin = vinMatch[1].toUpperCase();
              }
            });

            // Also check for VIN in adjacent dd element
            if (!vin) {
              const vinDt = v$('dt:contains("VIN")');
              if (vinDt.length > 0) {
                const vinDd = vinDt.next('dd').text();
                const vinMatch = vinDd.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
                if (vinMatch) {
                  vin = vinMatch[1].toUpperCase();
                }
              }
            }

            const olympicImages = extractOlympicImagesFromCheerio(v$, vdpResult.html);
            const images = olympicImages.length > 0 ? olympicImages : extractGenericImagesFromCheerio(v$, vdpUrl);

            if (isOlympicHyundaiDomain(sourceHostname)) {
              olympicProcessed++;
              if (olympicImages.length === 0) olympicZeroImageCount++;
            }

            // Determine body type using model-based inference (more reliable than page text)
            const bodyType = inferBodyStyleFromModel(make, model);

            // Extract badges and normalize common texts
            const badges: string[] = [];
            v$('[class*="badge"], [class*="tag"], [class*="label"], [class*="pill"]').each((_, elem) => {
              const badgeText = v$(elem).text().trim();
              if (badgeText && badgeText.length < 30) {
                const normalized = badgeText.toLowerCase();
                // Normalize to standard badge names
                if (/no\s*accident|accident\s*free/i.test(normalized) && !badges.includes('No Accidents')) {
                  badges.push('No Accidents');
                } else if (/one\s*owner|1\s*owner|single\s*owner/i.test(normalized) && !badges.includes('One Owner')) {
                  badges.push('One Owner');
                } else if (/certified|cpo|pre-owned/i.test(normalized) && !badges.includes('Certified Pre-Owned')) {
                  badges.push('Certified Pre-Owned');
                } else if (/low\s*km|low\s*kilo|low\s*mileage/i.test(normalized) && !badges.includes('Low Kilometers')) {
                  badges.push('Low Kilometers');
                } else if (/clean\s*title|clear\s*title/i.test(normalized) && !badges.includes('Clean Title')) {
                  badges.push('Clean Title');
                }
              }
            });
            
            // REMOVED: Text-based pattern matching fallback was causing false positives
            // by matching boilerplate text on dealer sites (e.g. "We check for accidents")
            // Only trust Carfax CDN SVG badges as authoritative source for history badges

            // Get dealership location
            const dealershipInfo = dealershipMap.get(source.dealershipId);
            const location = dealershipInfo?.city || 'Vancouver';
            const dealershipName = dealershipInfo?.name || source.sourceName;

            // Extract Carfax data from VDP page
            const scrapingBeeCarfaxBadges = extractCarfaxBadges(vdpResult.html);
            const scrapingBeeCarfaxUrl = extractCarfaxUrl(vdpResult.html);
            
            if (scrapingBeeCarfaxUrl || scrapingBeeCarfaxBadges.length > 0) {
              logInfo('[Robust Scraper] Carfax data extracted (ScrapingBee)', { 
                service: 'scraper', method: 'scrapingbee', year, make, model, 
                hasCarfaxUrl: !!scrapingBeeCarfaxUrl,
                carfaxBadges: scrapingBeeCarfaxBadges 
              });
            }

            // Upsert vehicle
            const vehicle: ScrapedVehicle = {
              year,
              make,
              model,
              trim,
              highlights: sbHighlights || undefined,
              type: bodyType,
              price: price || null,
              odometer: odometer || null,
              images: images.slice(0, 25),
              badges: validateCPOBadge(badges, make, year, odometer),
              location,
              dealership: dealershipName,
              dealershipId: source.dealershipId,
              description: '',
              vin: vin || `SCRAPINGBEE-${Date.now()}-${Math.random().toString(36).substring(7)}`,
              dealerVdpUrl: vdpUrl,
              carfaxUrl: scrapingBeeCarfaxUrl || undefined,
              carfaxBadges: scrapingBeeCarfaxBadges.length > 0 ? scrapingBeeCarfaxBadges : undefined,
            };

            // VALIDATION GATE: Reject vehicles with bad data
            const validationResult = validateVehicleData(vehicle);
            if (!validationResult.isValid) {
              logValidationFailure(vehicle, validationResult);
              totalRejected++;
              continue; // Skip this vehicle - do not save bad data
            }
            if (validationResult.warnings.length > 0) {
              validationResult.warnings.forEach(w => logWarn(`[Robust Scraper] Validation warning for ${year} ${make} ${model}: ${w}`, { service: 'scraper', method: 'scrapingbee' }));
            }

            const upsertResult = await upsertVehicleByVin(vehicle);
            totalImported++;
            foundVdpUrls.add(vdpUrl); // Track this VDP URL as found
            if (upsertResult.action === 'inserted') {
              totalInserted++;
            } else {
              totalUpdated++;
            }
            logInfo('[Robust Scraper] ScrapingBee imported vehicle', { service: 'scraper', method: 'scrapingbee', year, make, model, vin: vehicle.vin, action: upsertResult.action });
            
            // CLEANUP: Delete any PENDING placeholder records with the same VDP URL
            const deletedPending = await db.delete(vehicles)
              .where(and(
                eq(vehicles.dealershipId, source.dealershipId),
                eq(vehicles.dealerVdpUrl, vdpUrl),
                like(vehicles.vin, 'PENDING-%')
              ))
              .returning({ id: vehicles.id });
            
            if (deletedPending.length > 0) {
              logInfo('[Robust Scraper] Cleaned up PENDING placeholder(s) for enriched vehicle', { 
                service: 'scraper', method: 'scrapingbee', vin: vehicle.vin, deletedCount: deletedPending.length 
              });
            }
          } catch (vdpError) {
            const errorUrl = vdpUrl;
            logWarn('[Robust Scraper] ScrapingBee VDP error', { service: 'scraper', method: 'scrapingbee', vdpUrl: errorUrl, error: vdpError instanceof Error ? vdpError.message : String(vdpError) });
          }
        }
      } catch (sourceError) {
        const errorSource = source;
        logError('[Robust Scraper] ScrapingBee source error', sourceError instanceof Error ? sourceError : new Error(String(sourceError)), { service: 'scraper', method: 'scrapingbee', sourceName: errorSource.sourceName });
      }
    }

    // SAFE STALE VEHICLE HANDLING: Use missed_scrape_count instead of immediate deletion
    // - Vehicles found in scrape: reset missed_scrape_count to 0
    // - Vehicles NOT found in scrape: increment missed_scrape_count
    // - Only delete after 3 consecutive misses AND if scrape found minimum vehicles
    let totalDeleted = 0;
    const olympicZeroRatio = olympicProcessed > 0 ? olympicZeroImageCount / olympicProcessed : 0;
    const olympicImageQualityOk = olympicProcessed < 10 || olympicZeroRatio <= 0.3;

    if (!olympicImageQualityOk) {
      logWarn('[Robust Scraper] ScrapingBee scrape produced too many 0-image Olympic vehicles; triggering fallback', {
        service: 'scraper',
        method: 'scrapingbee',
        olympicProcessed,
        olympicZeroImageCount,
        olympicZeroRatio,
      });
      return {
        success: false,
        vehiclesImported: totalImported,
        vehiclesInserted: totalInserted,
        vehiclesUpdated: totalUpdated,
        vehiclesDeleted: 0,
        vehiclesRejected: totalRejected,
        error: `Olympic image extraction degraded: ${olympicZeroImageCount}/${olympicProcessed} vehicles missing images`,
      };
    }

    const MINIMUM_VEHICLES_FOR_STALE_CHECK = 15;
    const CONSECUTIVE_MISSES_FOR_DELETION = 3;
    
    if (totalImported >= MINIMUM_VEHICLES_FOR_STALE_CHECK && foundVdpUrls.size > 0) {
      const dealershipIds = sources.map(s => s.dealershipId);
      const existingVehicles = await db.select({ 
        id: vehicles.id, 
        dealerVdpUrl: vehicles.dealerVdpUrl, 
        year: vehicles.year, 
        make: vehicles.make, 
        model: vehicles.model,
        missedScrapeCount: vehicles.missedScrapeCount 
      })
        .from(vehicles)
        .where(inArray(vehicles.dealershipId, dealershipIds));
      
      // Find vehicles that ARE in the scraped results - reset their missed count
      const foundVehicleIds = existingVehicles
        .filter(v => v.dealerVdpUrl && foundVdpUrls.has(v.dealerVdpUrl))
        .map(v => v.id);
      
      if (foundVehicleIds.length > 0) {
        await db.update(vehicles)
          .set({ missedScrapeCount: 0, lastScrapedAt: new Date() })
          .where(inArray(vehicles.id, foundVehicleIds));
      }
      
      // Find vehicles NOT in scraped results - increment missed count
      const missedVehicles = existingVehicles.filter(v => {
        if (!v.dealerVdpUrl) return false;
        return !foundVdpUrls.has(v.dealerVdpUrl);
      });
      
      for (const missed of missedVehicles) {
        await db.update(vehicles)
          .set({ missedScrapeCount: (missed.missedScrapeCount || 0) + 1 })
          .where(eq(vehicles.id, missed.id));
      }
      
      if (missedVehicles.length > 0) {
        logInfo('[Robust Scraper] ScrapingBee incremented missed count for vehicles not found', { 
          service: 'scraper', 
          method: 'scrapingbee', 
          missedCount: missedVehicles.length,
          missedVehicles: missedVehicles.slice(0, 5).map(v => `${v.year} ${v.make} ${v.model} (missed: ${(v.missedScrapeCount || 0) + 1})`)
        });
      }
      
      // Only delete vehicles that have been missed for CONSECUTIVE_MISSES_FOR_DELETION consecutive scrapes
      const vehiclesToDelete = existingVehicles.filter(v => {
        if (!v.dealerVdpUrl) return false;
        if (foundVdpUrls.has(v.dealerVdpUrl)) return false;
        return (v.missedScrapeCount || 0) >= CONSECUTIVE_MISSES_FOR_DELETION - 1;
      });

      if (vehiclesToDelete.length > 0) {
        const idsToDelete = vehiclesToDelete.map(v => v.id);
        await db.delete(vehicles).where(inArray(vehicles.id, idsToDelete));
        totalDeleted = vehiclesToDelete.length;
        logInfo('[Robust Scraper] ScrapingBee deleted vehicles missing for 3+ consecutive scrapes', { 
          service: 'scraper', 
          method: 'scrapingbee', 
          deletedCount: totalDeleted,
          deletedVehicles: vehiclesToDelete.map(v => `${v.year} ${v.make} ${v.model}`)
        });
      }
    } else if (totalImported > 0 && totalImported < MINIMUM_VEHICLES_FOR_STALE_CHECK) {
      logWarn('[Robust Scraper] ScrapingBee skipping stale check - not enough vehicles scraped', {
        service: 'scraper',
        method: 'scrapingbee',
        vehiclesImported: totalImported,
        minimumRequired: MINIMUM_VEHICLES_FOR_STALE_CHECK,
      });
    }

    if (totalImported > 0) {
      return { success: true, vehiclesImported: totalImported, vehiclesInserted: totalInserted, vehiclesUpdated: totalUpdated, vehiclesDeleted: totalDeleted, vehiclesRejected: totalRejected };
    }

    return { success: false, vehiclesImported: 0, vehiclesInserted: 0, vehiclesUpdated: 0, vehiclesDeleted: 0, vehiclesRejected: totalRejected, error: 'ScrapingBee scraped but found no vehicles' };
  } catch (error) {
    return {
      success: false,
      vehiclesImported: 0,
      vehiclesInserted: 0,
      vehiclesUpdated: 0,
      vehiclesDeleted: 0,
      vehiclesRejected: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function attemptPuppeteerScrape(dealershipId?: number): Promise<{ success: boolean; total: number; error?: string }> {
  try {
    const total = await scrapeAllDealershipsIncremental(dealershipId);
    return { success: true, total };
  } catch (error) {
    return { 
      success: false, 
      total: 0, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * Browserless Cloud Fallback (Secondary - True Puppeteer Replacement)
 * 
 * This fallback uses Browserless.io cloud infrastructure to run the same
 * Puppeteer scraping logic but in their managed cloud environment.
 * This provides a TRUE backup for local Puppeteer failures.
 * 
 * DEGRADED MODE NOTE: The Browserless fallback extracts core vehicle data
 * (year, make, model, price, odometer, images) but may miss some enrichments
 * that the full local scraper provides (VIN from detail pages, full image galleries,
 * Carfax links, trim parsing from headings). This is acceptable as an emergency
 * fallback since it still imports valid inventory data.
 */
async function attemptBrowserlessScrape(dealershipId?: number): Promise<{
  success: boolean;
  vehiclesImported: number;
  error?: string;
}> {
  try {
    const browserlessService = dealershipId
      ? await getBrowserlessServiceForDealership(dealershipId)
      : getGlobalBrowserlessService();

    if (!browserlessService) {
      return { success: false, vehiclesImported: 0, error: 'Browserless service not configured' };
    }

    const connectionTest = await browserlessService.testConnection();
    if (!connectionTest.success) {
      return { success: false, vehiclesImported: 0, error: `Browserless connection failed: ${connectionTest.message}` };
    }

    logInfo('[Robust Scraper] Browserless connected. Fetching scrape sources...', { service: 'scraper', method: 'browserless' });

    const sources = dealershipId
      ? await db.select().from(scrapeSources).where(
          and(eq(scrapeSources.dealershipId, dealershipId), eq(scrapeSources.isActive, true))
        )
      : await db.select().from(scrapeSources).where(eq(scrapeSources.isActive, true));

    if (sources.length === 0) {
      return { success: false, vehiclesImported: 0, error: 'No active scrape sources configured' };
    }

    let totalImported = 0;
    let totalRejected = 0;

    for (const source of sources) {
      logInfo('[Robust Scraper] Browserless scraping source', { service: 'scraper', method: 'browserless', sourceName: source.sourceName, sourceUrl: source.sourceUrl });
      
      try {
        const result = await browserlessService.scrapeInventoryUrl(source.sourceUrl);
        
        if (result.success && result.vehicles.length > 0) {
          logInfo('[Robust Scraper] Browserless found vehicles', { service: 'scraper', method: 'browserless', vehicleCount: result.vehicles.length, sourceName: source.sourceName });
          
          for (const v of result.vehicles) {
            // Extract additional data from cardText if available
            const cardText = v.cardText || '';
            
            // Try to extract trim from the vehicle title/heading
            let trim = '';
            const trimMatch = cardText.match(/(?:^|\s)([A-Z][A-Za-z0-9]+(?:\s+[A-Za-z0-9]+)?)\s*(?:\||$)/);
            if (trimMatch && !['Used', 'New', 'Certified', 'Base'].includes(trimMatch[1])) {
              trim = trimMatch[1].trim();
            }
            
            // Determine body type using model-based inference (more reliable than card text)
            const bodyType = inferBodyStyleFromModel(v.make, v.model);
            
            // Extract badges from card text - ONLY trust specific dealer-displayed badges, not history claims
            // History badges (One Owner, No Accidents) should only come from Carfax CDN SVG URLs
            const badges: string[] = [];
            // These are OK - they're dealer promotional badges, not history claims
            if (/certified|cpo/i.test(cardText)) badges.push('Certified Pre-Owned');
            if (/low km|low kilo/i.test(cardText)) badges.push('Low Kilometers');
            if (/new arrival|just arrived/i.test(cardText)) badges.push('New Arrival');
            // REMOVED: One Owner and No Accidents text matching - too unreliable
            // These should only be extracted from verified Carfax CDN SVG badges
            
            // Try to extract VIN if present
            let vin: string | undefined;
            const vinMatch = cardText.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
            if (vinMatch) vin = vinMatch[1];
            
            // Generate description
            const description = `${v.year} ${v.make} ${v.model} ${trim}`.trim() + 
              (v.odometer ? ` with ${v.odometer.toLocaleString()} km` : '') +
              ` at ${source.sourceName}`;
            
            // Use all images if available, otherwise fall back to primary image
            const images: string[] = v.images && v.images.length > 0 
              ? v.images 
              : (v.primaryImage ? [v.primaryImage] : []);
            
            // Fetch VDP content (description, tech specs, Carfax) from the detail page
            let vdpDescription: string | null = null;
            let techSpecs: string | null = null;
            let carfaxUrl: string | undefined;
            let carfaxBadges: string[] | undefined;
            let vdpStockNumber: string | undefined;
            
            if (v.detailUrl) {
              try {
                logInfo('[Robust Scraper] Fetching VDP content', { service: 'scraper', method: 'vdp', vehicle: `${v.year} ${v.make} ${v.model}`, vdpUrl: v.detailUrl });
                const vdpContent = await fetchVdpContent(v.detailUrl);
                vdpDescription = vdpContent.vdpDescription;
                techSpecs = vdpContent.techSpecs;
                carfaxUrl = vdpContent.carfaxUrl || undefined;
                carfaxBadges = vdpContent.carfaxBadges.length > 0 ? vdpContent.carfaxBadges : undefined;
                vdpStockNumber = vdpContent.stockNumber || undefined;
                if (vdpDescription) {
                  logInfo('[Robust Scraper] VDP description extracted', { service: 'scraper', method: 'vdp', vehicle: `${v.year} ${v.make} ${v.model}`, descLength: vdpDescription.length });
                }
                if (techSpecs) {
                  logInfo('[Robust Scraper] Tech specs extracted', { service: 'scraper', method: 'vdp', vehicle: `${v.year} ${v.make} ${v.model}` });
                }
                if (carfaxUrl || (carfaxBadges && carfaxBadges.length > 0)) {
                  logInfo('[Robust Scraper] Carfax data extracted', { service: 'scraper', method: 'vdp', vehicle: `${v.year} ${v.make} ${v.model}`, hasCarfaxUrl: !!carfaxUrl, carfaxBadges });
                }
                if (vdpStockNumber) {
                  logInfo('[Robust Scraper] Stock number extracted from VDP', { service: 'scraper', method: 'vdp', vehicle: `${v.year} ${v.make} ${v.model}`, stockNumber: vdpStockNumber });
                }
              } catch (vdpError) {
                logWarn('[Robust Scraper] VDP fetch failed, continuing without VDP content', { service: 'scraper', method: 'vdp', vehicle: `${v.year} ${v.make} ${v.model}`, error: vdpError instanceof Error ? vdpError.message : String(vdpError) });
              }
            }
            
            const vehicleData: ScrapedVehicle = {
              year: v.year,
              make: v.make,
              model: v.model,
              trim,
              type: bodyType,
              price: v.price,
              odometer: v.odometer,
              images,
              badges: validateCPOBadge(badges, v.make, v.year, v.odometer),
              location: source.sourceName,
              dealership: source.sourceName,
              dealershipId: source.dealershipId,
              description,
              dealerVdpUrl: v.detailUrl,
              vin,
              stockNumber: v.stockNumber || vdpStockNumber || undefined,
              vdpDescription,
              techSpecs,
              carfaxUrl,
              carfaxBadges,
            };
            
            // VALIDATION GATE: Reject vehicles with bad data
            const validationResult = validateVehicleData(vehicleData);
            if (!validationResult.isValid) {
              logValidationFailure(vehicleData, validationResult);
              totalRejected++;
              continue; // Skip this vehicle - do not save bad data
            }
            if (validationResult.warnings.length > 0) {
              validationResult.warnings.forEach(w => logWarn(`[Robust Scraper] Validation warning for ${v.year} ${v.make} ${v.model}: ${w}`, { service: 'scraper', method: 'browserless' }));
            }
            
            const saved = await upsertVehicleByVin(vehicleData);
            if (saved) totalImported++;
          }
        } else if (!result.success) {
          logWarn('[Robust Scraper] Browserless failed for source', { service: 'scraper', method: 'browserless', sourceName: source.sourceName, error: result.error });
        }
      } catch (sourceError) {
        logWarn('[Robust Scraper] Error scraping source', { service: 'scraper', method: 'browserless', sourceName: source.sourceName, error: sourceError instanceof Error ? sourceError.message : String(sourceError) });
      }
    }

    if (totalImported > 0) {
      return { success: true, vehiclesImported: totalImported };
    }

    return { success: false, vehiclesImported: 0, error: 'Browserless scraped but found no vehicles' };
  } catch (error) {
    return {
      success: false,
      vehiclesImported: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Apify Market Data Refresh (Tertiary Fallback)
 * 
 * ARCHITECTURAL NOTE: The Apify AutoTrader.ca actor searches by make/model/year,
 * NOT by dealership website URL. This means Apify cannot directly substitute for
 * the Puppeteer scraper which scrapes specific dealer inventory pages.
 * 
 * Instead, this fallback:
 * 1. Uses existing inventory from the database
 * 2. Fetches market pricing data from AutoTrader.ca via Apify
 * 3. Updates lastScrapedAt to indicate the data was verified against market
 * 
 * This provides value by confirming existing inventory against market data,
 * but cannot discover NEW vehicles that Puppeteer would have found.
 */
async function attemptApifyMarketDataRefresh(dealershipId?: number): Promise<{ 
  success: boolean; 
  vehiclesUpdated: number; 
  error?: string 
}> {
  try {
    const apifyService = dealershipId 
      ? await getApifyServiceForDealership(dealershipId)
      : getGlobalApifyService();
    
    if (!apifyService) {
      return { success: false, vehiclesUpdated: 0, error: 'Apify service not configured' };
    }

    const connectionTest = await apifyService.testConnection();
    if (!connectionTest.success) {
      return { success: false, vehiclesUpdated: 0, error: `Apify connection failed: ${connectionTest.message}` };
    }

    logInfo('[Robust Scraper] Apify connected. Attempting market data refresh for existing inventory...', { service: 'scraper', method: 'apify' });
    logInfo('[Robust Scraper] NOTE: Apify searches AutoTrader.ca by make/model, cannot discover new dealer inventory.', { service: 'scraper', method: 'apify' });
    
    const existingVehicles = dealershipId 
      ? await db.select().from(vehicles).where(eq(vehicles.dealershipId, dealershipId)).limit(50)
      : await db.select().from(vehicles).limit(50);

    if (existingVehicles.length === 0) {
      return { success: false, vehiclesUpdated: 0, error: 'No existing inventory to refresh' };
    }

    let updatedCount = 0;
    const uniqueMakeModels = new Map<string, Vehicle[]>();
    
    for (const vehicle of existingVehicles) {
      const key = `${vehicle.make}|${vehicle.model}|${vehicle.year}`;
      if (!uniqueMakeModels.has(key)) {
        uniqueMakeModels.set(key, []);
      }
      uniqueMakeModels.get(key)!.push(vehicle);
    }

    for (const [key, vehicleGroup] of uniqueMakeModels) {
      const [make, model, yearStr] = key.split('|');
      const year = parseInt(yearStr);
      
      if (!make || !model || isNaN(year)) continue;

      try {
        const marketData = await apifyService.getMarketPricing({
          make,
          model,
          yearMin: year,
          yearMax: year,
          maxResults: 20
        });

        if (marketData.stats.count > 0) {
          for (const vehicle of vehicleGroup) {
            await db.update(vehicles)
              .set({ 
                lastScrapedAt: new Date(),
              })
              .where(eq(vehicles.id, vehicle.id));
            updatedCount++;
          }
          logInfo('[Robust Scraper] Refreshed vehicles with market data', { service: 'scraper', method: 'apify', vehicleCount: vehicleGroup.length, year, make, model });
        }
      } catch (err) {
        logWarn('[Robust Scraper] Failed to get market data', { service: 'scraper', method: 'apify', year, make, model, error: err instanceof Error ? err.message : String(err) });
      }
    }

    if (updatedCount > 0) {
      return { success: true, vehiclesUpdated: updatedCount, error: undefined };
    }
    
    return { success: false, vehiclesUpdated: 0, error: 'No vehicles could be refreshed from market data' };
  } catch (error) {
    return { 
      success: false, 
      vehiclesUpdated: 0, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

async function preserveExistingInventory(dealershipId?: number): Promise<{ 
  vehiclesPreserved: number; 
  error?: string 
}> {
  try {
    const existingVehicles = dealershipId 
      ? await db.select().from(vehicles).where(eq(vehicles.dealershipId, dealershipId))
      : await db.select().from(vehicles);

    logInfo('[Robust Scraper] Cache preserve mode: Keeping existing vehicles', { service: 'scraper', method: 'cache_preserve', vehicleCount: existingVehicles.length });
    
    return { vehiclesPreserved: existingVehicles.length };
  } catch (error) {
    return { 
      vehiclesPreserved: 0, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

/**
 * Batch update Carfax data for all vehicles with VDP URLs
 * Only updates carfaxUrl and carfaxBadges fields - preserves all other data
 */
export async function batchUpdateCarfaxData(dealershipId: number): Promise<{
  success: boolean;
  processed: number;
  updated: number;
  skipped: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let processed = 0;
  let updated = 0;
  let skipped = 0;

  try {
    // Get all vehicles with VDP URLs for this dealership
    const vehicleRecords = await db.select({
      id: vehicles.id,
      year: vehicles.year,
      make: vehicles.make,
      model: vehicles.model,
      dealerVdpUrl: vehicles.dealerVdpUrl,
      carfaxUrl: vehicles.carfaxUrl,
      carfaxBadges: vehicles.carfaxBadges,
    })
    .from(vehicles)
    .where(eq(vehicles.dealershipId, dealershipId));

    const vehiclesWithVdp = vehicleRecords.filter(v => v.dealerVdpUrl);
    logInfo(`[Batch Carfax] Starting batch update for ${vehiclesWithVdp.length} vehicles`, { 
      dealershipId, 
      totalVehicles: vehicleRecords.length,
      vehiclesWithVdp: vehiclesWithVdp.length 
    });

    for (const vehicle of vehiclesWithVdp) {
      processed++;
      
      try {
        logInfo(`[Batch Carfax] Processing ${processed}/${vehiclesWithVdp.length}: ${vehicle.year} ${vehicle.make} ${vehicle.model}`, {
          vehicleId: vehicle.id,
          vdpUrl: vehicle.dealerVdpUrl
        });

        // Fetch VDP content and extract Carfax data
        const vdpContent = await fetchVdpContent(vehicle.dealerVdpUrl!);
        
        // Only update if we got new Carfax data
        const hasNewCarfaxUrl = vdpContent.carfaxUrl && !vehicle.carfaxUrl;
        const hasNewCarfaxBadges = vdpContent.carfaxBadges.length > 0 && (!vehicle.carfaxBadges || vehicle.carfaxBadges.length === 0);
        
        if (hasNewCarfaxUrl || hasNewCarfaxBadges) {
          const updateData: any = {};
          
          if (vdpContent.carfaxUrl) {
            updateData.carfaxUrl = vdpContent.carfaxUrl;
          }
          if (vdpContent.carfaxBadges.length > 0) {
            updateData.carfaxBadges = vdpContent.carfaxBadges;
          }
          
          await db.update(vehicles)
            .set(updateData)
            .where(eq(vehicles.id, vehicle.id));
          
          updated++;
          logInfo(`[Batch Carfax] Updated vehicle ${vehicle.id}`, {
            vehicleId: vehicle.id,
            carfaxUrl: vdpContent.carfaxUrl ? 'found' : 'none',
            carfaxBadges: vdpContent.carfaxBadges
          });
        } else {
          skipped++;
          logInfo(`[Batch Carfax] Skipped vehicle ${vehicle.id} - no new Carfax data`, {
            vehicleId: vehicle.id,
            existingCarfaxUrl: !!vehicle.carfaxUrl,
            existingCarfaxBadges: vehicle.carfaxBadges?.length || 0
          });
        }

        // Small delay to avoid overwhelming the scraping APIs
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (vehicleError) {
        const errorMsg = `Vehicle ${vehicle.id} (${vehicle.year} ${vehicle.make} ${vehicle.model}): ${vehicleError instanceof Error ? vehicleError.message : String(vehicleError)}`;
        errors.push(errorMsg);
        logWarn(`[Batch Carfax] Error processing vehicle`, { 
          vehicleId: vehicle.id, 
          error: vehicleError instanceof Error ? vehicleError.message : String(vehicleError) 
        });
      }
    }

    logInfo(`[Batch Carfax] Completed batch update`, {
      dealershipId,
      processed,
      updated,
      skipped,
      errors: errors.length
    });

    return { success: true, processed, updated, skipped, errors };
  } catch (error) {
    logError('[Batch Carfax] Failed to run batch update', error instanceof Error ? error : new Error(String(error)), {
      dealershipId
    });
    return { 
      success: false, 
      processed, 
      updated, 
      skipped, 
      errors: [error instanceof Error ? error.message : String(error)] 
    };
  }
}

export async function runRobustScrape(
  triggeredBy: 'scheduler' | 'manual' | 'webhook' = 'scheduler',
  dealershipId?: number
): Promise<ScrapeResult> {
  const startTime = Date.now();
  let retryCount = 0;
  let lastError = '';
  let zenrowsError = '';
  let method: 'zenrows' | 'scrapingbee' | 'puppeteer' | 'browserless' | 'apify' | 'cache_preserve' = 'zenrows';
  let scrapingBeeError = '';

  const runData: InsertScrapeRun = {
    dealershipId: dealershipId || null,
    scrapeType: 'incremental',
    scrapeMethod: 'zenrows',
    status: 'running',
    triggeredBy,
  };

  const run = await storage.createScrapeRun(runData);
  logInfo('[Robust Scraper] Started scrape run', { service: 'scraper', runId: run.id, triggeredBy });

  // ===== TIER 1: ZenRows API (Cloudflare Bypass - Primary) =====
  logInfo('[Robust Scraper] Attempting ZenRows scrape (Cloudflare bypass)...', { service: 'scraper', method: 'zenrows' });
  
  const zenrowsResult = await attemptZenRowsScrape(dealershipId);
  
  if (zenrowsResult.success) {
    method = 'zenrows';
    const duration = Date.now() - startTime;
    await storage.updateScrapeRun(run.id, {
      status: 'success',
      scrapeMethod: 'zenrows',
      vehiclesFound: zenrowsResult.vehiclesImported,
      vehiclesInserted: zenrowsResult.vehiclesInserted,
      vehiclesUpdated: zenrowsResult.vehiclesUpdated,
      durationMs: duration,
      retryCount: 0,
      completedAt: new Date(),
    });
    
    logInfo('[Robust Scraper] ZenRows scrape succeeded', { 
      service: 'scraper', 
      method: 'zenrows', 
      vehiclesImported: zenrowsResult.vehiclesImported,
      vehiclesInserted: zenrowsResult.vehiclesInserted,
      vehiclesUpdated: zenrowsResult.vehiclesUpdated,
      vehiclesDeleted: zenrowsResult.vehiclesDeleted,
    });
    
    return {
      success: true,
      vehiclesFound: zenrowsResult.vehiclesImported,
      vehiclesInserted: zenrowsResult.vehiclesInserted,
      vehiclesUpdated: zenrowsResult.vehiclesUpdated,
      vehiclesDeleted: zenrowsResult.vehiclesDeleted,
      vehiclesRejected: zenrowsResult.vehiclesRejected,
      method: 'zenrows',
      retryCount: 0,
    };
  }

  zenrowsError = zenrowsResult.error || 'Unknown ZenRows error';
  logWarn('[Robust Scraper] ZenRows failed, falling back to ScrapingBee...', { service: 'scraper', method: 'zenrows', error: zenrowsError });

  // ===== TIER 2: ScrapingBee API (Cloudflare Bypass - Secondary) =====
  logInfo('[Robust Scraper] Attempting ScrapingBee scrape (Cloudflare bypass)...', { service: 'scraper', method: 'scrapingbee' });
  
  const scrapingBeeResult = await attemptScrapingBeeScrape(dealershipId);
  
  if (scrapingBeeResult.success) {
    method = 'scrapingbee';
    const duration = Date.now() - startTime;
    await storage.updateScrapeRun(run.id, {
      status: 'success',
      scrapeMethod: 'scrapingbee',
      vehiclesFound: scrapingBeeResult.vehiclesImported,
      vehiclesInserted: scrapingBeeResult.vehiclesInserted,
      vehiclesUpdated: scrapingBeeResult.vehiclesUpdated,
      durationMs: duration,
      retryCount: 0,
      completedAt: new Date(),
    });
    
    logInfo('[Robust Scraper] ScrapingBee scrape succeeded', { 
      service: 'scraper', 
      method: 'scrapingbee', 
      vehiclesImported: scrapingBeeResult.vehiclesImported,
      vehiclesInserted: scrapingBeeResult.vehiclesInserted,
      vehiclesUpdated: scrapingBeeResult.vehiclesUpdated,
      vehiclesDeleted: scrapingBeeResult.vehiclesDeleted,
    });
    
    return {
      success: true,
      vehiclesFound: scrapingBeeResult.vehiclesImported,
      vehiclesInserted: scrapingBeeResult.vehiclesInserted,
      vehiclesUpdated: scrapingBeeResult.vehiclesUpdated,
      vehiclesDeleted: scrapingBeeResult.vehiclesDeleted,
      vehiclesRejected: scrapingBeeResult.vehiclesRejected,
      method: 'scrapingbee',
      retryCount: 0,
    };
  }

  scrapingBeeError = scrapingBeeResult.error || 'Unknown ScrapingBee error';
  logWarn('[Robust Scraper] ScrapingBee failed, falling back to Puppeteer...', { service: 'scraper', method: 'scrapingbee', error: scrapingBeeError });

  // ===== TIER 3: Local Puppeteer with retries =====
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    logInfo('[Robust Scraper] Attempting Puppeteer scrape', { service: 'scraper', method: 'puppeteer', attempt, maxRetries: MAX_RETRIES });
    
    const result = await attemptPuppeteerScrape(dealershipId);
    
    if (result.success) {
      const duration = Date.now() - startTime;
      await storage.updateScrapeRun(run.id, {
        status: 'success',
        scrapeMethod: 'puppeteer',
        vehiclesFound: result.total,
        durationMs: duration,
        retryCount,
        completedAt: new Date(),
      });
      
      logInfo('[Robust Scraper] Puppeteer scrape succeeded', { service: 'scraper', method: 'puppeteer', attempt, vehicleCount: result.total });
      
      return {
        success: true,
        vehiclesFound: result.total,
        vehiclesInserted: 0,
        vehiclesUpdated: 0,
        vehiclesDeleted: 0,
        vehiclesRejected: 0,
        method: 'puppeteer',
        retryCount,
      };
    }

    lastError = result.error || 'Unknown error';
    retryCount++;
    logError('[Robust Scraper] Puppeteer attempt failed', new Error(lastError), { service: 'scraper', method: 'puppeteer', attempt });

    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAYS[attempt - 1] || 30000;
      logInfo('[Robust Scraper] Retrying after delay', { service: 'scraper', method: 'puppeteer', delaySeconds: delay / 1000 });
      await sleep(delay);
    }
  }

  // ===== TIER 4: Browserless Cloud Puppeteer (FALLBACK) =====
  logInfo('[Robust Scraper] All local Puppeteer attempts failed. Trying Browserless cloud fallback...', { service: 'scraper', method: 'browserless' });
  
  const browserlessResult = await attemptBrowserlessScrape(dealershipId);
  
  if (browserlessResult.success) {
    method = 'browserless';
    const duration = Date.now() - startTime;
    await storage.updateScrapeRun(run.id, {
      status: 'success',
      scrapeMethod: 'browserless',
      vehiclesFound: browserlessResult.vehiclesImported,
      vehiclesInserted: browserlessResult.vehiclesImported,
      durationMs: duration,
      retryCount,
      errorMessage: `ZenRows failed: ${zenrowsError}. ScrapingBee failed: ${scrapingBeeError}. Puppeteer failed: ${lastError}. Browserless cloud recovered ${browserlessResult.vehiclesImported} vehicles.`,
      completedAt: new Date(),
    });
    
    logInfo('[Robust Scraper] Browserless cloud recovery succeeded', { service: 'scraper', method: 'browserless', vehiclesImported: browserlessResult.vehiclesImported });
    
    return {
      success: true,
      vehiclesFound: browserlessResult.vehiclesImported,
      vehiclesInserted: browserlessResult.vehiclesImported,
      vehiclesUpdated: 0,
      vehiclesDeleted: 0,
      vehiclesRejected: 0,
      method: 'browserless',
      retryCount,
    };
  }

  logInfo('[Robust Scraper] Browserless failed. Trying Apify market data refresh...', { service: 'scraper', method: 'apify', browserlessError: browserlessResult.error });

  // ===== TIER 5: Apify Market Data Refresh (Validation Only) =====
  const apifyResult = await attemptApifyMarketDataRefresh(dealershipId);
  
  if (apifyResult.success) {
    method = 'apify';
    const duration = Date.now() - startTime;
    await storage.updateScrapeRun(run.id, {
      status: 'partial',
      scrapeMethod: 'apify',
      vehiclesUpdated: apifyResult.vehiclesUpdated,
      durationMs: duration,
      retryCount,
      errorMessage: `ZenRows failed: ${zenrowsError}. ScrapingBee failed: ${scrapingBeeError}. Puppeteer failed: ${lastError}. Browserless failed: ${browserlessResult.error}. Apify market refresh touched ${apifyResult.vehiclesUpdated} vehicles (no new inventory discovered).`,
      completedAt: new Date(),
    });
    
    logWarn('[Robust Scraper] Apify partial recovery', { service: 'scraper', method: 'apify', vehiclesUpdated: apifyResult.vehiclesUpdated, note: 'market data only, no new inventory' });
    
    return {
      success: false,
      vehiclesFound: 0,
      vehiclesInserted: 0,
      vehiclesUpdated: apifyResult.vehiclesUpdated,
      vehiclesDeleted: 0,
      vehiclesRejected: 0,
      method: 'apify',
      error: `ZenRows, ScrapingBee, Puppeteer, and Browserless failed. Apify market refresh updated ${apifyResult.vehiclesUpdated} existing vehicles.`,
      retryCount,
    };
  }

  // ===== TIER 6: Cache Preserve (Prevent Data Loss) =====
  logWarn('[Robust Scraper] All scraping methods failed. Preserving existing inventory (no deletions)...', { service: 'scraper', method: 'cache_preserve' });
  method = 'cache_preserve';
  
  const preserveResult = await preserveExistingInventory(dealershipId);
  const duration = Date.now() - startTime;
  
  const finalStatus = preserveResult.vehiclesPreserved > 0 ? 'partial' : 'failed';
  const errorMsg = `All scrape methods failed. ${preserveResult.vehiclesPreserved > 0 
    ? `Preserved ${preserveResult.vehiclesPreserved} existing vehicles.` 
    : 'No inventory data available.'} ZenRows: ${zenrowsError}; ScrapingBee: ${scrapingBeeError}; Puppeteer: ${lastError}; Browserless: ${browserlessResult.error}; Apify: ${apifyResult.error}`;
  
  await storage.updateScrapeRun(run.id, {
    status: finalStatus,
    scrapeMethod: 'cache_preserve',
    vehiclesFound: preserveResult.vehiclesPreserved,
    errorMessage: errorMsg,
    durationMs: duration,
    retryCount,
    completedAt: new Date(),
  });

  if (preserveResult.vehiclesPreserved > 0) {
    logWarn('[Robust Scraper] Cache preserve mode: vehicles retained', { service: 'scraper', method: 'cache_preserve', vehiclesPreserved: preserveResult.vehiclesPreserved, status: 'partial_success' });
  } else {
    logError('[Robust Scraper] Complete failure: No vehicles found or preserved', new Error('All scrape methods failed'), { service: 'scraper', method: 'cache_preserve' });
  }

  return {
    success: false,
    vehiclesFound: preserveResult.vehiclesPreserved,
    vehiclesInserted: 0,
    vehiclesUpdated: 0,
    vehiclesDeleted: 0,
    vehiclesRejected: 0,
    method: 'cache_preserve',
    error: errorMsg,
    retryCount,
  };
}

export async function getScrapeRunHistory(
  dealershipId?: number,
  limit: number = 20
): Promise<any[]> {
  return storage.getScrapeRuns(dealershipId, limit);
}

export async function getLatestScrapeStatus(dealershipId?: number): Promise<any | null> {
  const runs = await storage.getScrapeRuns(dealershipId, 1);
  return runs.length > 0 ? runs[0] : null;
}
