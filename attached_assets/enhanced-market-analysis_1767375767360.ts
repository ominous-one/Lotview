import { storage } from './storage';
import { marketAggregationService, MarketAggregationParams } from './market-aggregation-service';
import type { MarketListing, InsertMarketSnapshot, InsertPriceHistory } from '@shared/schema';

export interface EnhancedMarketAnalysisParams {
  make: string;
  model: string;
  years: number[];
  trims?: string[];
  mileage?: number;
  postalCode: string;
  radiusKm: number;
  dealershipId: number;
  targetPrice?: number;
}

export interface PercentileBreakdown {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface ListingQualityScore {
  overall: number;
  breakdown: {
    hasVin: boolean;
    hasTrim: boolean;
    hasColors: boolean;
    hasMileage: boolean;
    hasSpecs: boolean;
    hasHistoryBadges: boolean;
    hasDealRating: boolean;
  };
  dataCompleteness: 'high' | 'medium' | 'low';
}

export interface CompetitorListing {
  year: number;
  make: string;
  model: string;
  trim?: string;
  price: number;
  mileage?: number;
  listingUrl: string;
  daysOnLot?: number;
  interiorColor?: string;
  exteriorColor?: string;
  source?: string;
  qualityScore?: ListingQualityScore;
  vin?: string;
  historyBadges?: string[];
  dealRating?: string;
}

export interface CompetitorInfo {
  sellerName: string;
  listingCount: number;
  averagePrice: number;
  lowestPrice: number;
  highestPrice: number;
  priceRange: string;
  listings: CompetitorListing[];
}

export interface DaysOnMarketInfo {
  average: number;
  median: number;
  fastest: number;
  slowest: number;
  distribution: {
    under7Days: number;
    under14Days: number;
    under30Days: number;
    over30Days: number;
  };
}

export interface PriceTrend {
  date: string;
  averagePrice: number;
  medianPrice: number;
  listingCount: number;
}

export interface SourceBreakdown {
  name: string;
  listingCount: number;
  averageQualityScore: number;
  dataRank: number;
  reliability: 'high' | 'medium' | 'low';
}

export interface TrimCoverageStats {
  totalListings: number;
  listingsWithTrim: number;
  trimMatchedListings: number;
  trimMismatchedListings: number;
  noTrimListings: number;
}

export interface ComparisonListing {
  year: number;
  make: string;
  model: string;
  trim?: string;
  price: number;
  mileage?: number;
  distance?: number;
  listingUrl?: string;
  listingType: 'dealer' | 'private';
  dealership?: string;
  daysOnLot?: number;
  source?: string;
}

export interface EnhancedMarketAnalysisResult {
  success: boolean;
  dataSource: string;
  searchParams: {
    make: string;
    model: string;
    years: number[];
    location: string;
    radiusKm: number;
    trims?: string[];
  };
  summary: {
    totalListings: number;
    averagePrice: number;
    medianPrice: number;
    minPrice: number;
    maxPrice: number;
    averageMileage: number;
    averageQualityScore?: number;
    highQualityListings?: number;
  };
  trimCoverage?: TrimCoverageStats;
  percentiles: PercentileBreakdown;
  daysOnMarket: DaysOnMarketInfo;
  competitors: CompetitorInfo[];
  comparisons: ComparisonListing[];
  priceTrends: PriceTrend[];
  priceRecommendation: {
    suggestedPrice: number;
    priceRange: { low: number; high: number };
    marketPosition: 'below_market' | 'at_market' | 'above_market' | 'competitive';
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
  };
  aiInsights?: string;
  sources: string[];
  sourceBreakdown: SourceBreakdown[];
  scrapedAt: string;
  errors: string[];
}

const SOURCE_RELIABILITY: Record<string, { rank: number; reliability: 'high' | 'medium' | 'low' }> = {
  'marketcheck': { rank: 1, reliability: 'high' },
  'cargurus': { rank: 2, reliability: 'high' },
  'apify': { rank: 3, reliability: 'medium' },
  'autotrader_scraper': { rank: 4, reliability: 'medium' },
  'kijiji': { rank: 5, reliability: 'medium' },
  'craigslist': { rank: 6, reliability: 'low' },
  'unknown': { rank: 10, reliability: 'low' }
};

export class EnhancedMarketAnalysisService {
  private calculateListingQualityScore(listing: MarketListing): ListingQualityScore {
    const breakdown = {
      hasVin: !!listing.vin,
      hasTrim: !!listing.trim,
      hasColors: !!(listing.interiorColor || listing.exteriorColor),
      hasMileage: !!listing.mileage && listing.mileage > 0,
      hasSpecs: !!listing.specsJson,
      hasHistoryBadges: !!listing.historyBadges,
      hasDealRating: !!listing.dealerRating
    };

    let score = 0;
    if (breakdown.hasVin) score += 20;
    if (breakdown.hasTrim) score += 15;
    if (breakdown.hasColors) score += 10;
    if (breakdown.hasMileage) score += 15;
    if (breakdown.hasSpecs) score += 15;
    if (breakdown.hasHistoryBadges) score += 15;
    if (breakdown.hasDealRating) score += 10;

    const sourceInfo = SOURCE_RELIABILITY[listing.source] || SOURCE_RELIABILITY['unknown'];
    score = Math.min(100, score + (sourceInfo.rank <= 2 ? 10 : 0));

    let dataCompleteness: 'high' | 'medium' | 'low' = 'low';
    if (score >= 70) dataCompleteness = 'high';
    else if (score >= 40) dataCompleteness = 'medium';

    return { overall: score, breakdown, dataCompleteness };
  }

