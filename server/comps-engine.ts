import type { MarketListing, Vehicle } from '@shared/schema';
import { MarketAggregationService } from './market-aggregation-service';
import { storage } from './storage';
import { decodeVinCheapHybrid, type NormalizedVehicleSpec } from './vin-decode-router';
import { conditionForDisplay, normalizeCondition } from './condition-normalization';

export type TrimMatchMode = 'exact' | 'near';

export interface CompsQuery {
  dealershipId: number;
  vin: string;
  mileageKm?: number;
  postalCode: string;
  radiusKm: number;
  trimMode: TrimMatchMode;
  maxComps?: number;
  disableExternalFetches?: boolean;
}

export interface NormalizedComp {
  listingUrl: string;
  source: string;
  sellerName?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  price: number;
  mileageKm?: number;
  daysOnLot?: number;
  condition?: Exclude<import('./condition-normalization').NormalizedCondition, 'unknown'>;
  accidentHistory: 'accident_free' | 'reported' | 'unknown';
  exteriorColor?: string;
  interiorColor?: string;
}

export interface CompScoreExplain {
  total: number;
  components: {
    year: number;
    mileage: number;
    trim: number;
    source: number;
    dataQuality: number;
  };
  reasons: string[];
}

export interface ScoredComp {
  comp: NormalizedComp;
  score: CompScoreExplain;
}

export interface CompsResult {
  spec: NormalizedVehicleSpec;
  radiusKm: number;
  trimMode: TrimMatchMode;
  comps: ScoredComp[];
  summary: {
    count: number;
    medianPrice?: number;
    p25Price?: number;
    p75Price?: number;
    suggestedRetailPrice?: number;
  };
}

function median(nums: number[]): number | undefined {
  if (nums.length === 0) return undefined;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 === 0 ? Math.round((a[mid - 1] + a[mid]) / 2) : a[mid];
}

