import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';
import { cookieStore } from './cloudflare-bypass/cookie-store';
import { generateRandomFingerprint, applyFingerprint, randomDelay, humanLikeScroll } from './cloudflare-bypass/browser-utils';
import { proxyManager } from './cloudflare-bypass/proxy-manager';

puppeteer.use(StealthPlugin());

export interface CarfaxReportData {
  reportUrl: string;
  vin: string;
  accidentCount: number;
  ownerCount: number;
  serviceRecordCount: number;
  lastReportedOdometer: number | null;
  lastReportedDate: string | null;
  damageReported: boolean;
  lienReported: boolean;
  registrationHistory: { date: string; location: string; event: string }[];
  serviceHistory: { date: string; location: string; description: string; odometer: number | null }[];
  accidentHistory: { date: string; description: string; severity: string }[];
  ownershipHistory: { startDate: string; endDate: string | null; location: string; type: string }[];
  odometerHistory: { date: string; reading: number; source: string }[];
  fullReportData: Record<string, unknown>;
  badges: string[];
}

interface CarfaxBadgeApiResponse {
  ResponseData?: {
    Badges?: Array<{
      BadgeList?: Array<{
        BadgeName?: string | null;
        BadgeType?: number | null;
        BadgeImageUrl?: string | null;
      }> | null;
      VhrReportUrl?: string | null;
      VIN?: string | null;
      ResultCode?: number | null;
      ResultMessage?: string | null;
    }>;
    Language?: string;
    LogoUrl?: string | null;
  };
  ResultCode?: number;
  ResultMessage?: string;
}

