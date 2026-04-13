import type { MarketListing, Vehicle } from '@shared/schema';
import { MarketAggregationService } from './market-aggregation-service';
import { storage } from './storage';
import { decodeVinCheapHybrid, type NormalizedVehicleSpec } from './vin-decode-router';
import { conditionForDisplay, normalizeCondition } from './condition-normalization';
import { extractDrivetrainFromText, scoreComp, sourceScore } from './comps-scoring';
import type { NormalizedComp, CompScoreExplain, TrimMatchMode, AppraisalProofPoint } from './comps-types';

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
    confidence: 'high' | 'medium' | 'low';
    notes: string[];
    proof: {
      exactTrimMatchCount: number;
      drivetrainMatchCount: number;
      drivetrainMismatchCount: number;
      freshCompCount: number;
      sourceDiversity: number;
      averageScore: number;
      topEvidence: AppraisalProofPoint[];
    };
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

function dataQualityScore(listing: MarketListing): number {
  let score = 0;
  if (listing.trim) score += 2;
  if (listing.mileage && listing.mileage > 0) score += 2;
  if (listing.daysOnLot && listing.daysOnLot > 0) score += 1;
  if (listing.exteriorColor || listing.interiorColor) score += 1;
  if (listing.vin) score += 1;
  if (typeof listing.sourceConfidence === 'number') score += listing.sourceConfidence >= 80 ? 2 : listing.sourceConfidence >= 60 ? 1 : 0;
  if (listing.historyBadges) score += 1;
  return Math.min(10, score);
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
    drivetrain: extractDrivetrainFromText((() => {
      try {
        const specs = listing.specsJson ? JSON.parse(listing.specsJson) : null;
        return specs?.drivetrain ?? specs?.driveType ?? listing.trim ?? undefined;
      } catch {
        return listing.trim ?? undefined;
      }
    })()),
    price: listing.price,
    mileageKm: listing.mileage ?? undefined,
    daysOnLot: listing.daysOnLot ?? undefined,
    scrapedAt: listing.scrapedAt ?? undefined,
    sourceConfidence: listing.sourceConfidence ?? undefined,
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
      summary: {
        count: 0,
        confidence: 'low',
        notes: ['VIN decode did not yield enough vehicle identity for comparable matching.'],
        proof: {
          exactTrimMatchCount: 0,
          drivetrainMatchCount: 0,
          drivetrainMismatchCount: 0,
          freshCompCount: 0,
          sourceDiversity: 0,
          averageScore: 0,
          topEvidence: [],
        },
      },
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
      subjectDrivetrain: spec.drivetrain,
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
  const exactTrimMatches = top.filter((x) => x.score.reasons.includes('Exact trim match')).length;
  const drivetrainMismatches = top.filter((x) => x.score.reasons.some((r) => r.startsWith('Drivetrain mismatch'))).length;
  const staleComps = top.filter((x) => x.score.components.freshness <= 2).length;
  const freshCompCount = top.length - staleComps;
  const sourceDiversity = new Set(top.map((x) => x.comp.source)).size;
  const avgScore = top.length ? Math.round(top.reduce((sum, item) => sum + item.score.total, 0) / top.length) : 0;
  const drivetrainMatchCount = top.filter((x) => x.score.reasons.some((r) => r.startsWith('Drivetrain match'))).length;
  const notes: string[] = [];
  if (top.length < 5) notes.push('Small comparable set; treat appraisal as directional.');
  if (spec.trim && exactTrimMatches === 0) notes.push('No exact trim matches found in current comp set.');
  if (!spec.trim || spec.trimConfidence === 'low' || spec.trimConfidence === 'unknown') notes.push('VIN trim decode confidence is limited; verify trim/options before hard pricing decisions.');
  if (spec.drivetrain && drivetrainMismatches === top.length && top.length > 0) notes.push('All top comps disagree on drivetrain with the decoded VIN spec.');
  if (drivetrainMismatches > 0) notes.push(`${drivetrainMismatches} top comps have drivetrain mismatches.`);
  if (staleComps > Math.floor(top.length / 3)) notes.push('Several top comps are stale; refresh market scan before desking aggressively.');
  if (sourceDiversity <= 1 && top.length > 0) notes.push('Most comps came from a single source/marketplace.');
  const confidence: 'high' | 'medium' | 'low' =
    top.length >= 8
      && avgScore >= 75
      && exactTrimMatches >= Math.max(1, Math.floor(top.length / 3))
      && freshCompCount >= Math.max(5, Math.floor(top.length * 0.6))
      && drivetrainMismatches <= Math.floor(top.length / 4)
      && sourceDiversity >= 2
      && (spec.trimConfidence === 'high' || spec.trimConfidence === 'medium')
      ? 'high'
      : top.length >= 4
          && avgScore >= 60
          && drivetrainMismatches < top.length
          && freshCompCount >= Math.max(2, Math.floor(top.length / 2))
        ? 'medium'
        : 'low';

  const topEvidence: AppraisalProofPoint[] = top.slice(0, 5).map((item) => ({
    listingUrl: item.comp.listingUrl,
    source: item.comp.source,
    sellerName: item.comp.sellerName,
    price: item.comp.price,
    trim: item.comp.trim,
    drivetrain: item.comp.drivetrain,
    score: item.score.total,
    reasons: item.score.reasons.slice(0, 4),
  }));

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
      confidence,
      notes,
      proof: {
        exactTrimMatchCount: exactTrimMatches,
        drivetrainMatchCount,
        drivetrainMismatchCount: drivetrainMismatches,
        freshCompCount,
        sourceDiversity,
        averageScore: avgScore,
        topEvidence,
      },
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