  private calculateSourceBreakdown(listings: MarketListing[]): SourceBreakdown[] {
    const sourceMap = new Map<string, { listings: MarketListing[]; totalQuality: number }>();

    for (const listing of listings) {
      const source = listing.source || 'unknown';
      if (!sourceMap.has(source)) {
        sourceMap.set(source, { listings: [], totalQuality: 0 });
      }
      const entry = sourceMap.get(source)!;
      entry.listings.push(listing);
      entry.totalQuality += this.calculateListingQualityScore(listing).overall;
    }

    const breakdown: SourceBreakdown[] = [];
    for (const [name, data] of sourceMap.entries()) {
      const sourceInfo = SOURCE_RELIABILITY[name] || SOURCE_RELIABILITY['unknown'];
      breakdown.push({
        name,
        listingCount: data.listings.length,
        averageQualityScore: Math.round(data.totalQuality / data.listings.length),
        dataRank: sourceInfo.rank,
        reliability: sourceInfo.reliability
      });
    }

    return breakdown.sort((a, b) => a.dataRank - b.dataRank);
  }

  async analyze(params: EnhancedMarketAnalysisParams): Promise<EnhancedMarketAnalysisResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const sources: string[] = [];

    console.log(`[EnhancedMarketAnalysis] Starting analysis for ${params.make} ${params.model}`);

    const yearMin = Math.min(...params.years);
    const yearMax = Math.max(...params.years);

    const aggregationParams: MarketAggregationParams = {
      make: params.make,
      model: params.model,
      yearMin,
      yearMax,
      postalCode: params.postalCode,
      radiusKm: params.radiusKm,
      maxResults: 150,
      dealershipId: params.dealershipId
    };