export async function resolveCarfaxReportUrlFromVdpHtml(
  vdpUrl: string,
  html: string,
  vin: string
): Promise<{ reportUrl: string | null; badges: string[] }> {
  if (!vdpUrl || !html || !vin) {
    return { reportUrl: null, badges: [] };
  }

  const parsedVdpUrl = new URL(vdpUrl);
  const accountIdMatch =
    html.match(/"carfaxAccountId":"(\d+)"/i) ||
    html.match(/carfaxAccountId["']?\s*:\s*["']?(\d+)["']?/i);
  const nonceMatch =
    html.match(/"carfaxNonce":"([a-z0-9]+)"/i) ||
    html.match(/carfaxNonce["']?\s*:\s*["']?([a-z0-9]+)["']?/i);

  const accountId = accountIdMatch?.[1];
  const carfaxNonce = nonceMatch?.[1];
  if (!accountId || !carfaxNonce) {
    return { reportUrl: null, badges: [] };
  }

  const authResponse = await fetch(`${parsedVdpUrl.origin}/wp-admin/admin-ajax.php`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Origin': parsedVdpUrl.origin,
      'Referer': `${parsedVdpUrl.origin}/`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    },
    body: new URLSearchParams({
      action: 'get_carfax_auth',
      nonce: carfaxNonce,
      Language: 'en',
    }),
  });

  if (!authResponse.ok) {
    return { reportUrl: null, badges: [] };
  }

  const authJson = await authResponse.json() as { token?: string };
  if (!authJson.token) {
    return { reportUrl: null, badges: [] };
  }

  const badgeUrl = `https://badgingapi.carfax.ca/api/v3/badges?CompanyId=${encodeURIComponent(accountId)}&Language=en&Vin=${encodeURIComponent(vin)}&HideVin=false`;
  const badgeResponse = await fetch(badgeUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${authJson.token}`,
      'Origin': parsedVdpUrl.origin,
      'Referer': `${parsedVdpUrl.origin}/`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    },
  });

  if (!badgeResponse.ok) {
    return { reportUrl: null, badges: [] };
  }

  const payload = await badgeResponse.json() as CarfaxBadgeApiResponse;
  return {
    reportUrl: extractVhrUrlFromBadgePayloads([payload]),
    badges: extractBadgesFromBadgePayloads([payload]),
  };
}

/**
 * Scrape a Carfax report page from vhr.carfax.ca
 * Uses Puppeteer with stealth to render the page, then Cheerio to parse it.
 */
export async function scrapeCarfaxReport(carfaxUrl: string): Promise<CarfaxReportData | null> {
  if (!carfaxUrl || !carfaxUrl.includes('carfax')) {
    console.log('  ⚠ Invalid Carfax URL:', carfaxUrl);
    return null;
  }

  console.log(`  🔍 Scraping Carfax report: ${carfaxUrl}`);

  const proxy = proxyManager.getNext();

  const launchOptions: any = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
  };

  if (proxy) {
    launchOptions.args.push(`--proxy-server=${proxy.server}`);
  }

  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    if (proxy) {
      await proxyManager.authenticateProxy(page, proxy);
    }

    const fingerprint = generateRandomFingerprint();
    await applyFingerprint(page, fingerprint);

    // Load saved cookies for carfax domain
    const savedCookies = await cookieStore.loadCookies('carfax.ca');
    if (savedCookies) {
      await page.setCookie(...savedCookies);
    }

    await randomDelay(500, 1500);

    const response = await page.goto(carfaxUrl, { waitUntil: 'networkidle2', timeout: 45000 });

    if (!response || response.status() >= 400) {
      console.log(`  ⚠ Carfax page returned status ${response?.status()}`);
      return null;
    }

    // Scroll to trigger lazy-loaded content
    await humanLikeScroll(page);
    await randomDelay(2000, 4000);

    // Save cookies for future requests
    const cookies = await page.cookies();
    if (cookies.length > 0) {
      await cookieStore.saveCookies('carfax.ca', cookies);
    }

    // Get rendered HTML
    const html = await page.content();
    const result = parseCarfaxHtml(html, carfaxUrl);

    console.log(`  ✓ Carfax report parsed: ${result.ownerCount} owners, ${result.accidentCount} accidents, ${result.serviceRecordCount} service records`);

    return result;
  } catch (error) {
    console.error('  ✗ Carfax scrape failed:', error instanceof Error ? error.message : error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Resolve the real randomized Carfax VHR URL from a dealer VDP.
 * This mirrors the dealer-side badge/modal flow instead of guessing a generic VIN URL.
 */
export async function resolveCarfaxReportUrlFromDealerVdp(
  vdpUrl: string,
  vin: string
): Promise<{ reportUrl: string | null; badges: string[] }> {
  if (!vdpUrl || !vin) {
    return { reportUrl: null, badges: [] };
  }

  const proxy = proxyManager.getNext();
  const launchOptions: any = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
  };

  if (proxy) {
    launchOptions.args.push(`--proxy-server=${proxy.server}`);
  }

  let browser;
  try {
    const parsedVdpUrl = new URL(vdpUrl);
    const dealerHost = parsedVdpUrl.hostname.replace(/^www\./i, '');
    const warmupUrl = `${parsedVdpUrl.origin}/vehicles/used/`;

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    if (proxy) {
      await proxyManager.authenticateProxy(page, proxy);
    }

    try {
      const savedCookies =
        (await cookieStore.loadCookies(dealerHost)) ||
        (dealerHost !== parsedVdpUrl.hostname ? await cookieStore.loadCookies(parsedVdpUrl.hostname) : null);
      if (savedCookies?.length) {
        await page.setCookie(...savedCookies);
      }
    } catch {
      // Cookie reuse is opportunistic only.
    }

    const badgeResponses: CarfaxBadgeApiResponse[] = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (!/badgingapi\.carfax\.ca\/api\/v3\/badges/i.test(url)) return;
      if (!url.toUpperCase().includes(vin.toUpperCase())) return;
      try {
        const json = await response.json() as CarfaxBadgeApiResponse;
        badgeResponses.push(json);
      } catch {
        // Ignore parse failures and fall back to direct page-side fetch below.
      }
    });

    // Warm the dealer session first. Olympic VDPs will often challenge a cold direct VDP hit.
    await page.goto(warmupUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await randomDelay(4000, 6000);
    try {
      const cookies = await page.cookies();
      if (cookies.length > 0) {
        await cookieStore.saveCookies(dealerHost, cookies);
      }
    } catch {
      // Non-fatal.
    }

    await page.goto(vdpUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await randomDelay(2500, 4000);

    try {
      await page.click('.carfax-badge__trigger', { delay: 60 });
      await randomDelay(2000, 3500);
    } catch {
      // Some dealers do not expose the badge trigger as a clickable image.
      // The direct badge API fallback below handles that case.
    }

    let resolved = extractVhrUrlFromBadgePayloads(badgeResponses);
    let badges = extractBadgesFromBadgePayloads(badgeResponses);

    if (!resolved) {
      const html = await page.content();
      const fallback = await resolveCarfaxReportUrlFromVdpHtml(vdpUrl, html, vin);
      if (fallback.reportUrl) {
        resolved = fallback.reportUrl;
        badges = dedupeMeaningfulBadges([...badges, ...fallback.badges]);
      }
    }

    return {
      reportUrl: resolved,
      badges,
    };
  } catch (error) {
    console.error('  ✗ Failed to resolve Carfax report URL from dealer VDP:', error instanceof Error ? error.message : error);
    return { reportUrl: null, badges: [] };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Parse Carfax HTML using Cheerio to extract structured report data.
 */
function parseCarfaxHtml(html: string, reportUrl: string): CarfaxReportData {
  const $ = cheerio.load(html);
  const textContent = $('body').text().toLowerCase();

  // Extract VIN
  let vin = '';
  const vinMatch = textContent.match(/vin[:\s]+([A-HJ-NPR-Z0-9]{17})/i) ||
    $('[data-vin]').attr('data-vin')?.match(/([A-HJ-NPR-Z0-9]{17})/);
  if (vinMatch) {
    vin = vinMatch[1] || vinMatch[0];
  }
  // Fallback: try to extract from URL
  if (!vin) {
    const urlVin = reportUrl.match(/([A-HJ-NPR-Z0-9]{17})/);
    if (urlVin) vin = urlVin[1];
  }

  // Extract badges from badge images/sections
  const badges: string[] = [];
  $('img[src*="badge"], img[alt*="badge"], .badge, .report-badge, [class*="badge"]').each((_, el) => {
    const alt = ($(el).attr('alt') || '').trim();
    const src = ($(el).attr('src') || '').toLowerCase();
    const text = $(el).text().trim();

    const badgeText = normalizeMeaningfulBadgeText(alt || text || src);
    if (badgeText && !badges.includes(badgeText)) {
      badges.push(badgeText);
    }

    // Parse from known badge filenames
    if (src.includes('oneowner') || src.includes('one-owner')) addBadge(badges, 'One Owner');
    if (src.includes('accidentfree') || src.includes('noaccident')) addBadge(badges, 'No Reported Accidents');
    if (src.includes('servicehistory') || src.includes('service-history')) addBadge(badges, 'Service History');
    if (src.includes('lowkilometer') || src.includes('lowmileage')) addBadge(badges, 'Low Kilometers');
  });

  // Also check text for badge-like keywords
  if (textContent.includes('no reported accidents') || textContent.includes('no accident')) {
    addBadge(badges, 'No Reported Accidents');
  }
  if (textContent.includes('one owner') || textContent.includes('1 owner')) {
    addBadge(badges, 'One Owner');
  }
  const normalizedBadges = dedupeMeaningfulBadges(badges);

  // Extract accident info
  const accidentHistory = parseAccidentHistory($);
  const hasNoAccidentBadge = normalizedBadges.includes('No Reported Accidents');
  const accidentCount = hasNoAccidentBadge ? 0 : accidentHistory.length;
  const damageReported =
    hasNoAccidentBadge
      ? false
      : accidentCount > 0 || (textContent.includes('damage reported') && !textContent.includes('no reported accidents'));

  // Extract ownership history
  const ownershipHistory = parseOwnershipHistory($);
  const ownerCount = ownershipHistory.length || extractNumberNear($, textContent, 'owner') || (normalizedBadges.includes('One Owner') ? 1 : 0);

  // Extract service history
  const serviceHistory = parseServiceHistory($);
  const serviceRecordCount = serviceHistory.length;

  // Extract odometer history
  const odometerHistory = parseOdometerHistory($);
  const lastOdometer = odometerHistory.length > 0
    ? odometerHistory[odometerHistory.length - 1]
    : null;

  // Extract registration history
  const registrationHistory = parseRegistrationHistory($);

  // Check for liens
  const lienReported = textContent.includes('lien') && !textContent.includes('no lien');

  const result: CarfaxReportData = {
    reportUrl,
    vin,
    accidentCount,
    ownerCount: ownerCount || 0,
    serviceRecordCount,
    lastReportedOdometer: lastOdometer?.reading ?? null,
    lastReportedDate: lastOdometer?.date ?? null,
    damageReported,
    lienReported,
    registrationHistory,
    serviceHistory,
    accidentHistory,
    ownershipHistory,
    odometerHistory,
    fullReportData: {
      scrapedUrl: reportUrl,
      vin,
      pageTitle: $('title').text().trim(),
      badges: normalizedBadges,
      accidentCount,
      ownerCount,
      serviceRecordCount,
      lienReported,
      damageReported,
    },
    badges: normalizedBadges,
  };

  return result;
}

function normalizeMeaningfulBadgeText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  if (!text) return null;
  if (lower.includes('one owner')) return 'One Owner';
  if (lower.includes('oneowner')) return 'One Owner';
  if (lower.includes('no reported accidents')) return 'No Reported Accidents';
  if (lower.includes('accident free') || lower.includes('accidentfree') || lower.includes('no accident')) return 'No Reported Accidents';
  if (lower.includes('service history') || lower.includes('servicehistory')) return 'Service History';
  if (lower.includes('low kilometer') || lower.includes('low kilometre') || lower.includes('low mileage') || lower.includes('lowkilometer')) return 'Low Kilometers';
  return null;
}

function dedupeMeaningfulBadges(badges: string[]): string[] {
  const normalized = badges
    .map((badge) => normalizeMeaningfulBadgeText(badge) || badge)
    .filter((badge) => ['One Owner', 'No Reported Accidents', 'Service History', 'Low Kilometers'].includes(badge));
  return [...new Set(normalized)];
}

function extractVhrUrlFromBadgePayloads(payloads: CarfaxBadgeApiResponse[]): string | null {
  for (const payload of payloads) {
    const badges = payload?.ResponseData?.Badges || [];
    for (const badge of badges) {
      if (badge?.VhrReportUrl) {
        return badge.VhrReportUrl;
      }
    }
  }
  return null;
}

function extractBadgesFromBadgePayloads(payloads: CarfaxBadgeApiResponse[]): string[] {
  const out: string[] = [];
  for (const payload of payloads) {
    const badges = payload?.ResponseData?.Badges || [];
    for (const badge of badges) {
      for (const item of badge?.BadgeList || []) {
        const normalized = normalizeMeaningfulBadgeText(item?.BadgeName || item?.BadgeImageUrl || null);
        if (normalized) {
          out.push(normalized);
        }
      }
    }
  }
  return dedupeMeaningfulBadges(out);
}

function addBadge(badges: string[], badge: string) {
  if (!badges.includes(badge)) {
    badges.push(badge);
  }
}

/**
 * Extract a number near a keyword (e.g. "2 owners")
 */
function extractNumberNear($: cheerio.CheerioAPI, text: string, keyword: string): number {
  const regex = new RegExp(`(\\d+)\\s*${keyword}`, 'i');
  const match = text.match(regex);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Parse accident/damage history section
 */
function parseAccidentHistory($: cheerio.CheerioAPI): { date: string; description: string; severity: string }[] {
  const accidents: { date: string; description: string; severity: string }[] = [];

  // Look for accident sections by common selectors
  const accidentSelectors = [
    '#accident-damage-section',
    '[data-section="accident"]',
    '.accident-section',
    'section:has(h2:contains("Accident")), section:has(h3:contains("Accident"))',
    'div:has(h2:contains("Damage")), div:has(h3:contains("Damage"))',
  ];

  for (const selector of accidentSelectors) {
    try {
      $(selector).find('tr, .record, .history-item, .event-row').each((_, row) => {
        const cells = $(row).find('td, .cell, .field');
        const rowText = $(row).text().trim();

        if (cells.length >= 2) {
          const date = $(cells[0]).text().trim();
          const desc = $(cells[1]).text().trim();
          const severity = cells.length >= 3 ? $(cells[2]).text().trim() : 'Unknown';
          if (date && desc) {
            accidents.push({ date, description: desc, severity });
          }
        } else if (rowText) {
          const dateMatch = rowText.match(/(\d{4}[-/]\d{2}[-/]\d{2}|\w+\s+\d{1,2},?\s+\d{4})/);
          if (dateMatch) {
            accidents.push({
              date: dateMatch[1],
              description: rowText.replace(dateMatch[1], '').trim(),
              severity: 'Unknown',
            });
          }
        }
      });
      if (accidents.length > 0) break;
    } catch { /* selector not found, try next */ }
  }

  return accidents;
}

/**
 * Parse ownership history section
 */
function parseOwnershipHistory($: cheerio.CheerioAPI): { startDate: string; endDate: string | null; location: string; type: string }[] {
  const owners: { startDate: string; endDate: string | null; location: string; type: string }[] = [];

  const ownerSelectors = [
    '#ownership-section',
    '[data-section="ownership"]',
    '.ownership-section',
    'section:has(h2:contains("Owner")), section:has(h3:contains("Owner"))',
  ];

  for (const selector of ownerSelectors) {
    try {
      $(selector).find('tr, .record, .history-item, .owner-record').each((_, row) => {
        const cells = $(row).find('td, .cell, .field');
        const rowText = $(row).text().trim();

        if (cells.length >= 2) {
          const dateRange = $(cells[0]).text().trim();
          const location = $(cells[1]).text().trim();
          const type = cells.length >= 3 ? $(cells[2]).text().trim() : 'Personal';
          const dates = dateRange.split(/\s*[-–to]+\s*/);
          owners.push({
            startDate: dates[0] || '',
            endDate: dates[1] || null,
            location,
            type,
          });
        } else if (rowText && rowText.toLowerCase().includes('owner')) {
          owners.push({
            startDate: '',
            endDate: null,
            location: rowText,
            type: 'Personal',
          });
        }
      });
      if (owners.length > 0) break;
    } catch { /* selector not found, try next */ }
  }

  return owners;
}

/**
 * Parse service history section
 */
function parseServiceHistory($: cheerio.CheerioAPI): { date: string; location: string; description: string; odometer: number | null }[] {
  const services: { date: string; location: string; description: string; odometer: number | null }[] = [];

  const serviceSelectors = [
    '#service-section',
    '[data-section="service"]',
    '.service-section',
    'section:has(h2:contains("Service")), section:has(h3:contains("Service"))',
  ];

  for (const selector of serviceSelectors) {
    try {
      $(selector).find('tr, .record, .history-item, .service-record').each((_, row) => {
        const cells = $(row).find('td, .cell, .field');

        if (cells.length >= 2) {
          const date = $(cells[0]).text().trim();
          const location = cells.length >= 3 ? $(cells[1]).text().trim() : '';
          const descCell = cells.length >= 3 ? cells[2] : cells[1];
          const description = $(descCell).text().trim();
          const odometerMatch = $(row).text().match(/([\d,]+)\s*(km|mi|kilometres|kilometers|miles)/i);
          const odometer = odometerMatch ? parseInt(odometerMatch[1].replace(/,/g, ''), 10) : null;

          if (date && description) {
            services.push({ date, location, description, odometer });
          }
        }
      });
      if (services.length > 0) break;
    } catch { /* selector not found, try next */ }
  }

  return services;
}

/**
 * Parse odometer readings section
 */
function parseOdometerHistory($: cheerio.CheerioAPI): { date: string; reading: number; source: string }[] {
  const readings: { date: string; reading: number; source: string }[] = [];

  const odometerSelectors = [
    '#odometer-section',
    '[data-section="odometer"]',
    '.odometer-section',
    'section:has(h2:contains("Odometer")), section:has(h3:contains("Odometer"))',
  ];

  for (const selector of odometerSelectors) {
    try {
      $(selector).find('tr, .record, .history-item').each((_, row) => {
        const cells = $(row).find('td, .cell, .field');

        if (cells.length >= 2) {
          const date = $(cells[0]).text().trim();
          const readingText = $(cells[1]).text().trim();
          const readingNum = parseInt(readingText.replace(/[^\d]/g, ''), 10);
          const source = cells.length >= 3 ? $(cells[2]).text().trim() : 'Report';

          if (date && !isNaN(readingNum)) {
            readings.push({ date, reading: readingNum, source });
          }
        }
      });
      if (readings.length > 0) break;
    } catch { /* selector not found, try next */ }
  }

  return readings;
}

/**
 * Parse registration history section
 */
function parseRegistrationHistory($: cheerio.CheerioAPI): { date: string; location: string; event: string }[] {
  const registrations: { date: string; location: string; event: string }[] = [];

  const registrationSelectors = [
    '#registration-section',
    '[data-section="registration"]',
    '.registration-section',
    'section:has(h2:contains("Registration")), section:has(h3:contains("Registration"))',
  ];

  for (const selector of registrationSelectors) {
    try {
      $(selector).find('tr, .record, .history-item').each((_, row) => {
        const cells = $(row).find('td, .cell, .field');

        if (cells.length >= 2) {
          const date = $(cells[0]).text().trim();
          const location = $(cells[1]).text().trim();
          const event = cells.length >= 3 ? $(cells[2]).text().trim() : 'Registration';

          if (date && location) {
            registrations.push({ date, location, event });
          }
        }
      });
      if (registrations.length > 0) break;
    } catch { /* selector not found, try next */ }
  }

  return registrations;
}
