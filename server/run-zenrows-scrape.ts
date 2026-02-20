import { BrowserlessUnifiedService } from './browserless-unified';
import { storage } from './storage';
import * as cheerio from 'cheerio';

const browserlessService = new BrowserlessUnifiedService();

interface ScrapedVehicle {
  year: number;
  make: string;
  model: string;
  trim: string;
  type: string;
  price: number;
  odometer: number;
  vin: string | null;
  stockNumber: string | null;
  images: string[];
  vdpUrl: string;
  dealershipId: number;
  dealershipName: string;
  location: string;
  exteriorColor: string | null;
  interiorColor: string | null;
  transmission: string | null;
  drivetrain: string | null;
  fuelType: string | null;
  carfaxUrl: string | null;
  badges: string[];
}

function extractPrice(html: string): number | null {
  const patterns = [
    /name="vdp-price"\s*value="\$?([\d,]+)"/i,
    /name="vdp-initialPrice"\s*value="\$?([\d,]+)"/i,
    /value="\$?([\d,]+)"\s*name="vdp-price"/i,
    /data-price="([\d,]+)"/i,
    /for only \$([\d,]+)\s*CAD/i,
    /dealer\s*price[:\s]*\$?([\d,]+)/i,
    /our\s*price[:\s]*\$?([\d,]+)/i,
    /sale\s*price[:\s]*\$?([\d,]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const p = parseInt(match[1].replace(/,/g, ''));
      if (p >= 5000 && p <= 500000) return p;
    }
  }
  
  const allPrices = html.matchAll(/\$([\d,]+)/g);
  for (const match of allPrices) {
    const p = parseInt(match[1].replace(/,/g, ''));
    if (p >= 10000 && p <= 200000) return p;
  }
  
  return null;
}

function extractOdometer(html: string): number | null {
  const patterns = [
    /mileage[:\s]*(\d{1,3}(?:,\d{3})*)\s*km/i,
    /odometer[:\s]*(\d{1,3}(?:,\d{3})*)\s*km/i,
    /kilometers?[:\s]*(\d{1,3}(?:,\d{3})*)/i,
    /name="vdp-odometer"\s*value="(\d+)"/i,
    /data-odometer="(\d+)"/i,
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const km = parseInt(match[1].replace(/,/g, ''));
      if (km >= 100 && km <= 500000) return km;
    }
  }
  
  const allOdo = html.matchAll(/(\d{1,3}(?:,\d{3})+)\s*km/gi);
  for (const match of allOdo) {
    if (match[0].toLowerCase().includes('/100')) continue;
    const km = parseInt(match[1].replace(/,/g, ''));
    if (km >= 1000 && km <= 300000) return km;
  }
  
  return null;
}

