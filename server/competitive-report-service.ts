import { storage } from './storage';
import type { CompetitiveReportRun, InsertCompetitiveReportRun, InsertCompetitiveReportUnit, MarketListing, Vehicle } from '@shared/schema';
import { getAppraisalComps } from './comps-engine';
import { conditionForDisplay, normalizeCondition } from './condition-normalization';

export interface CompetitiveReportParams {
  dealershipId: number;
  radiusKm: number;
  postalCode: string;
  /**
   * When true, will not hit external sources; only uses cached DB listings.
   */
  disableExternalFetches?: boolean;
  maxVehicles?: number;
}

function median(nums: number[]): number | undefined {
  if (nums.length === 0) return undefined;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 === 0 ? Math.round((a[mid - 1] + a[mid]) / 2) : a[mid];
}

function average(nums: number[]): number | undefined {
  if (!nums.length) return undefined;
  return Math.round(nums.reduce((sum, n) => sum + n, 0) / nums.length);
}

function asAccidentHistory(listing: MarketListing): 'accident_free' | 'reported' | 'unknown' {
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

function extractRawConditionFromListing(listing: MarketListing): unknown {
  // NOTE: market_listings does not currently have a first-class condition column.
  // We attempt best-effort extraction from embedded JSON fields where some sources include it.
  try {
    if (listing.specsJson) {
      const j = JSON.parse(listing.specsJson);
      return j?.condition ?? j?.vehicleCondition ?? j?.overallCondition ?? null;
    }
  } catch {
    // ignore
  }
  try {
    if (listing.featuresJson) {
      const j = JSON.parse(listing.featuresJson);
      if (Array.isArray(j)) {
        const joined = j.join(' ');
        if (/(excellent|good|fair|poor|like\s*new)/i.test(joined)) return joined;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function normalizeComp(listing: MarketListing) {
  const rawCondition = extractRawConditionFromListing(listing);
  const { condition } = normalizeCondition([{ raw: rawCondition, source: listing.source }]);

  return {
    price: listing.price,
    daysOnLot: listing.daysOnLot ?? null,
    mileageKm: listing.mileage ?? null,
    trim: listing.trim ?? null,
    condition: conditionForDisplay(condition),
    accidentHistory: asAccidentHistory(listing),
    exteriorColor: listing.exteriorColor ?? null,
    interiorColor: listing.interiorColor ?? null,
    url: listing.listingUrl,
    source: listing.source,
    sellerName: listing.sellerName ?? null,
  };
}

export class CompetitiveReportService {
  async runCompetitiveReport(params: CompetitiveReportParams): Promise<{ run: CompetitiveReportRun; unitsCreated: number; errors: string[] }> {
    const errors: string[] = [];

    const settings = await storage.getDealershipAutomationSettings(params.dealershipId);
    const cadenceHours = settings?.competitiveReportCadenceHours ?? 48;

    // Skip if fresh
    const latest = await storage.getLatestCompetitiveReportRun(params.dealershipId, params.radiusKm);
    if (latest?.generatedAt && (Date.now() - latest.generatedAt.getTime() < 1000 * 60 * 60 * cadenceHours)) {
      return { run: latest, unitsCreated: 0, errors: [] };
    }

    const runInsert: InsertCompetitiveReportRun = {
      dealershipId: params.dealershipId,
      radiusKm: params.radiusKm,
      sources: [],
      status: 'running',
      metrics: null,
      error: null,
    } as any;

    const run = await storage.createCompetitiveReportRun(runInsert);

    const { vehicles } = await storage.getVehicles(params.dealershipId, params.maxVehicles ?? 500, 0);

    const unitRows: InsertCompetitiveReportUnit[] = [];

    for (const v of vehicles) {
      try {
        if (!v.make || !v.model || !v.year) continue;

        // Use comps engine to ensure data freshness + deterministic scoring.
        const comps = v.vin
          ? await getAppraisalComps({
              dealershipId: params.dealershipId,
              vin: v.vin,
              mileageKm: v.odometer || undefined,
              postalCode: params.postalCode,
              radiusKm: params.radiusKm,
              trimMode: 'near',
              maxComps: 25,
              disableExternalFetches: params.disableExternalFetches,
            }).catch(() => null)
          : null;

        // If VIN not available, fall back to cached listings by make/model/year bucket.
        let listings: MarketListing[] = [];
        if (comps?.comps && comps.comps.length > 0) {
          // Fetch underlying listings from DB by URLs (fast, and gives required fields)
          const urls = comps.comps.map(c => c.comp.listingUrl);
          listings = await storage.getMarketListingsByUrls(params.dealershipId, urls);
        } else {
          const r = await storage.getMarketListings(params.dealershipId, {
            make: v.make,
            model: v.model,
            yearMin: v.year - 1,
            yearMax: v.year + 1,
          }, 50, 0);
          listings = r.listings;
        }

        const normalizedComps = listings.slice(0, 25).map(normalizeComp);
        const compPrices = normalizedComps.map(l => l.price).filter((p): p is number => typeof p === 'number' && p > 0);
        const compMedian = median(compPrices);
        const ourPrice = v.price ?? null;
        const delta = typeof compMedian === 'number' && typeof ourPrice === 'number'
          ? (ourPrice - compMedian)
          : null;

        const position = delta === null ? null : delta < -500 ? 'under' : delta > 500 ? 'over' : 'at';
        const compDays = normalizedComps.map((c) => c.daysOnLot).filter((d): d is number => typeof d === 'number' && d >= 0);
        const compMileage = normalizedComps.map((c) => c.mileageKm).filter((m): m is number => typeof m === 'number' && m >= 0);
        const daysMedian = median(compDays);
        const mileageMedian = median(compMileage);
        const accidentFreeCount = normalizedComps.filter((c) => c.accidentHistory === 'accident_free').length;
        const reportedDamageCount = normalizedComps.filter((c) => c.accidentHistory === 'reported').length;
        const summary = {
          priceMedian: compMedian ?? null,
          priceAverage: average(compPrices) ?? null,
          averageDaysOnLot: average(compDays) ?? null,
          medianDaysOnLot: daysMedian ?? null,
          medianMileageKm: mileageMedian ?? null,
          accidentFreeCount,
          reportedDamageCount,
          sourceBreakdown: normalizedComps.reduce<Record<string, number>>((acc, comp) => {
            acc[comp.source] = (acc[comp.source] || 0) + 1;
            return acc;
          }, {}),
        };

        unitRows.push({
          runId: run.id,
          vehicleId: v.id,
          vin: v.vin ?? null,
          year: v.year ?? null,
          make: v.make ?? null,
          model: v.model ?? null,
          trim: v.trim ?? null,
          ourPrice: ourPrice ?? null,
          ourMileage: v.odometer ?? null,
          ourDaysOnLot: null,
          compCount: normalizedComps.length,
          compMedianPrice: typeof compMedian === 'number' ? compMedian : null,
          deltaToMedian: typeof delta === 'number' ? delta : null,
          position: position,
          confidence: comps?.summary?.confidence
            ?? (normalizedComps.length >= 10 ? 'high' : normalizedComps.length >= 4 ? 'medium' : 'low'),
          comps: normalizedComps.map((comp) => ({
            ...comp,
            priceDeltaFromOurVehicle: typeof ourPrice === 'number' ? comp.price - ourPrice : null,
            priceDeltaFromMedian: typeof compMedian === 'number' ? comp.price - compMedian : null,
            isNearMileageBand: typeof mileageMedian === 'number' && typeof comp.mileageKm === 'number'
              ? Math.abs(comp.mileageKm - mileageMedian) <= 20000
              : null,
          })),
          summary,
        } as any);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    const created = await storage.createCompetitiveReportUnits(unitRows);

    await storage.updateCompetitiveReportRun(run.id, params.dealershipId, {
      status: errors.length > 0 ? 'partial' : 'success',
      metrics: {
        vehiclesScanned: vehicles.length,
        vehiclesWithVin: vehicles.filter((v) => !!v.vin).length,
        unitsWritten: created.length,
        avgCompCount: average(unitRows.map((u) => Number(u.compCount || 0)).filter((n) => n > 0)) ?? 0,
        highConfidenceUnits: unitRows.filter((u: any) => u.confidence === 'high').length,
        mediumConfidenceUnits: unitRows.filter((u: any) => u.confidence === 'medium').length,
        lowConfidenceUnits: unitRows.filter((u: any) => u.confidence === 'low').length,
        errorsCount: errors.length,
      } as any,
      error: errors.length > 0 ? errors.slice(0, 5).join(' | ') : null,
    } as any);

    const updated = (await storage.getLatestCompetitiveReportRun(params.dealershipId, params.radiusKm)) ?? run;

    return { run: updated, unitsCreated: created.length, errors };
  }
}

export async function getDealershipPostalCode(dealershipId: number): Promise<string> {
  const d = await storage.getDealershipById(dealershipId);
  const pc = d?.postalCode?.trim();
  if (!pc) {
    throw new Error('Dealership postal code is required to run competitive report');
  }
  return pc;
}
