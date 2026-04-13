import { BrowserlessUnifiedService } from './browserless-unified';
import * as cheerio from 'cheerio';
import { db } from './db';
import { vehicles } from '@shared/schema';
import { eq } from 'drizzle-orm';

const browserlessService = new BrowserlessUnifiedService();

interface TechSpecs {
  features: string[];
  mechanical: string[];
  exterior: string[];
  interior: string[];
  entertainment: string[];
}

interface VDPDetails {
  vdpDescription: string | null;
  carfaxBadges: string[];
  techSpecs: TechSpecs | null;
  carfaxUrl: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  transmission: string | null;
  drivetrain: string | null;
  fuelType: string | null;
  engine: string | null;
}

function decodeHtmlEntitiesForScraper(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#x3A;/gi, ':')
    .replace(/&#x3D;/gi, '=')
    .replace(/&#x26;/gi, '&')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002f/gi, '/')
    .replace(/\\u003a/gi, ':')
    .replace(/\\u003d/gi, '=')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

function extractCarfaxUrl($: cheerio.CheerioAPI): string | null {
  const html = decodeHtmlEntitiesForScraper($.html());
  const vhrPattern = /https?:\/\/vhr\.carfax\.ca\/\?id=[A-Za-z0-9%\/=+_-]+/gi;
  const vhrMatch = html.match(vhrPattern)?.[0];
  if (vhrMatch) return vhrMatch;

  const structuredPatterns = [
    /"(?:carfaxUrl|carfaxURL|carfax_report_url|carfaxReportUrl|vehicleHistoryUrl)"\s*:\s*"([^"]+)"/gi,
    /"(?:href|url)"\s*:\s*"(https?:\\\/\\\/(?:vhr\\\.)?carfax\\\.(?:ca|com)[^"]+)"/gi,
    /(?:carfaxUrl|carfaxURL|carfaxReportUrl|vehicleHistoryUrl)\s*[:=]\s*['"]([^'"]+)['"]/gi,
  ];

  for (const pattern of structuredPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      const candidate = decodeHtmlEntitiesForScraper(match[1]);
      if (/https?:\/\/(?:vhr\.)?carfax\.(?:ca|com)/i.test(candidate)) {
        return candidate;
      }
    }
  }

  const selectors = 'a[href*="carfax"], a[data-href*="carfax"], a[data-url*="carfax"], a[data-link*="carfax"], [data-carfax-url], [data-carfax], [data-href*="carfax"], [data-link*="carfax"]';
  const attrNames = ['href', 'data-href', 'data-url', 'data-link', 'data-carfax-url', 'data-carfax'];
  let fallback: string | null = null;

  $(selectors).each((_, el) => {
    for (const attr of attrNames) {
      const raw = $(el).attr(attr);
      if (!raw) continue;
      const candidate = decodeHtmlEntitiesForScraper(raw.trim());
      if (/https?:\/\/vhr\.carfax\.(?:ca|com)/i.test(candidate)) {
        fallback = candidate;
        return false;
      }
      if (!fallback && /https?:\/\/(?:www\.)?carfax\.(?:ca|com)/i.test(candidate) && !/^https?:\/\/(?:www\.)?carfax\.(?:ca|com)\/?$/i.test(candidate)) {
        fallback = candidate;
      }
    }
  });

  return fallback;
}

function extractLabeledValue($: cheerio.CheerioAPI, labels: string[], html: string): string | null {
  const selectors = ['.techspecs-tab.mb-md', '.techspecs-tab', '.description-tab.mb-md', '.description-tab', 'body'];

  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s*');
    const regexes = [
      new RegExp(`${escaped}[:\\s]+([^<\\n|,;]+)`, 'i'),
      new RegExp(`<dt[^>]*>\\s*${escaped}\\s*</dt>\\s*<dd[^>]*>\\s*([^<]+)`, 'i'),
      new RegExp(`<th[^>]*>\\s*${escaped}\\s*</th>\\s*<td[^>]*>\\s*([^<]+)`, 'i'),
      new RegExp(`"${escaped}"\\s*[:=]\\s*"([^"]+)"`, 'i'),
    ];

    for (const selector of selectors) {
      const text = $(selector).text();
      for (const regex of regexes) {
        const match = text.match(regex) || html.match(regex);
        if (match?.[1]) {
          const candidate = match[1].replace(/\s+/g, ' ').trim();
          if (candidate && candidate.length <= 120) return candidate;
        }
      }
    }
  }

  return null;
}

