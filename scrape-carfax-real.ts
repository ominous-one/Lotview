/**
 * scrape-carfax-real.ts
 * 
 * Scrapes REAL Carfax Canada report data for all Olympic Hyundai vehicles.
 * 
 * Approach:
 * 1. Get Carfax Auth0 token via dealer site's WP AJAX endpoint (through ZenRows)
 * 2. Call Carfax Canada Badge API to get badges + encrypted VHR report URLs per VIN
 * 3. Scrape the actual VHR report pages via ZenRows for detailed data
 * 4. Store everything in the carfax_reports table and update vehicles.carfax_url
 * 
 * Usage: npx tsx scrape-carfax-real.ts
 */

import { Client } from 'pg';
import * as cheerio from 'cheerio';

const ZENROWS_KEY = '21d69e232a816cc1ba00d492273289141fbc1d8f';
const DB_URL = 'postgresql://lotview:5KdItEyPBMM2jdiwXPkMrXSsFld9kEha@dpg-d6etlto8tnhs73emduk0-a.oregon-postgres.render.com/lotview?sslmode=require';
const DEALER_AJAX_URL = 'https://www.olympichyundaivancouver.com/wp-admin/admin-ajax.php';
const CARFAX_BADGE_API = 'https://badgingapi.carfax.ca/api/v3/badges';
const CARFAX_COMPANY_ID = '33267';

// Rate limiting
const BADGE_DELAY_MS = 500;
const VHR_DELAY_MS = 3000; // ZenRows JS render is expensive/slow
const MAX_VHR_SCRAPES = 50; // Limit ZenRows usage

interface BadgeData {
  vin: string;
  badges: string[];
  vhrReportUrl: string | null;
  hasBadge: boolean;
  reportNumber: number | null;
}