function determineBodyType(html: string, model: string): string {
  const modelLower = model.toLowerCase();
  
  // PRIORITY 1: Model-specific classifications (most reliable)
  // SUV models - check model name first
  const suvModels = [
    'tucson', 'santa fe', 'kona', 'palisade', 'venue', 'ioniq 5', 'ioniq 6',
    'rav4', 'highlander', 'cr-v', 'crv', 'pilot', 'hr-v', 'hrv',
    'cx-30', 'cx-5', 'cx-50', 'cx-9', 'cx-90',
    'x3', 'x5', 'x7', 'q5', 'q7', 'q8',
    'xc40', 'xc60', 'xc90',
    'seltos', 'sportage', 'telluride', 'sorento', 'soul',
    'crosstrek', 'forester', 'outback', 'ascent',
    'wrangler', 'grand cherokee', 'grand wagoneer', 'compass', 'renegade',
    'explorer', 'escape', 'bronco', 'edge',
    'zdx', 'rdx', 'mdx',
    'glc', 'gle', 'gls',
    'nx', 'rx', 'gx', 'lx',
    'polestar', 'model y', 'model x'
  ];
  if (suvModels.some(m => modelLower.includes(m))) return 'SUV';
  
  // Sedan models
  const sedanModels = [
    'accord', 'civic', 'camry', 'corolla', 'sonata', 'elantra', 'azera',
    '3 series', '5 series', '7 series', '530e', '330e', '530i', '540i', '330i', '340i', 'a4', 'a6', 'a8',
    'c class', 'c-class', 'e class', 'e-class', 's class', 's-class',
    'model 3', 'model s', 'is', 'es', 'gs', 'ls',
    'altima', 'maxima', 'sentra',
    'charger', '300', 'challenger',
    'k5', 'forte', 'optima'
  ];
  if (sedanModels.some(m => modelLower.includes(m))) return 'Sedan';
  
  // Truck models
  const truckModels = [
    'f-150', 'f 150', 'f150', 'f-250', 'f 250', 'f-350', 'f 350',
    'silverado', 'sierra', 'ram', 'tundra', 'titan',
    'tacoma', 'colorado', 'canyon', 'ranger', 'frontier', 'ridgeline',
    'santa cruz', 'maverick'
  ];
  if (truckModels.some(m => modelLower.includes(m))) return 'Truck';
  
  // Hatchback models
  const hatchModels = ['golf', 'gti', 'veloster', 'mazda3', 'mazda 3', 'i30'];
  if (hatchModels.some(m => modelLower.includes(m))) return 'Hatchback';
  
  // PRIORITY 2: Body style keywords in HTML (less reliable)
  const text = html.toLowerCase();
  if (/body\s*style[:\s]*suv/i.test(text)) return 'SUV';
  if (/body\s*style[:\s]*sedan/i.test(text)) return 'Sedan';
  if (/body\s*style[:\s]*truck/i.test(text)) return 'Truck';
  if (/body\s*style[:\s]*hatchback/i.test(text)) return 'Hatchback';
  if (/body\s*style[:\s]*coupe/i.test(text)) return 'Coupe';
  if (/body\s*style[:\s]*wagon/i.test(text)) return 'Wagon';
  if (/body\s*style[:\s]*(minivan|van)/i.test(text)) return 'Minivan';
  
  // Default to SUV (most common in current inventory)
  return 'SUV';
}

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

  const extMatch = html.match(/exterior\s*(?:color|colour)?[:\s]+([A-Za-z\s]+?)(?:<|&|\n|,|;|\||$)/i);
  if (extMatch && isValidColor(extMatch[1].trim())) {
    exterior = extMatch[1].trim();
  }
  
  const intMatch = html.match(/interior\s*(?:color|colour)?[:\s]+([A-Za-z\s]+?)(?:<|&|\n|,|;|\||$)/i);
  if (intMatch && isValidColor(intMatch[1].trim())) {
    interior = intMatch[1].trim();
  }
  
  return { exterior, interior };
}

function extractTransmission(html: string): string | null {
  const text = html.toLowerCase();
  if (/\bautomatic\b|\bauto trans\b/.test(text)) return 'Automatic';
  if (/\bmanual\b|\bstick shift\b|\b6-speed manual\b/.test(text)) return 'Manual';
  if (/\bcvt\b/.test(text)) return 'CVT';
  return null;
}

function extractDrivetrain(html: string): string | null {
  const text = html.toLowerCase();
  if (/\bawd\b|\ball[\s-]?wheel[\s-]?drive\b/.test(text)) return 'AWD';
  if (/\b4wd\b|\bfour[\s-]?wheel[\s-]?drive\b|\b4x4\b/.test(text)) return '4WD';
  if (/\bfwd\b|\bfront[\s-]?wheel[\s-]?drive\b/.test(text)) return 'FWD';
  if (/\brwd\b|\brear[\s-]?wheel[\s-]?drive\b/.test(text)) return 'RWD';
  return null;
}

function extractFuelType(html: string, model?: string): string | null {
  // PRIMARY: Extract from vdp-fuelType hidden input (most reliable)
  const vdpFuelMatch = html.match(/name="vdp-fuelType"\s*value="([^"]+)"/i);
  if (vdpFuelMatch && vdpFuelMatch[1]) {
    const rawFuel = vdpFuelMatch[1].trim().toLowerCase();
    if (rawFuel === 'electric' || rawFuel === 'ev' || rawFuel === 'battery') return 'Electric';
    if (rawFuel === 'hybrid' || rawFuel === 'phev' || rawFuel === 'plug-in hybrid') return 'Hybrid';
    if (rawFuel === 'diesel') return 'Diesel';
    if (rawFuel === 'gas' || rawFuel === 'gasoline' || rawFuel === 'petrol') return 'Gasoline';
  }
  
  // SECONDARY: Infer from model name (very reliable for EV/Hybrid models)
  if (model) {
    const modelLower = model.toLowerCase();
    // Electric model patterns (Kona Electric, Ioniq 5, Ioniq 6, etc.)
    if (/\belectric\b|\bev\b|\bioniq\s*[56]\b/.test(modelLower)) return 'Electric';
    // Plug-in hybrid patterns (Tucson Plug-In Hybrid, etc.)
    if (/plug[\s-]?in\s*hybrid|phev/.test(modelLower)) return 'Hybrid';
    // Hybrid patterns (Sonata Hybrid, RAV4 Hybrid, etc.)
    if (/\bhybrid\b/.test(modelLower)) return 'Hybrid';
  }
  
  // FALLBACK: Search in vehicle title (vdp-vehicle hidden input)
  const vdpVehicleMatch = html.match(/name="vdp-vehicle"\s*value="([^"]+)"/i);
  if (vdpVehicleMatch && vdpVehicleMatch[1]) {
    const vehicleTitle = vdpVehicleMatch[1].toLowerCase();
    if (/\belectric\b|\bev\b|\bioniq\s*[56]\b/.test(vehicleTitle)) return 'Electric';
    if (/plug[\s-]?in\s*hybrid|phev/.test(vehicleTitle)) return 'Hybrid';
    if (/\bhybrid\b/.test(vehicleTitle)) return 'Hybrid';
  }
  
  // LAST RESORT: Search in full page text (least reliable due to ads/related content)
  const text = html.toLowerCase();
  // Only use very specific patterns to avoid false positives
  if (/\bplug[\s-]?in\s*hybrid\b|\bphev\b/.test(text)) return 'Hybrid';
  // For general "electric" or "hybrid" in page text, require more context
  // Default to Gasoline if no specific fuel type is identified
  return 'Gasoline';
}