function percentile(nums: number[], p: number): number | undefined {
  if (nums.length === 0) return undefined;
  const a = [...nums].sort((x, y) => x - y);
  const idx = (a.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  return Math.round(a[lo] + (a[hi] - a[lo]) * (idx - lo));
}

function normalizeAccidentHistory(listing: MarketListing): NormalizedComp['accidentHistory'] {
  // CarGurus-derived historyBadges often include strings like "No Accidents Reported" or "Accident Reported".
  try {
    const raw = listing.historyBadges;
    if (!raw) return 'unknown';
    const badges: string[] = Array.isArray(raw) ? raw : JSON.parse(raw);
    const text = badges.join(' ').toLowerCase();
    if (text.includes('no accident') || text.includes('accident-free') || text.includes('accident free')) return 'accident_free';
    if (text.includes('accident') || text.includes('damage')) return 'reported';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function sourceScore(source?: string): number {
  const s = (source || 'unknown').toLowerCase();
  if (s.includes('marketcheck')) return 10;
  if (s.includes('cargurus')) return 9;
  if (s.includes('autotrader')) return 7;
  if (s.includes('kijiji')) return 6;
  if (s.includes('craigslist')) return 4;
  return 5;
}

function dataQualityScore(listing: MarketListing): number {
  let score = 0;
  if (listing.trim) score += 2;
  if (listing.mileage && listing.mileage > 0) score += 2;
  if (listing.daysOnLot && listing.daysOnLot > 0) score += 1;
  if (listing.exteriorColor || listing.interiorColor) score += 1;
  if (listing.vin) score += 1;
  return Math.min(10, score);
}

export function scoreComp(params: {
  subjectYear?: number;
  subjectMileageKm?: number;
  subjectTrim?: string;
  trimMode: TrimMatchMode;
  comp: NormalizedComp;
}): CompScoreExplain {
  const reasons: string[] = [];

  // Year score (0-30)
  let yearScore = 0;
  if (params.subjectYear && params.comp.year) {
    const dy = Math.abs(params.subjectYear - params.comp.year);
    yearScore = dy === 0 ? 30 : dy === 1 ? 22 : dy === 2 ? 14 : 0;
    reasons.push(`Year Δ=${dy}`);
  }

  // Mileage score (0-25)
  let mileageScore = 0;
  if (typeof params.subjectMileageKm === 'number' && typeof params.comp.mileageKm === 'number') {
    const diff = Math.abs(params.subjectMileageKm - params.comp.mileageKm);
    // 0-15k => 25, 15-40k => 18, 40-80k => 10 else 0
    mileageScore = diff <= 15000 ? 25 : diff <= 40000 ? 18 : diff <= 80000 ? 10 : 0;
    reasons.push(`Mileage Δ=${Math.round(diff/1000)}k`);
  } else {
    mileageScore = 8; // partial credit if missing
    reasons.push('Mileage missing on one side');
  }

  // Trim score (0-25)
  let trimScore = 0;
  const subjTrim = (params.subjectTrim || '').trim().toLowerCase();
  const compTrim = (params.comp.trim || '').trim().toLowerCase();
  if (!subjTrim || !compTrim) {
    trimScore = 8;
    reasons.push('Trim missing on one side');
  } else if (subjTrim === compTrim) {
    trimScore = 25;
    reasons.push('Exact trim match');
  } else {
    if (params.trimMode === 'near') {
      // soft match: share tokens
      const subjTokens = new Set(subjTrim.split(/\s+/g));
      const compTokens = new Set(compTrim.split(/\s+/g));
      const overlap = [...subjTokens].filter(t => compTokens.has(t)).length;
      trimScore = overlap >= 2 ? 18 : overlap >= 1 ? 12 : 4;
      reasons.push(`Near-trim overlap=${overlap}`);
    } else {
      trimScore = 0;
      reasons.push('Trim mismatch (exact mode)');
    }
  }

  // Source score (0-10)
  const source = sourceScore(params.comp.source);

  // Data quality (0-10)
  const dq = 0; // set by caller if needed

  const total = Math.round(yearScore + mileageScore + trimScore + source + dq);

  return {
    total,
    components: { year: yearScore, mileage: mileageScore, trim: trimScore, source, dataQuality: dq },
    reasons,
  };
}

function extractRawConditionFromListing(listing: MarketListing): unknown {
  try {
    if (listing.specsJson) {
      const j = JSON.parse(listing.specsJson);
      return j?.condition ?? j?.vehicleCondition ?? j?.overallCondition ?? null;
    }
  } catch {
    // ignore
  }
  return null;
}

function toNormalizedComp(listing: MarketListing): NormalizedComp {
  const rawCondition = extractRawConditionFromListing(listing);
  const { condition } = normalizeCondition([{ raw: rawCondition, source: listing.source }]);

  return {
    listingUrl: listing.listingUrl,
    source: listing.source,
    sellerName: listing.sellerName || undefined,
    year: listing.year,
    make: listing.make,
    model: listing.model,
    trim: listing.trim || undefined,
    price: listing.price,
    mileageKm: listing.mileage ?? undefined,
    daysOnLot: listing.daysOnLot ?? undefined,
    condition: (() => {
      const v = conditionForDisplay(condition);
      return v === "excellent" || v === "good" || v === "fair" || v === "poor" ? v : undefined;
    })(),
    accidentHistory: normalizeAccidentHistory(listing),
    exteriorColor: listing.exteriorColor || undefined,
    interiorColor: listing.interiorColor || undefined,
  };
}

async function ensureMarketListingsFresh(params: {
  dealershipId: number;
  make: string;
  model: string;
  year: number;
  postalCode: string;
  radiusKm: number;
  disableExternalFetches?: boolean;
}): Promise<void> {
  // Cache policy: if we have scraped listings in last 48h for this make/model bucket, don't refresh.
  const { listings } = await storage.getMarketListings(params.dealershipId, {
    make: params.make,
    model: params.model,
    yearMin: params.year - 1,
    yearMax: params.year + 1,
  }, 1, 0);

  const newest = listings[0]?.scrapedAt;
  const fresh = newest && (Date.now() - newest.getTime() < 1000 * 60 * 60 * 48);
  if (fresh) return;

  if (params.disableExternalFetches) return;

  const svc = new MarketAggregationService();
  await svc.aggregateMarketData({
    make: params.make,
    model: params.model,
    yearMin: params.year - 1,
    yearMax: params.year + 1,
    postalCode: params.postalCode,
    radiusKm: params.radiusKm,
    maxResults: 100,
    dealershipId: params.dealershipId,
  });
}

export async function getAppraisalComps(query: CompsQuery): Promise<CompsResult> {
  // Canada-only guardrail: postalCode required and must look like Canadian postal.
  if (!/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(query.postalCode.trim())) {
    throw new Error('Canada-only: postalCode must be a Canadian postal code');
  }

  const spec = await decodeVinCheapHybrid(query.vin, {
    dealershipId: query.dealershipId,
    allowPaidApis: false,
    disableExternalFetches: query.disableExternalFetches,
  });

  if (!spec.make || !spec.model || !spec.year) {
    return {
      spec,
      radiusKm: query.radiusKm,
      trimMode: query.trimMode,
      comps: [],
      summary: { count: 0 },
    };
  }

  await ensureMarketListingsFresh({
    dealershipId: query.dealershipId,
    make: spec.make,
    model: spec.model,
    year: spec.year,
    postalCode: query.postalCode,
    radiusKm: query.radiusKm,
    disableExternalFetches: query.disableExternalFetches,
  });

  const { listings } = await storage.getMarketListings(query.dealershipId, {
    make: spec.make,
    model: spec.model,
    yearMin: spec.year - 1,
    yearMax: spec.year + 1,
    trim: query.trimMode === 'exact' ? spec.trim : undefined,
  }, 250, 0);

  const normalized = listings
    .filter(l => l.price && l.price > 0)
    .map(toNormalizedComp);

  const scored: ScoredComp[] = normalized.map(c => {
    const base = scoreComp({
      subjectYear: spec.year,
      subjectMileageKm: query.mileageKm,
      subjectTrim: spec.trim,
      trimMode: query.trimMode,
      comp: c,
    });
    // dataQuality is derived from listing; re-score by adding component
    const listing = listings.find(l => l.listingUrl === c.listingUrl);
    const dq = listing ? dataQualityScore(listing) : 0;
    const total = Math.round(base.total + dq);
    return {
      comp: c,
      score: {
        ...base,
        total,
        components: { ...base.components, dataQuality: dq },
      },
    };
  }).sort((a, b) => b.score.total - a.score.total);

  const max = query.maxComps ?? 25;
  const top = scored.slice(0, max);

  const prices = top.map(x => x.comp.price).filter(n => typeof n === 'number' && n > 0);
  const med = median(prices);
  const p25 = percentile(prices, 0.25);
  const p75 = percentile(prices, 0.75);

  // Suggested retail: median minus small adjustment for accident-reported rate.
  const accidentRate = top.length === 0 ? 0 : top.filter(x => x.comp.accidentHistory === 'reported').length / top.length;
  const suggested = typeof med === 'number' ? Math.round(med * (1 - Math.min(0.03, accidentRate * 0.03))) : undefined;

  return {
    spec,
    radiusKm: query.radiusKm,
    trimMode: query.trimMode,
    comps: top,
    summary: {
      count: top.length,
      medianPrice: med,
      p25Price: p25,
      p75Price: p75,
      suggestedRetailPrice: suggested,
    },
  };
}

export function vehicleToSubject(vehicle: Vehicle): { vin?: string; year?: number; make?: string; model?: string; trim?: string; mileageKm?: number; price?: number; daysOnLot?: number } {
  return {
    vin: vehicle.vin || undefined,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim || undefined,
    mileageKm: vehicle.odometer || undefined,
    price: vehicle.price,
    daysOnLot: undefined,
  };
}