function extractFuelType($: cheerio.CheerioAPI, html: string): string | null {
  const candidate = extractLabeledValue($, ['Fuel Type', 'Fuel', 'Powertrain'], html);
  if (!candidate) return null;
  const lower = candidate.toLowerCase();
  if (lower.includes('electric')) return 'Electric';
  if (lower.includes('hybrid') || lower.includes('plug-in')) return 'Hybrid';
  if (lower.includes('diesel')) return 'Diesel';
  if (lower.includes('gas') || lower.includes('gasoline') || lower.includes('petrol') || lower.includes('unleaded')) return 'Gasoline';
  return candidate;
}

function extractVDPDetails($: cheerio.CheerioAPI): VDPDetails {
  const pageHtml = $.html();
  let vdpDescription: string | null = null;
  const carfaxBadges: string[] = [];
  let techSpecs: TechSpecs | null = null;
  const carfaxUrl = extractCarfaxUrl($);
  const exteriorColor = extractLabeledValue($, ['Exterior Colour', 'Exterior Color', 'Colour (Exterior)', 'Color (Exterior)'], pageHtml);
  const interiorColor = extractLabeledValue($, ['Interior Colour', 'Interior Color', 'Colour (Interior)', 'Color (Interior)'], pageHtml);
  const transmission = extractLabeledValue($, ['Transmission'], pageHtml);
  const drivetrain = extractLabeledValue($, ['Drive Train', 'Drivetrain', 'Drive Type'], pageHtml);
  const fuelType = extractFuelType($, pageHtml);
  const engine = extractLabeledValue($, ['Engine Type', 'Engine'], pageHtml);

  // Extract VDP Description from .description-tab.mb-md
  const descriptionTab = $('.description-tab.mb-md');
  if (descriptionTab.length > 0) {
    const overviewHeading = descriptionTab.find('h2, h3, h4').filter((i, el) => 
      $(el).text().trim().toLowerCase() === 'overview'
    ).first();
    
    if (overviewHeading.length > 0) {
      // Get text after the overview heading (skip the heading itself)
      const parent = descriptionTab;
      let fullText = parent.text().trim();
      // Remove the "Overview" heading from the start
      fullText = fullText.replace(/^Overview\s*/i, '').trim();
      vdpDescription = fullText || null;
    } else {
      // Fallback: just get all text from description tab
      vdpDescription = descriptionTab.text().trim() || null;
    }
  }

  // Extract Carfax badges by looking for specific text patterns only
  // This avoids picking up modal/popup content
  const normalizedPageHtml = pageHtml.toLowerCase();
  
  // Known Carfax badge patterns (only match these specific phrases)
  const knownBadges = [
    { pattern: 'no reported accidents', badge: 'No Reported Accidents' },
    { pattern: 'no accidents', badge: 'No Reported Accidents' },
    { pattern: 'one owner', badge: 'One Owner' },
    { pattern: '1 owner', badge: 'One Owner' },
    { pattern: 'personal use', badge: 'Personal Use' },
    { pattern: 'service history available', badge: 'Service History' },
  ];
  
  for (const { pattern, badge } of knownBadges) {
    if (normalizedPageHtml.includes(pattern) && !carfaxBadges.includes(badge)) {
      carfaxBadges.push(badge);
    }
  }

  // Extract Tech Specs from .techspecs-tab.mb-md
  const techspecsTab = $('.techspecs-tab.mb-md');
  
  if (techspecsTab.length > 0) {
    const specs: TechSpecs = {
      features: [],
      mechanical: [],
      exterior: [],
      interior: [],
      entertainment: []
    };

    const allHeadings = techspecsTab.find('h2, h3, h4, h5, h6');

    // Helper to extract list items from a section by heading
    const extractSectionItems = (headingPattern: RegExp): string[] => {
      const items: string[] = [];
      
      allHeadings.each((i, heading) => {
        const headingText = $(heading).text().trim();
        if (headingPattern.test(headingText.toLowerCase())) {
          // Look for UL siblings or within parent
          let ul = $(heading).next('ul');
          if (ul.length === 0) {
            ul = $(heading).parent().find('ul').first();
          }
          if (ul.length === 0) {
            ul = $(heading).nextAll('ul').first();
          }
          
          ul.find('li').each((j, li) => {
            const text = $(li).text().trim();
            if (text && text.length > 1) items.push(text);
          });
        }
      });
      return items;
    };

    // Extract features (Options Features, Options & Features, Features)
    specs.features = extractSectionItems(/options|features/);
    specs.mechanical = extractSectionItems(/^mechanical$/);
    specs.exterior = extractSectionItems(/^exterior$/);
    specs.interior = extractSectionItems(/^interior$/);
    specs.entertainment = extractSectionItems(/^entertainment$/);

    // Only set techSpecs if we found at least some data
    if (specs.features.length > 0 || specs.mechanical.length > 0 || 
        specs.exterior.length > 0 || specs.interior.length > 0 || 
        specs.entertainment.length > 0) {
      techSpecs = specs;
    }
  }

  return { vdpDescription, carfaxBadges, techSpecs, carfaxUrl, exteriorColor, interiorColor, transmission, drivetrain, fuelType, engine };
}