function extractBadges(html: string, year: number, odometer: number, make: string): string[] {
  const badges: string[] = [];
  
  // Use Carfax badge SVG URLs as authoritative source (e.g., cdn.carfax.ca/badging/v3/en/OneOwner.svg)
  const carfaxBadges = html.match(/cdn\.carfax\.ca\/badging[^"']+\.svg/gi) || [];
  const badgeNames = new Set(carfaxBadges.map(url => url.toLowerCase()));
  
  if ([...badgeNames].some(b => b.includes('oneowner'))) {
    badges.push('One Owner');
  }
  if ([...badgeNames].some(b => b.includes('accidentfree') || b.includes('noaccident'))) {
    badges.push('No Accidents');
  }
  
  // Certified Pre-Owned: Only applies to Hyundai vehicles less than 4 years old AND under 100,000 km
  const currentYear = new Date().getFullYear();
  const vehicleAge = currentYear - year;
  const isHyundai = make.toLowerCase() === 'hyundai';
  
  if (isHyundai && vehicleAge < 4 && odometer < 100000) {
    badges.push('Certified Pre-Owned');
  }
  
  // Low Kilometers - use Carfax badge if available, otherwise calculate
  if ([...badgeNames].some(b => b.includes('lowkilometer') || b.includes('lowmileage'))) {
    badges.push('Low Kilometers');
  } else {
    const expectedKm = vehicleAge * 15000;
    if (odometer > 0 && odometer < expectedKm * 0.6) badges.push('Low Kilometers');
  }
  
  return badges;
}

function extractCarfaxUrl(html: string): string | null {
  const match = html.match(/href=["']([^"']*carfax[^"']*)["']/i);
  return match ? match[1] : null;
}

function extractTrim(html: string, make: string, model: string, vdpUrl: string): { trim: string; highlights: string } {
  // Helper to clean trim value by removing badge-like suffixes and feature highlights
  function cleanTrimValue(rawTrim: string): string {
    // Remove common badge-like patterns and feature highlights that appear in trim fields
    // Pattern: "Series II Obsidian | ONE OWNER | LOW MILEAGE" -> "Series II Obsidian"
    // Pattern: "Ultimate AWD | VENTILATED SEATS | NAVIGATION |" -> "Ultimate AWD"
    const badgeSuffixes = [
      /\s*\|\s*one\s*owner.*/i,
      /\s*\|\s*low\s*(km|kms|kilometer|kilometre|mileage).*/i,
      /\s*\|\s*no\s*accident.*/i,
      /\s*\|\s*accident\s*free.*/i,
      /\s*\|\s*clean\s*history.*/i,
      /\s*\|\s*certified.*/i,
      /\s*\|\s*cpo.*/i,
      /\s*\|\s*local.*/i,
      /\s*\|\s*bc\s*vehicle.*/i,
      /\s*\|\s*warranty.*/i,
      /\s*\|\s*service.*/i,
      /\s*\|\s*maintained.*/i,
      // Feature highlights (commonly added to trim in dealer pages)
      /\s*\|\s*ventilated.*/i,
      /\s*\|\s*heated.*/i,
      /\s*\|\s*leather.*/i,
      /\s*\|\s*sunroof.*/i,
      /\s*\|\s*moonroof.*/i,
      /\s*\|\s*navigation.*/i,
      /\s*\|\s*nav\s.*/i,
      /\s*\|\s*panoramic.*/i,
      /\s*\|\s*premium.*/i,
      /\s*\|\s*backup.*/i,
      /\s*\|\s*camera.*/i,
      /\s*\|\s*carplay.*/i,
      /\s*\|\s*android.*/i,
      /\s*\|\s*bluetooth.*/i,
      /\s*\|\s*remote.*/i,
      /\s*\|\s*keyless.*/i,
      /\s*\|\s*push\s*button.*/i,
      /\s*\|\s*blind\s*spot.*/i,
      /\s*\|\s*lane.*/i,
      /\s*\|\s*adaptive.*/i,
      /\s*\|\s*cruise.*/i,
      /\s*\|\s*loaded.*/i,
      /\s*\|\s*fully.*/i,
      /\s*\|\s*mint.*/i,
      /\s*\|\s*like\s*new.*/i,
      /\s*\|\s*must\s*see.*/i,
      /\s*\|\s*reduced.*/i,
      /\s*\|\s*sale.*/i,
      /\s*\|\s*special.*/i,
      /\s*\|\s*deal.*/i,
      /\s*\|\s*priced.*/i,
      // More feature highlights
      /\s*\|\s*sun.*roof.*/i,
      /\s*\|\s*moon.*roof.*/i,
      /\s*\|\s*back\s*up.*/i,
      /\s*\|\s*bose.*/i,
      /\s*\|\s*harman.*/i,
      /\s*\|\s*jbl.*/i,
      /\s*\|\s*audio.*/i,
      /\s*\|\s*sound.*/i,
      /\s*\|\s*bluetooth.*/i,
      /\s*\|\s*blutooth.*/i,
      /\s*\|\s*bc[\s-]local.*/i,
      /\s*\|\s*local\s*vehicle.*/i,
      /\s*\|\s*\d+\s*owner.*/i,
      /\s*\|\s*rmte\s*strt.*/i,
      /\s*\|\s*remote\s*start.*/i,
      /\s*\|\s*brake\s*assist.*/i,
      /\s*\|\s*cam\b.*/i,
    ];
    
    let cleaned = rawTrim.trim();
    for (const pattern of badgeSuffixes) {
      cleaned = cleaned.replace(pattern, '');
    }
    
    // Also handle comma-separated badge/feature patterns
    cleaned = cleaned.replace(/,\s*(one\s*owner|no\s*accident|low\s*(km|mileage)|clean\s*history|certified|cpo|ventilated|heated|leather|navigation).*/i, '');
    
    // Remove trailing pipe characters and whitespace
    cleaned = cleaned.replace(/\s*\|\s*$/g, '').trim();
    
    return cleaned.trim();
  }
  
  const invalidValues = ['trim', 'n/a', 'na', 'unknown', 'tbd', 'null', 'undefined', 'none', 'base'];
  const invalidPatterns = [
    'interior', 'exterior', 'insert', 'color', 'colour', 'used', 'new', 'pre-owned', 'preowned', 
    'certified', 'vancouver', 'burnaby', 'surrey', 'richmond', 'in bc', 'british columbia',
    'for sale', 'buy', 'purchase', 'inventory', 'stock', 'price', 'details', 'overview'
  ];
  
  function isValidTrim(trimValue: string): boolean {
    const lowerTrim = trimValue.toLowerCase();
    if (invalidValues.includes(lowerTrim)) return false;
    if (trimValue.length < 2 || trimValue.length > 60) return false;
    if (invalidPatterns.some(inv => lowerTrim.includes(inv))) return false;
    return true;
  }

  function extractHighlightsFromRaw(rawTrim: string): string {
    const pipeIndex = rawTrim.indexOf('|');
    if (pipeIndex === -1) return '';
    const afterTrim = rawTrim.substring(pipeIndex + 1).trim();
    const parts = afterTrim.split('|').map(p => p.trim()).filter(p => p.length > 0);
    return parts.join(' | ');
  }

  let highlights = '';
  
  // PRIMARY METHOD: Extract from vdp-trim hidden input (most reliable for Olympic Hyundai)
  const vdpTrimMatch = html.match(/name="vdp-trim"\s*value="([^"]+)"/i);
  if (vdpTrimMatch && vdpTrimMatch[1]) {
    const rawTrim = vdpTrimMatch[1].trim();
    highlights = extractHighlightsFromRaw(rawTrim);
    const cleanedTrim = cleanTrimValue(rawTrim);
    if (isValidTrim(cleanedTrim)) {
      return { trim: cleanedTrim, highlights };
    }
  }
  
  // Helper to extract trim from title text using regex
  function extractFromTitle(titleText: string): string | null {
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const makePattern = escapeRegex(make).replace(/\s+/g, '[\\s-]+');
    const modelPattern = escapeRegex(model).replace(/\s+/g, '[\\s-]+');
    
    const pattern = new RegExp(
      `^\\d{4}\\s+${makePattern}\\s+${modelPattern}\\s+(.+)$`,
      'i'
    );
    
    const match = titleText.match(pattern);
    if (match && match[1]) {
      if (!highlights) highlights = extractHighlightsFromRaw(match[1].trim());
      const trim = cleanTrimValue(match[1].trim());
      if (trim.length > 1 && isValidTrim(trim)) {
        return trim;
      }
    }
    return null;
  }
  
  // FALLBACK 1: Try H1 tag
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match && h1Match[1]) {
    const trim = extractFromTitle(h1Match[1].trim());
    if (trim) return { trim, highlights };
  }
  
  // FALLBACK 2: Try og:title meta tag
  const ogMatch = html.match(/og:title[^>]*content="([^"]+)"/i);
  if (ogMatch && ogMatch[1]) {
    const trim = extractFromTitle(ogMatch[1].trim());
    if (trim) return { trim, highlights };
  }
  
  // FALLBACK 3: Try other structured data fields
  const structuredPatterns = [
    /data-trim="([^"]+)"/i,
    /"trim"[:\s]*"([^"]+)"/i,
    /"vehicleConfiguration"[:\s]*"([^"]+)"/i,
  ];
  
  for (const pattern of structuredPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const trimValue = cleanTrimValue(match[1].trim().replace(/\s+/g, ' '));
      if (isValidTrim(trimValue)) {
        return { trim: trimValue, highlights };
      }
    }
  }
  
  return { trim: '', highlights };
}

