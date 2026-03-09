import * as cheerio from 'cheerio';
import type { InsertMarketListing } from '@shared/schema';
import { BrowserlessUnifiedService } from './browserless-unified';

export interface ZenRowsFallbackConfig {
  enabled: boolean;
  maxCallsPerMinute: number;
  maxCallsPerHour: number;
}

type Bucket = { minute: { t: number; n: number }; hour: { t: number; n: number } };
const buckets = new Map<string, Bucket>();

function key(dealershipId: number): string {
  return String(dealershipId);
}

function now(): number {
  return Date.now();
}

function canConsume(dealershipId: number, cfg: ZenRowsFallbackConfig): boolean {
  const k = key(dealershipId);
  const b = buckets.get(k) ?? { minute: { t: now(), n: 0 }, hour: { t: now(), n: 0 } };

  const t = now();
  if (t - b.minute.t >= 60_000) b.minute = { t, n: 0 };
  if (t - b.hour.t >= 60 * 60_000) b.hour = { t, n: 0 };

  if (b.minute.n >= cfg.maxCallsPerMinute) return false;
  if (b.hour.n >= cfg.maxCallsPerHour) return false;

  b.minute.n += 1;
  b.hour.n += 1;
  buckets.set(k, b);
  return true;
}

function buildAutoTraderSearchUrl(params: {
  make: string;
  model: string;
  yearMin?: number;
  yearMax?: number;
  postalCode: string;
  radiusKm: number;
}): string {
  const normalizedMake = params.make.toLowerCase().replace(/\s+/g, '-');
  const normalizedModel = params.model.toLowerCase().replace(/\s+/g, '-');
  const baseUrl = `https://www.autotrader.ca/cars/${normalizedMake}/${normalizedModel}/`;

  const queryParams = new URLSearchParams();
  queryParams.append('rcp', '100');
  queryParams.append('rcs', '0');
  queryParams.append('srt', '35');
  queryParams.append('loc', params.postalCode.replace(/\s/g, '').toUpperCase());
  queryParams.append('prx', String(params.radiusKm));

  if (params.yearMin && params.yearMax) queryParams.append('yRng', `${params.yearMin},${params.yearMax}`);
  else if (params.yearMin) queryParams.append('yRng', `${params.yearMin},`);
  else if (params.yearMax) queryParams.append('yRng', `,${params.yearMax}`);

  return `${baseUrl}?${queryParams.toString()}`;
}

function parseAutoTraderListingsFromHtml(html: string, params: { dealershipId: number; make: string; model: string }): InsertMarketListing[] {
  const $ = cheerio.load(html);

  // AutoTrader pages change frequently. We use resilient heuristics:
  // - find links that look like listing detail pages (/a/)
  // - treat their nearest card container as a listing
  const links = $('a[href*="/a/"]');
  const seen = new Set<string>();
  const out: InsertMarketListing[] = [];

  links.each((i, el) => {
    if (out.length >= 50) return;
    const href = $(el).attr('href');
    if (!href) return;
    const listingUrl = href.startsWith('http') ? href : `https://www.autotrader.ca${href}`;
    if (seen.has(listingUrl)) return;
    seen.add(listingUrl);

    const card = $(el).closest('article').length ? $(el).closest('article') : $(el).closest('div');
    const allText = card.text().replace(/\s+/g, ' ').trim();

    const priceMatch = allText.match(/\$\s*([0-9,]+)/);
    const price = priceMatch ? parseInt(priceMatch[1].replace(/[^0-9]/g, ''), 10) : 0;
    if (!price || price < 1000) return;

    const yearMatch = allText.match(/\b(19\d{2}|20\d{2})\b/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : 0;
    if (!year) return;

    const mileageMatch = allText.match(/\b([0-9,]+)\s*km\b/i);
    const mileage = mileageMatch ? parseInt(mileageMatch[1].replace(/[^0-9]/g, ''), 10) : null;

    const img = card.find('img').first();
    const imageUrl = img.attr('src') || img.attr('data-src') || img.attr('data-lazy') || null;

    const externalIdMatch = href.match(/\/(\d+)(?:\/|$)/) || href.match(/id=(\d+)/);
    const externalId = externalIdMatch ? externalIdMatch[1] : `zenrows_autotrader_${Date.now()}_${i}`;

    // Basic title parsing: "YYYY MAKE MODEL ..."
    const titleText = ($(el).text() || allText).trim();
    const parts = titleText.split(' ').filter(Boolean);
    const make = (parts[1] || params.make).toUpperCase();
    const model = (parts[2] || params.model).toUpperCase();
    const trim = parts.slice(3).join(' ').trim() || null;

    out.push({
      dealershipId: params.dealershipId,
      externalId,
      source: 'autotrader_zenrows',
      listingType: 'dealer',
      year,
      make,
      model,
      trim,
      price,
      mileage,
      location: 'Canada',
      postalCode: null,
      latitude: null,
      longitude: null,
      sellerName: 'Unknown Seller',
      imageUrl,
      listingUrl,
      postedDate: null,
      isActive: true,
      dataSourceRank: 50,
    });
  });

  return out;
}

export async function zenrowsFallbackAggregate(params: {
  dealershipId: number;
  make: string;
  model: string;
  yearMin?: number;
  yearMax?: number;
  postalCode: string;
  radiusKm: number;
  maxResults?: number;
  config: ZenRowsFallbackConfig;
  browserlessService: BrowserlessUnifiedService;
}): Promise<{ listings: InsertMarketListing[]; used: boolean; reason?: string }> {
  if (!params.config.enabled) return { listings: [], used: false, reason: 'disabled' };
  if (!params.browserlessService.isZenRowsConfigured()) return { listings: [], used: false, reason: 'zenrows_not_configured' };

  if (!canConsume(params.dealershipId, params.config)) {
    return { listings: [], used: false, reason: 'rate_limited' };
  }

  const url = buildAutoTraderSearchUrl({
    make: params.make,
    model: params.model,
    yearMin: params.yearMin,
    yearMax: params.yearMax,
    postalCode: params.postalCode,
    radiusKm: params.radiusKm,
  });

  const res = await params.browserlessService.zenRowsScrape(url, {
    jsRender: true,
    premiumProxy: true,
    waitMs: 6000,
    proxyCountry: 'ca',
    scrollToBottom: true,
  });

  if (!res.success || !res.html) {
    return { listings: [], used: true, reason: res.error || 'zenrows_failed' };
  }

  const parsed = parseAutoTraderListingsFromHtml(res.html, {
    dealershipId: params.dealershipId,
    make: params.make,
    model: params.model,
  });

  const limited = parsed.slice(0, params.maxResults ?? 50);
  return { listings: limited, used: true };
}
