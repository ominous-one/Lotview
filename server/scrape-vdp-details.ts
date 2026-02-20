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
}

function extractVDPDetails($: cheerio.CheerioAPI): VDPDetails {
  let vdpDescription: string | null = null;
  const carfaxBadges: string[] = [];
  let techSpecs: TechSpecs | null = null;

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
  const pageHtml = $.html().toLowerCase();
  
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
    if (pageHtml.includes(pattern) && !carfaxBadges.includes(badge)) {
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

  return { vdpDescription, carfaxBadges, techSpecs };
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
  await db.update(vehicles)
    .set({
      vdpDescription: details.vdpDescription,
      carfaxBadges: details.carfaxBadges.length > 0 ? details.carfaxBadges : null,
      techSpecs: details.techSpecs ? JSON.stringify(details.techSpecs) : null
    })
    .where(eq(vehicles.id, vehicleId));
  
  console.log(`\nUpdated vehicle ID ${vehicleId} with new details`);
  return true;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enrichAllVehicles() {
  // Get all vehicles that need VDP enrichment (missing techSpecs or vdpDescription)
  const allVehicles = await db.select().from(vehicles);
  
  console.log(`\n=== VDP ENRICHMENT ===`);
  console.log(`Total vehicles in database: ${allVehicles.length}`);
  
  // Filter to vehicles that have VDP URLs and need enrichment
  const vehiclesToEnrich = allVehicles.filter(v => 
    v.dealerVdpUrl && (!v.techSpecs || !v.vdpDescription)
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