async function scrapeAndUpdateVehicle(vehicleId: number, vdpUrl: string) {
  console.log(`Scraping VDP: ${vdpUrl}`);
  
  const result = await browserlessService.zenRowsScrape(vdpUrl);
  if (!result.success || !result.html) {
    console.log(`Failed to scrape: ${result.error}`);
    return false;
  }
  
  console.log(`Successfully fetched ${result.html.length} chars of HTML`);
  
  const $ = cheerio.load(result.html);
  const details = extractVDPDetails($);
  
  console.log('\n--- Extracted Details ---');
  console.log('VDP Description:', details.vdpDescription ? details.vdpDescription.substring(0, 200) + '...' : 'None');
  console.log('Carfax Badges:', details.carfaxBadges);
  console.log('Tech Specs:', details.techSpecs ? {
    features: details.techSpecs.features.length,
    mechanical: details.techSpecs.mechanical.length,
    exterior: details.techSpecs.exterior.length,
    interior: details.techSpecs.interior.length,
    entertainment: details.techSpecs.entertainment.length
  } : 'None');
  
  // Update the vehicle in the database
  const [existingVehicle] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
  if (!existingVehicle) {
    console.log(`Vehicle ID ${vehicleId} not found`);
    return false;
  }

  await db.update(vehicles)
    .set({
      vdpDescription: existingVehicle.vdpDescription ?? details.vdpDescription,
      carfaxBadges: existingVehicle.carfaxBadges ?? (details.carfaxBadges.length > 0 ? details.carfaxBadges : null),
      techSpecs: existingVehicle.techSpecs ?? (details.techSpecs ? JSON.stringify(details.techSpecs) : null),
      carfaxUrl: existingVehicle.carfaxUrl ?? details.carfaxUrl,
      exteriorColor: existingVehicle.exteriorColor ?? details.exteriorColor,
      interiorColor: existingVehicle.interiorColor ?? details.interiorColor,
      transmission: existingVehicle.transmission ?? details.transmission,
      drivetrain: existingVehicle.drivetrain ?? details.drivetrain,
      fuelType: existingVehicle.fuelType ?? details.fuelType,
      engine: existingVehicle.engine ?? details.engine,
    })
    .where(eq(vehicles.id, vehicleId));
  
  console.log(`\nUpdated vehicle ID ${vehicleId} with new details`);
  return true;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enrichAllVehicles() {
  // Get all vehicles that need VDP enrichment (missing any supported VDP-backed field)
  const allVehicles = await db.select().from(vehicles);
  
  console.log(`\n=== VDP ENRICHMENT ===`);
  console.log(`Total vehicles in database: ${allVehicles.length}`);
  
  // Filter to vehicles that have VDP URLs and need enrichment
  const vehiclesToEnrich = allVehicles.filter(v => 
    v.dealerVdpUrl && (
      !v.techSpecs ||
      !v.vdpDescription ||
      !v.carfaxUrl ||
      !v.exteriorColor ||
      !v.interiorColor ||
      !v.transmission ||
      !v.drivetrain ||
      !v.fuelType ||
      !v.engine
    )
  );
  
  // Also include vehicles that already have data (for re-enrichment if needed)
  const vehiclesWithData = allVehicles.filter(v => v.techSpecs || v.vdpDescription);
  
  console.log(`Vehicles already enriched: ${vehiclesWithData.length}`);
  console.log(`Vehicles needing enrichment: ${vehiclesToEnrich.length}`);
  console.log(`Vehicles without VDP URL: ${allVehicles.filter(v => !v.dealerVdpUrl).length}`);
  
  if (vehiclesToEnrich.length === 0) {
    console.log('\nNo vehicles need enrichment!');
    return;
  }
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < vehiclesToEnrich.length; i++) {
    const vehicle = vehiclesToEnrich[i];
    console.log(`\n--- [${i + 1}/${vehiclesToEnrich.length}] ${vehicle.year} ${vehicle.make} ${vehicle.model} (ID: ${vehicle.id}) ---`);
    
    if (!vehicle.dealerVdpUrl) {
      console.log('Skipping: No VDP URL');
      continue;
    }
    
    const success = await scrapeAndUpdateVehicle(vehicle.id, vehicle.dealerVdpUrl);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    
    // Wait 5 seconds between requests to avoid rate limiting
    if (i < vehiclesToEnrich.length - 1) {
      console.log('Waiting 5 seconds before next request...');
      await sleep(5000);
    }
  }
  
  console.log(`\n=== ENRICHMENT COMPLETE ===`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

enrichAllVehicles().catch(console.error);