interface VhrReportData {
  accidentCount: number;
  ownerCount: number;
  serviceRecordCount: number;
  lastReportedOdometer: number | null;
  lastReportedDate: string | null;
  damageReported: boolean;
  lienReported: boolean;
  registrationHistory: any[];
  serviceHistory: any[];
  accidentHistory: any[];
  ownershipHistory: any[];
  odometerHistory: any[];
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Step 1: Get Carfax Auth Token ─────────────────────────────────

async function getCarfaxAuthToken(): Promise<string> {
  console.log('🔑 Getting Carfax auth token via ZenRows...');
  
  // First get a fresh nonce from the dealer site
  const pageUrl = `https://api.zenrows.com/v1/?apikey=${ZENROWS_KEY}&url=${encodeURIComponent('https://www.olympichyundaivancouver.com/vehicles/?sale_class=used')}&js_render=true&wait=5000`;
  const pageResp = await fetch(pageUrl);
  const pageHtml = await pageResp.text();
  const nonceMatch = pageHtml.match(/vmsNonce\s*=\s*\{[^}]*nonce['":\s]+['"]([^'"]+)['"]/);
  
  if (!nonceMatch) {
    throw new Error('Could not extract vmsNonce from dealer site');
  }
  const nonce = nonceMatch[1];
  console.log(`  Nonce: ${nonce}`);
  
  // Call get_carfax_auth via ZenRows POST
  const authResp = await fetch(
    `https://api.zenrows.com/v1/?apikey=${ZENROWS_KEY}&url=${encodeURIComponent(DEALER_AJAX_URL)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `action=get_carfax_auth&nonce=${nonce}&Language=en`
    }
  );
  
  const authText = await authResp.text();
  const authData = JSON.parse(authText);
  
  if (!authData.token) {
    throw new Error(`Failed to get Carfax auth token: ${authText.substring(0, 200)}`);
  }
  
  console.log(`  ✅ Got token (expires: ${authData.expiry || 'unknown'})`);
  return authData.token;
}

// ─── Step 2: Get Badge Data from Carfax API ────────────────────────

async function getBadgeData(token: string, vin: string): Promise<BadgeData> {
  const url = `${CARFAX_BADGE_API}?CompanyId=${CARFAX_COMPANY_ID}&Language=en&Vin=${vin}`;
  
  const resp = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!resp.ok) {
    console.log(`  ⚠ Badge API error for ${vin}: ${resp.status}`);
    return { vin, badges: [], vhrReportUrl: null, hasBadge: false, reportNumber: null };
  }
  
  const data = await resp.json();
  
  if (data.ResultCode !== 1 || !data.ResponseData?.Badges?.[0]) {
    console.log(`  ⚠ No badge data for ${vin}: ${data.ResultMessage}`);
    return { vin, badges: [], vhrReportUrl: null, hasBadge: false, reportNumber: null };
  }
  
  const badge = data.ResponseData.Badges[0];
  
  return {
    vin,
    badges: (badge.BadgeList || []).map((b: any) => b.BadgeName),
    vhrReportUrl: badge.VhrReportUrl || null,
    hasBadge: badge.HasBadge || false,
    reportNumber: badge.ReportNumber || null,
  };
}

// ─── Step 3: Scrape VHR Report Page ────────────────────────────────

async function scrapeVhrReport(vhrUrl: string): Promise<VhrReportData | null> {
  try {
    const url = `https://api.zenrows.com/v1/?apikey=${ZENROWS_KEY}&url=${encodeURIComponent(vhrUrl)}&js_render=true&wait=10000`;
    const resp = await fetch(url);
    const html = await resp.text();
    
    if (html.length < 1000) {
      console.log(`  ⚠ VHR page too short (${html.length} chars)`);
      return null;
    }
    
    const $ = cheerio.load(html);
    $('script, style').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    
    return parseVhrText(text);
  } catch (err: any) {
    console.log(`  ⚠ VHR scrape error: ${err.message}`);
    return null;
  }
}

function parseVhrText(text: string): VhrReportData {
  // Accident/Damage
  const noAccidents = /no accident\/damage records found/i.test(text);
  const accidentMatches = text.match(/(\d+)\s*accident/i);
  const accidentCount = noAccidents ? 0 : (accidentMatches ? parseInt(accidentMatches[1]) : 0);
  const damageReported = !noAccidents && (/damage.*reported|reported.*damage|accident.*damage.*record/i.test(text) && !/no accident/i.test(text));
  
  // Owners - count "Owner Reported" occurrences in detailed history, or "New Owner reported"
  const ownerMatches = text.match(/(?:first|new)\s+owner\s+reported/gi) || [];
  const ownerCount = ownerMatches.length || 1;
  
  // Service Records
  const serviceCountMatch = text.match(/(\d+)\s*service\s*records?\s*found/i);
  const serviceRecordCount = serviceCountMatch ? parseInt(serviceCountMatch[1]) : 0;
  
  // Last Reported Odometer
  const lastOdometerMatch = text.match(/last\s*reported\s*odometer[:\s]*([0-9,]+)\s*km/i);
  const lastReportedOdometer = lastOdometerMatch ? parseInt(lastOdometerMatch[1].replace(/,/g, '')) : null;
  
  // Lien
  const lienReported = /lien/i.test(text) && !/no.*lien/i.test(text);
  
  // Parse service history entries
  const serviceHistory: any[] = [];
  const serviceRegex = /(\d{4}\s+\w+\s+\d{1,2})\s+Odometer:\s*([0-9,]+)\s*KM\s+Source:\s*([^\n]+?)(?:\s+Record Type:\s*Service Record)?\s+Details?:\s*([\s\S]*?)(?=\d{4}\s+\w+\s+\d{1,2}\s+Odometer|Date\s+Odometer|$)/gi;
  // Simpler approach: extract from the "Service Records" section
  const serviceSection = text.match(/Service Records[\s\S]*?(?=Open Recalls|Stolen|Import|U\.S\. History|$)/i)?.[0] || '';
  const serviceEntries = serviceSection.match(/(\d{4})\s+(\w+\s+\d{1,2})\s+Odometer:\s*([0-9,]+)\s*KM\s+Source:\s*(.+?)(?:Details:|Record Type:)\s*(.*?)(?=\d{4}\s+\w+\s+\d{1,2}|Date\s+Odometer|$)/gi) || [];
  
  // Parse odometer history from detailed section
  const odometerHistory: any[] = [];
  const odometerRegex = /(\d{4})\s+(\w+\s+\d{1,2})\s+(?:Odometer:\s*)?([0-9,]+)\s*KM/gi;
  let match;
  const seenOdometers = new Set<string>();
  while ((match = odometerRegex.exec(text)) !== null) {
    const date = `${match[1]} ${match[2]}`;
    const reading = parseInt(match[3].replace(/,/g, ''));
    const key = `${date}-${reading}`;
    if (!seenOdometers.has(key)) {
      seenOdometers.add(key);
      odometerHistory.push({ date, reading, source: 'Carfax Report' });
    }
  }
  
  // Parse registration history
  const registrationHistory: any[] = [];
  const regMatches = text.match(/(?:province|state)\s+of\s+(\w[\w\s]*?)(?:\s+with\s+(\w+)\s+branding)/gi) || [];
  regMatches.forEach(m => {
    const parts = m.match(/(?:province|state)\s+of\s+([\w\s]+?)(?:\s+with\s+(\w+)\s+branding)/i);
    if (parts) {
      registrationHistory.push({
        location: parts[1].trim(),
        branding: parts[2]?.trim() || 'Normal',
        event: 'Registration'
      });
    }
  });
  
  // Parse ownership from detailed history
  const ownershipHistory: any[] = [];
  const ownerEntries = text.match(/(\d{4}\s+\w+\s+\d{1,2})[\s\S]*?(?:First|New)\s+Owner\s+Reported[\s\S]*?(?:Previous Use:\s*(\w+))?/gi) || [];
  ownerEntries.forEach((entry, i) => {
    const dateMatch = entry.match(/(\d{4}\s+\w+\s+\d{1,2})/);
    const useMatch = entry.match(/Previous Use:\s*(\w+)/i);
    ownershipHistory.push({
      startDate: dateMatch?.[1] || '',
      endDate: null,
      type: useMatch?.[1] || 'Personal',
      ownerNumber: i + 1
    });
  });
  
  // Parse last reported date from report header
  const reportDateMatch = text.match(/Report Date:\s*(\w+\s+\d{1,2},?\s+\d{4})/i);
  const lastReportedDate = reportDateMatch?.[1] || null;
  
  return {
    accidentCount,
    ownerCount,
    serviceRecordCount,
    lastReportedOdometer,
    lastReportedDate,
    damageReported,
    lienReported,
    registrationHistory,
    serviceHistory,
    accidentHistory: [],
    ownershipHistory,
    odometerHistory
  };
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('🚗 Carfax Real Scraper - Olympic Hyundai Vancouver');
  console.log('=' .repeat(60));
  
  const db = new Client(DB_URL);
  await db.connect();
  console.log('✅ Connected to database');
  
  // Get all Olympic Hyundai vehicles
  const { rows: vehicles } = await db.query(`
    SELECT id, vin, dealer_vdp_url, carfax_url 
    FROM vehicles 
    WHERE dealership ILIKE '%olympic%'
    AND vin NOT LIKE 'PENDING%'
    ORDER BY id
  `);
  console.log(`📋 Found ${vehicles.length} vehicles\n`);
  
  // Step 1: Get auth token
  const token = await getCarfaxAuthToken();
  
  // Step 2: Get badge data for all vehicles
  console.log('\n📛 Fetching badge data for all vehicles...');
  const badgeResults: Map<string, BadgeData> = new Map();
  
  for (const vehicle of vehicles) {
    const vin = vehicle.vin;
    console.log(`  ${vin}...`);
    const badges = await getBadgeData(token, vin);
    badgeResults.set(vin, badges);
    console.log(`    Badges: ${badges.badges.join(', ') || 'none'} | VHR: ${badges.vhrReportUrl ? '✅' : '❌'}`);
    await sleep(BADGE_DELAY_MS);
  }
  
  // Step 3: Scrape VHR reports
  console.log('\n📄 Scraping VHR report pages...');
  let vhrCount = 0;
  const results: Map<string, { badge: BadgeData; vhr: VhrReportData | null }> = new Map();
  
  for (const vehicle of vehicles) {
    const vin = vehicle.vin;
    const badge = badgeResults.get(vin)!;
    let vhr: VhrReportData | null = null;
    
    if (badge.vhrReportUrl && vhrCount < MAX_VHR_SCRAPES) {
      console.log(`  Scraping VHR for ${vin} (${vhrCount + 1}/${MAX_VHR_SCRAPES})...`);
      vhr = await scrapeVhrReport(badge.vhrReportUrl);
      vhrCount++;
      if (vhr) {
        console.log(`    ✅ ${vhr.ownerCount} owners, ${vhr.accidentCount} accidents, ${vhr.serviceRecordCount} service records, ${vhr.lastReportedOdometer || '?'} km`);
      } else {
        console.log(`    ⚠ Could not parse VHR`);
      }
      await sleep(VHR_DELAY_MS);
    }
    
    results.set(vin, { badge, vhr });
  }
  
  // Step 4: Store results in database
  console.log('\n💾 Storing results in database...');
  
  for (const vehicle of vehicles) {
    const vin = vehicle.vin;
    const { badge, vhr } = results.get(vin)!;
    
    // Update carfax_url on the vehicle
    if (badge.vhrReportUrl) {
      await db.query(
        `UPDATE vehicles SET carfax_url = $1 WHERE id = $2`,
        [badge.vhrReportUrl, vehicle.id]
      );
    }
    
    // Update carfax_badges
    if (badge.badges.length > 0) {
      await db.query(
        `UPDATE vehicles SET carfax_badges = $1 WHERE id = $2`,
        [badge.badges, vehicle.id]
      );
    }
    
    // Get dealership_id
    const { rows: [dealerRow] } = await db.query(
      `SELECT dealership_id FROM vehicles WHERE id = $1`, [vehicle.id]
    );
    const dealershipId = dealerRow?.dealership_id;
    
    // Delete existing and insert fresh
    await db.query(`DELETE FROM carfax_reports WHERE vin = $1`, [vin]);
    await db.query(`
      INSERT INTO carfax_reports (
        vehicle_id, dealership_id, vin, report_url,
        accident_count, owner_count, service_record_count,
        last_reported_odometer, last_reported_date,
        damage_reported, lien_reported,
        registration_history, service_history, accident_history,
        ownership_history, odometer_history,
        full_report_data, badges,
        scraped_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9,
        $10, $11,
        $12, $13, $14,
        $15, $16,
        $17, $18,
        NOW(), NOW(), NOW()
      )
    `, [
      vehicle.id,
      dealershipId,
      vin,
      badge.vhrReportUrl,
      vhr?.accidentCount ?? 0,
      vhr?.ownerCount ?? 0,
      vhr?.serviceRecordCount ?? 0,
      vhr?.lastReportedOdometer ?? null,
      vhr?.lastReportedDate ?? null,
      vhr?.damageReported ?? false,
      vhr?.lienReported ?? false,
      JSON.stringify(vhr?.registrationHistory ?? []),
      JSON.stringify(vhr?.serviceHistory ?? []),
      JSON.stringify(vhr?.accidentHistory ?? []),
      JSON.stringify(vhr?.ownershipHistory ?? []),
      JSON.stringify(vhr?.odometerHistory ?? []),
      JSON.stringify({
        badgeApiResponse: { badges: badge.badges, hasBadge: badge.hasBadge, reportNumber: badge.reportNumber },
        vhrScraped: !!vhr,
        scrapedAt: new Date().toISOString()
      }),
      badge.badges.length > 0 ? badge.badges : []
    ]);
    
    console.log(`  ✅ ${vin}: saved`);
  }
  
  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 Summary:');
  console.log(`  Total vehicles: ${vehicles.length}`);
  console.log(`  Badges found: ${[...badgeResults.values()].filter(b => b.hasBadge).length}`);
  console.log(`  VHR URLs found: ${[...badgeResults.values()].filter(b => b.vhrReportUrl).length}`);
  console.log(`  VHR reports scraped: ${vhrCount}`);
  console.log(`  Reports stored: ${vehicles.length}`);
  
  await db.end();
  console.log('\n✅ Done!');
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