export async function scrapeWithZenRows() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   Olympic Hyundai Vancouver - Inventory Scraper (Zyte)          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  
  const dealershipId = 1; // Olympic Hyundai Vancouver
  const inventoryUrl = 'https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used';
  
  console.log('\n📥 Step 1: Fetching inventory listing page...');
  const listingResult = await browserlessService.zyteScrape(inventoryUrl, { scrollToBottom: true });
  
  if (!listingResult.success || !listingResult.html) {
    console.error('❌ Zyte listing scrape failed:', listingResult.error);
    return;
  }
  
  console.log('   ✓ HTML retrieved:', (listingResult.html.length / 1024).toFixed(1), 'KB');
  
  const $ = cheerio.load(listingResult.html);
  
  // Extract expected count from "XX Items Matching" on listing page
  let expectedCount: number | null = null;
  const countMatch = listingResult.html.match(/(\d+)\s*Items?\s*Matching/i);
  if (countMatch) {
    expectedCount = parseInt(countMatch[1]);
    console.log(`   ✓ Dealer website shows: ${expectedCount} vehicles`);
  }
  
  const vdpUrls: string[] = [];
  const seen = new Set<string>();
  
  // Debug: Check how many links are on the page
  const allLinks = $('a[href*="/vehicles/20"]');
  console.log(`   DEBUG: Found ${allLinks.length} raw vehicle links`);
  
  allLinks.each((_, elem) => {
    const href = $(elem).attr('href');
    if (href && href.includes('/vehicles/20') && !href.includes('#')) {
      const fullUrl = href.startsWith('http') ? href : `https://www.olympichyundaivancouver.com${href}`;
      if (!seen.has(fullUrl)) {
        seen.add(fullUrl);
        // Accept both sale_class=used and no sale_class (covers all used vehicle URL formats)
        if (fullUrl.includes('sale_class=used') || !fullUrl.includes('sale_class=')) {
          vdpUrls.push(fullUrl);
        }
      }
    }
  });
  
  console.log('   ✓ Found', vdpUrls.length, 'vehicle detail pages\n');
  
  console.log('📄 Step 2: Scraping individual vehicle pages...');
  console.log('   (Estimated time:', Math.ceil(vdpUrls.length * 0.5 / 60), 'minutes)\n');
  
  const vehicles: ScrapedVehicle[] = [];
  let processed = 0;
  let skipped = 0;
  
  // Process in parallel batches for speed
  const batchSize = 3;
  
  for (let i = 0; i < vdpUrls.length; i += batchSize) {
    const batch = vdpUrls.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (vdpUrl) => {
        try {
          const vdpResult = await browserlessService.zyteScrape(vdpUrl, { scrollToBottom: true });
          return { vdpUrl, vdpResult, error: null };
        } catch (e) {
          return { vdpUrl, vdpResult: null, error: e };
        }
      })
    );
    
    for (const { vdpUrl, vdpResult, error } of results) {
      processed++;
      
      if (error || !vdpResult?.success || !vdpResult?.html) {
        skipped++;
        continue;
      }
      
      try {
        const html = vdpResult.html;
        const $v = cheerio.load(html);
      
        const urlParts = vdpUrl.split('/');
      const yearIdx = urlParts.findIndex(p => /^20\d{2}$/.test(p));
      const year = parseInt(urlParts[yearIdx]);
      const make = urlParts[yearIdx + 1].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const model = urlParts[yearIdx + 2].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      
      const price = extractPrice(html) ?? 0; // 0 means "Contact for Price"
      const odometer = extractOdometer(html) ?? 0; // 0 means new/unknown mileage
      
      let vin: string | null = null;
      const vinMatch = html.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
      if (vinMatch) vin = vinMatch[1];
      
      let stockNumber: string | null = null;
      // Try multiple patterns for stock number extraction
      // Pattern 1: "Stock #: IC508732" or "Stock: IC508732" (most reliable)
      const stockPatterns = [
        /stock\s*#\s*:\s*([A-Z0-9-]+)/i,
        /stock\s*#\s*([A-Z0-9-]+)/i,
        /stock[:\s]+([A-Z0-9]{5,})/i,
        /stock_number[:\s"]+([A-Z0-9-]+)/i,
        /"stockNumber"[:\s"]+([A-Z0-9-]+)/i,
      ];
      const invalidStockValues = [
        'chrysler', 'toyota', 'hyundai', 'honda', 'kia', 'mazda', 'bmw', 'mercedes',
        'lexus', 'acura', 'audi', 'volvo', 'subaru', 'nissan', 'ford', 'chevrolet',
        'jeep', 'dodge', 'ram', 'gmc', 'cadillac', 'lincoln', 'buick', 'volkswagen',
        'porsche', 'jaguar', 'land', 'rover', 'mini', 'fiat', 'alfa', 'genesis',
        'polestar', 'tesla', 'rivian', 'lucid',
        'used', 'new', 'auto', 'vehicle', 'car', 'truck', 'suv', 'sedan'
      ];
      for (const pattern of stockPatterns) {
        const match = html.match(pattern);
        if (match && match[1] && match[1].length >= 5 && match[1].length <= 15) {
          const val = match[1].toUpperCase();
          const valLower = val.toLowerCase();
          // Validate: not a brand name or common word
          if (!invalidStockValues.includes(valLower)) {
            stockNumber = val;
            break;
          }
        }
      }
      // No fallback - stock number remains null if not found
      
      const images: string[] = [];
      const seenImages = new Set<string>();
      
      // Helper to normalize image URL to high-resolution version
      const normalizeImageUrl = (src: string): string | null => {
        if (!src || !src.startsWith('http')) return null;
        if (src.length > 500) return null;
        
        // Skip non-vehicle images - comprehensive filter
        const skipPatterns = [
          'placeholder', 'logo', 'icon', 'banner', 'Badge', 'carfax', 'favicon', 
          'social', 'og-image', '.svg', 'wp-content', 'theme', 'header', 'footer',
          'sprite', 'loading', 'spinner', 'convertus', 'achilles'
        ];
        if (skipPatterns.some(p => src.toLowerCase().includes(p.toLowerCase()))) return null;
        
        // Must be from a known vehicle image CDN - STRICT check
        const validCdns = ['autotradercdn', 'photomanager'];
        if (!validCdns.some(cdn => src.includes(cdn))) return null;
        
        let imageUrl = src;
        
        // Convert AutoTrader CDN thumbnails to high-resolution
        // Thumbnail formats: -133x100, -320x240, -640x480
        // High-res format: -1024x786
        if (src.includes('autotradercdn') || src.includes('photomanager')) {
          imageUrl = imageUrl.replace(/-\d+x\d+/g, '-1024x786');
        }
        
        return imageUrl;
      };
      
      // Extract from img src and data-src attributes (handles lazy loading)
      $v('img').each((_, img) => {
        const $img = $v(img);
        const sources = [
          $img.attr('src'),
          $img.attr('data-src'),
          $img.attr('data-lazy-src'),
          $img.attr('data-original'),
          $img.attr('data-srcset')?.split(' ')[0], // First URL from srcset
        ];
        
        for (const src of sources) {
          const normalized = src ? normalizeImageUrl(src) : null;
          if (normalized && !seenImages.has(normalized)) {
            seenImages.add(normalized);
            images.push(normalized);
          }
        }
      });
      
      // Also extract from background images and inline styles
      const bgMatches = html.matchAll(/url\(['"]?(https?:\/\/[^'")\s]+(?:autotradercdn|photomanager)[^'")\s]+)['"]?\)/g);
      for (const match of bgMatches) {
        const normalized = normalizeImageUrl(match[1]);
        if (normalized && !seenImages.has(normalized)) {
          seenImages.add(normalized);
          images.push(normalized);
        }
      }
      
      // Extract from data attributes on other elements (some sites use divs with data-src)
      $v('[data-src], [data-image], [data-photo]').each((_, el) => {
        const $el = $v(el);
        const sources = [
          $el.attr('data-src'),
          $el.attr('data-image'),
          $el.attr('data-photo'),
        ];
        
        for (const src of sources) {
          const normalized = src ? normalizeImageUrl(src) : null;
          if (normalized && !seenImages.has(normalized)) {
            seenImages.add(normalized);
            images.push(normalized);
          }
        }
      });
      
      const colors = extractColors(html);
      const type = determineBodyType(html, model);
      const badges = extractBadges(html, year, odometer, make);
      
      const trimResult = extractTrim(html, make, model, vdpUrl);
      const vehicleData = {
        year,
        make,
        model,
        trim: trimResult.trim,
        highlights: trimResult.highlights,
        type,
        price,
        odometer,
        vin,
        stockNumber,
        images: images.slice(0, 50),
        vdpUrl,
        dealershipId: 1,
        dealershipName: 'Olympic Hyundai Vancouver',
        location: 'Vancouver',
        exteriorColor: colors.exterior,
        interiorColor: colors.interior,
        transmission: extractTransmission(html),
        drivetrain: extractDrivetrain(html),
        fuelType: extractFuelType(html, model),
        carfaxUrl: extractCarfaxUrl(html),
        badges,
      };
      
      vehicles.push(vehicleData);
      
      // Save immediately to database (incremental save)
      try {
        const dbData = {
          dealershipId: vehicleData.dealershipId,
          vin: vehicleData.vin,
          year: vehicleData.year,
          make: vehicleData.make,
          model: vehicleData.model,
          trim: vehicleData.trim,
          type: vehicleData.type,
          price: vehicleData.price,
          odometer: vehicleData.odometer,
          exteriorColor: vehicleData.exteriorColor,
          interiorColor: vehicleData.interiorColor,
          transmission: vehicleData.transmission,
          drivetrain: vehicleData.drivetrain,
          fuelType: vehicleData.fuelType,
          description: '',
          images: vehicleData.images,
          carfaxUrl: vehicleData.carfaxUrl,
          dealerVdpUrl: vehicleData.vdpUrl,
          stockNumber: vehicleData.stockNumber,
          badges: vehicleData.badges,
          location: vehicleData.location,
          dealership: vehicleData.dealershipName,
          highlights: vehicleData.highlights || null,
        };
        
        if (vehicleData.vin) {
          const existing = await storage.getVehicleByVin(vehicleData.vin, vehicleData.dealershipId);
          if (existing) {
            await storage.updateVehicle(existing.id, dbData, vehicleData.dealershipId);
            console.log(`   ✓ Updated: ${vehicleData.year} ${vehicleData.make} ${vehicleData.model} - $${vehicleData.price.toLocaleString()}`);
          } else {
            await storage.createVehicle(dbData);
            console.log(`   ✓ Created: ${vehicleData.year} ${vehicleData.make} ${vehicleData.model} - $${vehicleData.price.toLocaleString()}`);
          }
        } else {
          await storage.createVehicle(dbData);
          console.log(`   ✓ Created: ${vehicleData.year} ${vehicleData.make} ${vehicleData.model} - $${vehicleData.price.toLocaleString()}`);
        }
      } catch (saveErr) {
        console.error(`   ❌ Failed to save: ${vehicleData.year} ${vehicleData.make} ${vehicleData.model}:`, saveErr instanceof Error ? saveErr.message : saveErr);
      }
      
      if (processed % 5 === 0) {
        console.log(`   Progress: ${processed}/${vdpUrls.length} (${vehicles.length} valid, ${skipped} skipped)`);
      }
      
      } catch (e) {
        skipped++;
      }
    }
    
    // Brief pause between batches
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                      SCRAPE RESULTS                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`   Total pages processed: ${processed}`);
  console.log(`   Valid vehicles: ${vehicles.length}`);
  console.log(`   Skipped (missing data): ${skipped}`);
  
  if (vehicles.length > 0) {
    console.log('\n📊 Sample vehicles:');
    console.log('─'.repeat(70));
    vehicles.slice(0, 8).forEach((v, i) => {
      console.log(`   ${i+1}. ${v.year} ${v.make} ${v.model} ${v.trim}`);
      console.log(`      $${v.price.toLocaleString()} | ${v.odometer.toLocaleString()} km | ${v.type} | ${v.images.length} images`);
      if (v.badges.length > 0) console.log(`      Badges: ${v.badges.join(', ')}`);
    });
    console.log('─'.repeat(70));
    
    console.log('\n💾 Step 3: Saving to database...');
    let created = 0;
    let updated = 0;
    let errors = 0;
    
    for (const v of vehicles) {
      try {
        const vehicleData = {
          dealershipId: v.dealershipId,
          vin: v.vin,
          year: v.year,
          make: v.make,
          model: v.model,
          trim: v.trim,
          type: v.type,
          price: v.price,
          odometer: v.odometer,
          exteriorColor: v.exteriorColor,
          interiorColor: v.interiorColor,
          transmission: v.transmission,
          drivetrain: v.drivetrain,
          fuelType: v.fuelType,
          description: '',
          images: v.images,
          carfaxUrl: v.carfaxUrl,
          dealerVdpUrl: v.vdpUrl,
          stockNumber: v.stockNumber,
          badges: v.badges,
          location: v.location,
          dealership: v.dealershipName,
        };
        
        if (v.vin) {
          const existing = await storage.getVehicleByVin(v.vin, v.dealershipId);
          if (existing) {
            await storage.updateVehicle(existing.id, vehicleData, v.dealershipId);
            updated++;
          } else {
            await storage.createVehicle(vehicleData);
            created++;
          }
        } else {
          await storage.createVehicle(vehicleData);
          created++;
        }
      } catch (e) {
        errors++;
        console.error(`   ❌ Failed: ${v.year} ${v.make} ${v.model}:`, e instanceof Error ? e.message : e);
      }
    }
    
    // Step 4: Mark sold vehicles (those in DB but not in scraped VINs)
    console.log('\n🔍 Step 4: Checking for sold vehicles...');
    const scrapedVins = new Set(vehicles.map(v => v.vin).filter((vin): vin is string => vin !== null));
    const allDbVehiclesResult = await storage.getVehicles(dealershipId);
    const allDbVehicles = allDbVehiclesResult.vehicles;
    let deleted = 0;
    
    for (const dbVehicle of allDbVehicles) {
      if (dbVehicle.vin && !scrapedVins.has(dbVehicle.vin)) {
        // Vehicle is no longer on dealer website - delete it
        try {
          await storage.deleteVehicle(dbVehicle.id, dealershipId);
          deleted++;
          console.log(`   🗑️  Removed sold vehicle: ${dbVehicle.year} ${dbVehicle.make} ${dbVehicle.model} (${dbVehicle.vin})`);
        } catch (e) {
          // May have FK constraints, skip those
          console.log(`   ⚠️  Could not remove ${dbVehicle.vin}: likely has related data`);
        }
      }
    }
    
    // Get final database count
    const { vehicles: finalDbVehicles, total: finalCount } = await storage.getVehicles(dealershipId, 1000, 0);
    
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                    DATABASE SUMMARY                              ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    console.log(`   ✅ Created: ${created} new vehicles`);
    console.log(`   🔄 Updated: ${updated} existing vehicles`);
    console.log(`   🗑️  Removed: ${deleted} sold vehicles`);
    if (errors > 0) console.log(`   ❌ Errors: ${errors}`);
    
    // Count verification
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                    COUNT VERIFICATION                            ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    console.log(`   📊 Dealer website count: ${expectedCount ?? 'Unknown'}`);
    console.log(`   📄 VDP pages found: ${vdpUrls.length}`);
    console.log(`   ✅ Valid vehicles scraped: ${vehicles.length}`);
    console.log(`   💾 Final database count: ${finalCount}`);
    
    if (expectedCount !== null) {
      if (finalCount === expectedCount) {
        console.log(`   🎯 VERIFIED: Database matches dealer website (${finalCount}/${expectedCount})`);
      } else if (finalCount < expectedCount) {
        console.log(`   ⚠️  MISMATCH: Missing ${expectedCount - finalCount} vehicles (${finalCount}/${expectedCount})`);
        console.log(`      Possible causes: missing odometer data, scrape failures, or FK constraints`);
      } else {
        console.log(`   ⚠️  MISMATCH: Extra ${finalCount - expectedCount} vehicles in DB (${finalCount}/${expectedCount})`);
        console.log(`      Possible cause: vehicles removed from dealer site but kept due to FK constraints`);
      }
    }
    
    console.log('\n🎉 Inventory sync complete!');
  }
}

// Allow running directly via: npx tsx server/run-zenrows-scrape.ts
const isDirectRun = process.argv[1]?.includes('run-zenrows-scrape');
if (isDirectRun) {
  scrapeWithZenRows().catch(console.error);
}