    let aggResult;
    try {
      aggResult = await marketAggregationService.aggregateMarketData(aggregationParams);
      if (aggResult.sources) {
        sources.push(...aggResult.sources);
      }
      if (aggResult.errors) {
        errors.push(...aggResult.errors);
      }
    } catch (error) {
      console.error('[EnhancedMarketAnalysis] Aggregation error:', error);
      errors.push(`Aggregation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const { listings } = await storage.getMarketListings(params.dealershipId, {
      make: params.make,
      model: params.model,
      yearMin,
      yearMax
    }, 500);

    // Track trim coverage statistics
    let trimCoverage = {
      totalListings: listings.length,
      listingsWithTrim: listings.filter(l => l.trim).length,
      trimMatchedListings: 0,
      trimMismatchedListings: 0,
      noTrimListings: 0
    };
    
    let filteredListings = listings;
    if (params.trims && params.trims.length > 0) {
      // STRICT trim filtering - only include listings that match the specified trim
      // This prevents mixing Long Range with Plaid trim which can differ by $30k+
      const trimMatched: typeof listings = [];
      const trimMismatched: typeof listings = [];
      const noTrim: typeof listings = [];
      
      // Normalize trim string for fuzzy matching (remove punctuation, extra spaces)
      const normalizeTrim = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Check if two trims are a fuzzy match (handles variations like "Ultimate" vs "Ultimate Calligraphy")
      const fuzzyTrimMatch = (listingTrim: string, targetTrim: string): boolean => {
        const normListing = normalizeTrim(listingTrim);
        const normTarget = normalizeTrim(targetTrim);
        
        // Direct contains check (either direction)
        if (normListing.includes(normTarget) || normTarget.includes(normListing)) {
          return true;
        }
        
        // Check if all words from the shorter string appear in the longer one
        const listingWords = normListing.split(' ').filter(w => w.length > 0);
        const targetWords = normTarget.split(' ').filter(w => w.length > 0);
        
        // Target words should be found in listing (e.g., "Ultimate" found in "Ultimate Calligraphy")
        const targetFoundInListing = targetWords.every(tw => listingWords.some(lw => lw.includes(tw) || tw.includes(lw)));
        const listingFoundInTarget = listingWords.every(lw => targetWords.some(tw => tw.includes(lw) || lw.includes(tw)));
        
        return targetFoundInListing || listingFoundInTarget;
      };
      
      for (const l of listings) {
        if (!l.trim) {
          noTrim.push(l);
        } else {
          const matches = params.trims!.some(t => fuzzyTrimMatch(l.trim!, t));
          if (matches) {
            trimMatched.push(l);
          } else {
            trimMismatched.push(l);
          }
        }
      }
      
      trimCoverage.trimMatchedListings = trimMatched.length;
      trimCoverage.trimMismatchedListings = trimMismatched.length;
      trimCoverage.noTrimListings = noTrim.length;
      
      // Use only trim-matched listings for accurate pricing
      // If too few trim matches, fall back to include no-trim listings with a warning
      if (trimMatched.length >= 5) {
        filteredListings = trimMatched;
        console.log(`[EnhancedMarketAnalysis] Strict trim filter: ${trimMatched.length} exact matches for "${params.trims.join(', ')}"`);
      } else if (trimMatched.length + noTrim.length >= 3) {
        // Include listings without trim data as fallback
        filteredListings = [...trimMatched, ...noTrim];
        errors.push(`Limited trim data: Only ${trimMatched.length} exact trim matches, including ${noTrim.length} listings without trim info`);
        console.log(`[EnhancedMarketAnalysis] Trim fallback: ${trimMatched.length} matches + ${noTrim.length} without trim = ${filteredListings.length} total`);
      } else {
        // Very limited data - use all listings but warn strongly
        filteredListings = listings;
        errors.push(`Warning: Insufficient trim data for accurate comparison. Only ${trimMatched.length} of ${listings.length} listings match trim "${params.trims.join(', ')}". Results may include different trim levels.`);
        console.log(`[EnhancedMarketAnalysis] Trim data insufficient: using all ${listings.length} listings with warning`);
      }
    }

    if (filteredListings.length === 0) {
      return this.createEmptyResult(params, sources, errors);
    }

    // Filter out price outliers using two-pass approach:
    // 1. First filter out non-positive prices (bad data)
    // 2. Calculate median on valid positive prices only
    // 3. Remove prices > 3x median (likely parsing errors like $500k for a $30k car)
    const positiveListings = filteredListings.filter(l => l.price > 0);
    
    if (positiveListings.length === 0) {
      return this.createEmptyResult(params, sources, errors);
    }
    
    const positivePrices = positiveListings.map(l => l.price).sort((a, b) => a - b);
    const initialMedian = this.calculateMedian(positivePrices);
    const outlierThreshold = initialMedian * 3;
    
    // Filter listings to exclude high outliers (keep minimum at 1000 to catch data issues)
    const validListings = positiveListings.filter(l => l.price <= outlierThreshold);
    const zeroCount = filteredListings.length - positiveListings.length;
    const outlierCount = positiveListings.length - validListings.length;
    
    if (zeroCount > 0) {
      console.log(`[EnhancedMarketAnalysis] Removed ${zeroCount} listings with zero/negative prices`);
    }
    if (outlierCount > 0) {
      console.log(`[EnhancedMarketAnalysis] Filtered ${outlierCount} price outliers (threshold: $${outlierThreshold.toLocaleString()})`);
      errors.push(`Filtered ${outlierCount} listings with outlier prices above $${outlierThreshold.toLocaleString()}`);
    }
    
    // Use valid listings for analysis
    filteredListings = validListings;
    
    if (filteredListings.length === 0) {
      return this.createEmptyResult(params, sources, errors);
    }

    const prices = filteredListings.map(l => l.price).sort((a, b) => a - b);
    const mileages = filteredListings.filter(l => l.mileage).map(l => l.mileage!);

    const qualityScores = filteredListings.map(l => this.calculateListingQualityScore(l));
    const avgQualityScore = Math.round(qualityScores.reduce((a, b) => a + b.overall, 0) / qualityScores.length);
    const highQualityCount = qualityScores.filter(q => q.dataCompleteness === 'high').length;

    const sourceBreakdown = this.calculateSourceBreakdown(filteredListings);
    const responseSources = sources.length > 0
      ? Array.from(new Set(sources))
      : sourceBreakdown.map((source) => source.name);

    const summary = {
      totalListings: filteredListings.length,
      averagePrice: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      medianPrice: this.calculateMedian(prices),
      minPrice: prices[0],
      maxPrice: prices[prices.length - 1],
      averageMileage: mileages.length > 0 
        ? Math.round(mileages.reduce((a, b) => a + b, 0) / mileages.length)
        : 0,
      averageQualityScore: avgQualityScore,
      highQualityListings: highQualityCount
    };

    const percentiles = this.calculatePercentiles(prices);

    const daysOnMarket = this.calculateDaysOnMarket(filteredListings);

    const competitors = this.analyzeCompetitors(filteredListings);

    const priceTrends = await this.getPriceTrends(params.dealershipId, params.make, params.model);

    const priceRecommendation = this.generatePriceRecommendation(
      summary,
      percentiles,
      params.targetPrice,
      params.mileage,
      summary.averageMileage
    );

    await this.recordPriceHistory(params.dealershipId, filteredListings);

    await this.createSnapshot(params.dealershipId, params, summary, percentiles, daysOnMarket, responseSources);

    const elapsed = Date.now() - startTime;
    console.log(`[EnhancedMarketAnalysis] Complete in ${elapsed}ms - ${filteredListings.length} listings analyzed`);

    const comparisons: ComparisonListing[] = filteredListings.map(l => ({
      year: l.year,
      make: l.make,
      model: l.model,
      trim: l.trim || undefined,
      price: l.price,
      mileage: l.mileage || undefined,
      distance: typeof (l as any).distance === 'number' ? (l as any).distance : undefined,
      listingUrl: l.listingUrl || undefined,
      listingType: (l.listingType === 'private' ? 'private' : 'dealer') as 'dealer' | 'private',
      dealership: l.sellerName || undefined,
      daysOnLot: l.daysOnLot || undefined,
      source: l.source || undefined
    }));

    return {
      success: true,
      dataSource: responseSources.join(', ') || 'database',
      searchParams: {
        make: params.make,
        model: params.model,
        years: params.years,
        location: params.postalCode,
        radiusKm: params.radiusKm,
        trims: params.trims
      },
      summary,
      trimCoverage: params.trims && params.trims.length > 0 ? trimCoverage : undefined,
      percentiles,
      daysOnMarket,
      competitors,
      comparisons,
      priceTrends,
      priceRecommendation,
      sources: responseSources,
      sourceBreakdown,
      scrapedAt: new Date().toISOString(),
      errors
    };
  }

  private calculateMedian(sortedArray: number[]): number {
    const mid = Math.floor(sortedArray.length / 2);
    return sortedArray.length % 2 !== 0
      ? sortedArray[mid]
      : Math.round((sortedArray[mid - 1] + sortedArray[mid]) / 2);
  }

  private calculatePercentiles(sortedPrices: number[]): PercentileBreakdown {
    const getPercentile = (arr: number[], p: number) => {
      const index = Math.floor((p / 100) * arr.length);
      return arr[Math.min(index, arr.length - 1)];
    };

    return {
      p10: getPercentile(sortedPrices, 10),
      p25: getPercentile(sortedPrices, 25),
      p50: getPercentile(sortedPrices, 50),
      p75: getPercentile(sortedPrices, 75),
      p90: getPercentile(sortedPrices, 90)
    };
  }

  private calculateDaysOnMarket(listings: MarketListing[]): DaysOnMarketInfo {
    // Use daysOnLot field from scraper (CarGurus provides this directly)
    // Fall back to calculating from postedDate if daysOnLot not available
    const now = new Date();
    const daysOnMarket = listings
      .map(l => {
        // Prefer scraped daysOnLot field
        if (typeof l.daysOnLot === 'number' && l.daysOnLot >= 0) {
          return l.daysOnLot;
        }
        // Fallback to postedDate calculation
        if (l.postedDate) {
          const posted = new Date(l.postedDate);
          const days = Math.floor((now.getTime() - posted.getTime()) / (1000 * 60 * 60 * 24));
          if (days >= 0 && days < 365) return days;
        }
        return null;
      })
      .filter((d): d is number => d !== null);

    if (daysOnMarket.length === 0) {
      return {
        average: 0,
        median: 0,
        fastest: 0,
        slowest: 0,
        distribution: { under7Days: 0, under14Days: 0, under30Days: 0, over30Days: 0 }
      };
    }

    const sorted = daysOnMarket.sort((a, b) => a - b);

    return {
      average: Math.round(daysOnMarket.reduce((a, b) => a + b, 0) / daysOnMarket.length),
      median: this.calculateMedian(sorted),
      fastest: sorted[0],
      slowest: sorted[sorted.length - 1],
      distribution: {
        under7Days: daysOnMarket.filter(d => d < 7).length,
        under14Days: daysOnMarket.filter(d => d < 14).length,
        under30Days: daysOnMarket.filter(d => d < 30).length,
        over30Days: daysOnMarket.filter(d => d >= 30).length
      }
    };
  }

  private analyzeCompetitors(listings: MarketListing[]): CompetitorInfo[] {
    const dealerListings = listings.filter(l => l.listingType === 'dealer' && l.sellerName);
    
    const dealerMap = new Map<string, MarketListing[]>();
    for (const listing of dealerListings) {
      const name = listing.sellerName || 'Unknown Dealer';
      if (!dealerMap.has(name)) {
        dealerMap.set(name, []);
      }
      dealerMap.get(name)!.push(listing);
    }

    const competitors: CompetitorInfo[] = [];
    for (const [sellerName, sellerListings] of Array.from(dealerMap.entries())) {
      const prices = sellerListings.map((l: MarketListing) => l.price).sort((a: number, b: number) => a - b);
      const avgPrice = Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length);
      
      const competitorListings: CompetitorListing[] = sellerListings
        .slice(0, 10)
        .map((l: MarketListing) => {
          // Use scraped daysOnLot field from listing (CarGurus provides this directly)
          let daysOnLot: number | undefined = l.daysOnLot ?? undefined;
          
          // Fallback to postedDate calculation only if daysOnLot not available
          if (daysOnLot === undefined && l.postedDate) {
            const posted = new Date(l.postedDate);
            const now = new Date();
            const calculatedDays = Math.floor((now.getTime() - posted.getTime()) / (1000 * 60 * 60 * 24));
            if (calculatedDays >= 0) daysOnLot = calculatedDays;
          }
          
          const qualityScore = this.calculateListingQualityScore(l);
          let historyBadges: string[] | undefined;
          try {
            if (l.historyBadges) {
              historyBadges = JSON.parse(l.historyBadges);
            }
          } catch {}
          
          return {
            year: l.year,
            make: l.make,
            model: l.model,
            trim: l.trim || undefined,
            price: l.price,
            mileage: l.mileage || undefined,
            listingUrl: l.listingUrl,
            daysOnLot,
            interiorColor: l.interiorColor || undefined,
            exteriorColor: l.exteriorColor || undefined,
            source: l.source,
            qualityScore,
            vin: l.vin || undefined,
            historyBadges,
            dealRating: l.dealerRating || undefined
          };
        });
      
      competitors.push({
        sellerName,
        listingCount: sellerListings.length,
        averagePrice: avgPrice,
        lowestPrice: prices[0],
        highestPrice: prices[prices.length - 1],
        priceRange: `$${prices[0].toLocaleString()} - $${prices[prices.length - 1].toLocaleString()}`,
        listings: competitorListings
      });
    }

    return competitors.sort((a, b) => b.listingCount - a.listingCount).slice(0, 10);
  }

  private async getPriceTrends(dealershipId: number, make: string, model: string): Promise<PriceTrend[]> {
    try {
      const snapshots = await storage.getMarketSnapshots(dealershipId, { make, model, limit: 30 });
      
      return snapshots.map(s => ({
        date: new Date(s.snapshotDate).toISOString().split('T')[0],
        averagePrice: s.averagePrice,
        medianPrice: s.medianPrice,
        listingCount: s.totalListings
      }));
    } catch (error) {
      console.error('[EnhancedMarketAnalysis] Price trends error:', error);
      return [];
    }
  }

  private generatePriceRecommendation(
    summary: { totalListings: number; averagePrice: number; medianPrice: number; minPrice: number; maxPrice: number },
    percentiles: PercentileBreakdown,
    targetPrice?: number,
    vehicleMileage?: number,
    averageMileage?: number
  ): EnhancedMarketAnalysisResult['priceRecommendation'] {
    let mileageAdjustment = 0;
    if (vehicleMileage && averageMileage && averageMileage > 0) {
      const mileageDiff = vehicleMileage - averageMileage;
      const pricePerKm = (percentiles.p75 - percentiles.p25) / (averageMileage * 0.5);
      mileageAdjustment = Math.round(mileageDiff * pricePerKm * -0.5);
    }

    const suggestedPrice = Math.round(summary.medianPrice + mileageAdjustment);
    const priceRange = {
      low: Math.round(percentiles.p25 + mileageAdjustment),
      high: Math.round(percentiles.p75 + mileageAdjustment)
    };

    let marketPosition: 'below_market' | 'at_market' | 'above_market' | 'competitive' = 'at_market';
    let reasoning = '';

    if (targetPrice) {
      if (targetPrice < percentiles.p25) {
        marketPosition = 'below_market';
        reasoning = `Your price of $${targetPrice.toLocaleString()} is below the 25th percentile ($${percentiles.p25.toLocaleString()}). This is very competitive and should sell quickly.`;
      } else if (targetPrice < percentiles.p50) {
        marketPosition = 'competitive';
        reasoning = `Your price of $${targetPrice.toLocaleString()} is between the 25th and 50th percentile. This is competitively priced.`;
      } else if (targetPrice <= percentiles.p75) {
        marketPosition = 'at_market';
        reasoning = `Your price of $${targetPrice.toLocaleString()} is at market average. Consider pricing at $${suggestedPrice.toLocaleString()} for faster sale.`;
      } else {
        marketPosition = 'above_market';
        reasoning = `Your price of $${targetPrice.toLocaleString()} is above the 75th percentile ($${percentiles.p75.toLocaleString()}). Consider reducing to $${suggestedPrice.toLocaleString()} to be more competitive.`;
      }
    } else {
      reasoning = `Based on ${summary.totalListings} comparable listings, we recommend pricing between $${priceRange.low.toLocaleString()} and $${priceRange.high.toLocaleString()}. The median market price is $${summary.medianPrice.toLocaleString()}.`;
    }

    const confidence = summary.totalListings >= 20 ? 'high' : summary.totalListings >= 10 ? 'medium' : 'low';

    return {
      suggestedPrice,
      priceRange,
      marketPosition,
      confidence,
      reasoning
    };
  }

  private async recordPriceHistory(dealershipId: number, listings: MarketListing[]): Promise<void> {
    const records: InsertPriceHistory[] = listings.slice(0, 50).map(l => ({
      dealershipId,
      marketListingId: l.id,
      externalId: l.externalId,
      source: l.source,
      year: l.year,
      make: l.make,
      model: l.model,
      trim: l.trim,
      price: l.price,
      mileage: l.mileage,
      location: l.location,
      sellerName: l.sellerName
    }));

    try {
      await storage.createPriceHistoryBatch(records);
    } catch (error) {
      console.error('[EnhancedMarketAnalysis] Price history recording error:', error);
    }
  }

  private async createSnapshot(
    dealershipId: number,
    params: EnhancedMarketAnalysisParams,
    summary: any,
    percentiles: PercentileBreakdown,
    daysOnMarket: DaysOnMarketInfo,
    sources: string[]
  ): Promise<void> {
    const snapshot: InsertMarketSnapshot = {
      dealershipId,
      snapshotDate: new Date(),
      make: params.make,
      model: params.model,
      yearMin: Math.min(...params.years),
      yearMax: Math.max(...params.years),
      totalListings: summary.totalListings,
      averagePrice: summary.averagePrice,
      medianPrice: summary.medianPrice,
      minPrice: summary.minPrice,
      maxPrice: summary.maxPrice,
      p10Price: percentiles.p10,
      p25Price: percentiles.p25,
      p75Price: percentiles.p75,
      p90Price: percentiles.p90,
      averageMileage: summary.averageMileage,
      averageDaysOnMarket: daysOnMarket.average,
      sources,
      searchRadiusKm: params.radiusKm,
      searchPostalCode: params.postalCode
    };

    try {
      await storage.createMarketSnapshot(snapshot);
    } catch (error) {
      console.error('[EnhancedMarketAnalysis] Snapshot creation error:', error);
    }
  }

  private createEmptyResult(params: EnhancedMarketAnalysisParams, sources: string[], errors: string[]): EnhancedMarketAnalysisResult {
    return {
      success: false,
      dataSource: 'none',
      searchParams: {
        make: params.make,
        model: params.model,
        years: params.years,
        location: params.postalCode,
        radiusKm: params.radiusKm
      },
      summary: {
        totalListings: 0,
        averagePrice: 0,
        medianPrice: 0,
        minPrice: 0,
        maxPrice: 0,
        averageMileage: 0,
        averageQualityScore: 0,
        highQualityListings: 0
      },
      percentiles: { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 },
      daysOnMarket: {
        average: 0,
        median: 0,
        fastest: 0,
        slowest: 0,
        distribution: { under7Days: 0, under14Days: 0, under30Days: 0, over30Days: 0 }
      },
      competitors: [],
      comparisons: [],
      priceTrends: [],
      priceRecommendation: {
        suggestedPrice: 0,
        priceRange: { low: 0, high: 0 },
        marketPosition: 'at_market',
        confidence: 'low',
        reasoning: 'No market data found. Please try refreshing market data first.'
      },
      sources,
      sourceBreakdown: [],
      scrapedAt: new Date().toISOString(),
      errors: [...errors, 'No listings found matching your criteria']
    };
  }
}

export const enhancedMarketAnalysis = new EnhancedMarketAnalysisService();
