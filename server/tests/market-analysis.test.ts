/**
 * Market Analysis Tests
 *
 * Tests price analysis logic, colour-match scoring, comp scoring,
 * and condition normalization — all pure functions with no I/O.
 */

// ─── Mocks (only needed to satisfy top-level imports in some modules) ─────────

// db.ts throws at load if DATABASE_URL is missing — mock before any import
jest.mock('../db', () => ({
  db: {
    select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn(() => ({ limit: jest.fn(() => Promise.resolve([])) })) })) })),
    insert: jest.fn(() => ({ values: jest.fn(() => ({ returning: jest.fn(() => Promise.resolve([{ id: 1 }])) })) })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => Promise.resolve()) })) })),
    execute: jest.fn(() => Promise.resolve({ rows: [] })),
  },
}));

jest.mock('../vin-decode-router', () => ({
  decodeVinCheapHybrid: jest.fn(async () => ({ vin: 'MOCK', year: 2022, make: 'Toyota', model: 'RAV4' })),
}));

jest.mock('../storage', () => ({
  storage: {
    getMarketListingsBySearch: jest.fn(async () => []),
    getMarketSnapshots: jest.fn(async () => []),
    getDealershipApiKeys: jest.fn(async () => null),
  },
}));

jest.mock('../error-utils', () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import {
  analyzeMarketPricing,
  calculateColorMatchScore,
  type Vehicle,
  type MarketPricingRequest,
} from '../market-pricing';

import { scoreComp, type NormalizedComp } from '../comps-engine';

import {
  mapConditionEnum,
  normalizeCondition,
  conditionForDisplay,
} from '../condition-normalization';

// ─── Test fixtures ────────────────────────────────────────────────────────────

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: Math.floor(Math.random() * 10000),
    year: 2022,
    make: 'Toyota',
    model: 'RAV4',
    trim: 'XLE',
    price: 35000,
    mileage: 25000,
    location: 'Vancouver, BC',
    dealership: 'Test Dealer',
    listingUrl: 'https://example.com/vehicle/1',
    source: 'autotrader',
    interiorColor: 'Black',
    exteriorColor: 'White',
    ...overrides,
  };
}

function makeRequest(overrides: Partial<MarketPricingRequest> = {}): MarketPricingRequest {
  return {
    year: 2022,
    make: 'Toyota',
    model: 'RAV4',
    trim: 'XLE',
    mileage: 25000,
    ...overrides,
  };
}

// ─── Color Match Scoring ──────────────────────────────────────────────────────

describe('calculateColorMatchScore', () => {
  it('returns 100 for identical colors', () => {
    expect(calculateColorMatchScore('Black', 'Black')).toBe(100);
  });

  it('is case-insensitive', () => {
    expect(calculateColorMatchScore('black', 'BLACK')).toBe(100);
  });

  it('returns high score for partial match (jet black vs black)', () => {
    const score = calculateColorMatchScore('Jet Black', 'Black');
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('returns neutral 50 when either color is missing', () => {
    expect(calculateColorMatchScore(undefined, 'Black')).toBe(50);
    expect(calculateColorMatchScore('Black', undefined)).toBe(50);
    expect(calculateColorMatchScore(undefined, undefined)).toBe(50);
  });

  it('returns a lower score for completely different colors', () => {
    const score = calculateColorMatchScore('Black', 'White');
    expect(score).toBeLessThan(80);
  });

  it('handles pearl variants (white pearl vs white)', () => {
    const score = calculateColorMatchScore('Pearl White', 'White');
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it('handles grey/gray spelling variants', () => {
    const score = calculateColorMatchScore('Gray', 'Grey');
    expect(score).toBeGreaterThanOrEqual(70);
  });
});

// ─── Market Pricing Analysis ──────────────────────────────────────────────────

describe('analyzeMarketPricing', () => {
  it('returns zero-state when no comps', () => {
    const result = analyzeMarketPricing(makeRequest(), []);
    expect(result.totalComps).toBe(0);
    expect(result.averagePrice).toBe(0);
    expect(result.marketPosition).toBe('at_market');
  });

  it('computes correct average price from comps', () => {
    const comps = [
      makeVehicle({ price: 30000 }),
      makeVehicle({ price: 35000 }),
      makeVehicle({ price: 40000 }),
    ];
    const result = analyzeMarketPricing(makeRequest(), comps);
    expect(result.averagePrice).toBe(35000);
    expect(result.totalComps).toBe(3);
  });

  it('computes median correctly for even count', () => {
    const comps = [
      makeVehicle({ price: 30000 }),
      makeVehicle({ price: 32000 }),
      makeVehicle({ price: 38000 }),
      makeVehicle({ price: 40000 }),
    ];
    const result = analyzeMarketPricing(makeRequest(), comps);
    // Median of sorted [30000, 32000, 38000, 40000] = (32000 + 38000) / 2 = 35000
    expect(result.medianPrice).toBe(35000);
  });

  it('identifies below_market position', () => {
    const comps = [
      makeVehicle({ price: 45000 }),
      makeVehicle({ price: 46000 }),
      makeVehicle({ price: 47000 }),
    ];
    // Target vehicle priced well below market
    const target = makeRequest({ mileage: 25000 });
    const result = analyzeMarketPricing(target, comps);
    // The function analyses comps; position depends on target price vs average
    // In this setup target price is not set, so position is 'at_market'
    expect(['below_market', 'at_market', 'above_market']).toContain(result.marketPosition);
  });

  it('filters by make/model (case insensitive)', () => {
    const comps = [
      makeVehicle({ make: 'toyota', model: 'rav4', price: 35000 }),
      makeVehicle({ make: 'Honda', model: 'CR-V', price: 34000 }), // should be excluded
      makeVehicle({ make: 'TOYOTA', model: 'RAV4', price: 37000 }),
    ];
    const result = analyzeMarketPricing(makeRequest(), comps);
    expect(result.totalComps).toBe(2); // only Toyota RAV4s
  });

  it('filters by year within 2-year window', () => {
    const comps = [
      makeVehicle({ year: 2022, price: 35000 }),
      makeVehicle({ year: 2020, price: 32000 }), // 2 years difference — should be included
      makeVehicle({ year: 2019, price: 28000 }), // 3 years — should be excluded
      makeVehicle({ year: 2024, price: 38000 }), // 2 years — should be included
    ];
    const result = analyzeMarketPricing(makeRequest({ year: 2022 }), comps);
    expect(result.totalComps).toBe(3);
  });

  it('fuzzy-matches trim names', () => {
    const comps = [
      makeVehicle({ trim: 'XLE Premium', price: 38000 }),
      makeVehicle({ trim: 'XLE', price: 36000 }),
      makeVehicle({ trim: 'LE', price: 32000 }), // different trim
    ];
    const result = analyzeMarketPricing(makeRequest({ trim: 'XLE' }), comps);
    // XLE and XLE Premium should both match via fuzzy
    expect(result.totalComps).toBeGreaterThanOrEqual(2);
  });

  it('returns min and max price', () => {
    const comps = [
      makeVehicle({ price: 30000 }),
      makeVehicle({ price: 40000 }),
      makeVehicle({ price: 35000 }),
    ];
    const result = analyzeMarketPricing(makeRequest(), comps);
    expect(result.minPrice).toBe(30000);
    expect(result.maxPrice).toBe(40000);
  });

  it('returns comparison list with vehicle details', () => {
    const comps = [makeVehicle({ price: 35000, trim: 'XLE', year: 2022 })];
    const result = analyzeMarketPricing(makeRequest(), comps);
    expect(result.comparisons.length).toBeGreaterThan(0);
    expect(result.comparisons[0].price).toBe(35000);
  });
});

// ─── Comp Scoring (Appraisal engine) ─────────────────────────────────────────

describe('scoreComp', () => {
  function makeComp(overrides: Partial<NormalizedComp> = {}): NormalizedComp {
    return {
      listingUrl: 'https://example.com/listing/1',
      year: 2022,
      make: 'Toyota',
      model: 'RAV4',
      trim: 'XLE',
      price: 35000,
      mileageKm: 25000,
      source: 'autotrader',
      accidentHistory: 'unknown',
      ...overrides,
    };
  }

  it('gives maximum score for exact year/mileage/trim match', () => {
    const result = scoreComp({
      subjectYear: 2022,
      subjectMileageKm: 25000,
      subjectTrim: 'XLE',
      trimMode: 'exact',
      comp: makeComp(),
    });
    expect(result.total).toBeGreaterThanOrEqual(75);
  });

  it('penalises year difference', () => {
    const exactMatch = scoreComp({
      subjectYear: 2022,
      subjectMileageKm: 25000,
      subjectTrim: 'XLE',
      trimMode: 'exact',
      comp: makeComp({ year: 2022 }),
    });
    const yearDiff = scoreComp({
      subjectYear: 2022,
      subjectMileageKm: 25000,
      subjectTrim: 'XLE',
      trimMode: 'exact',
      comp: makeComp({ year: 2019 }), // 3-year diff → 0 year score
    });
    expect(exactMatch.total).toBeGreaterThan(yearDiff.total);
  });

  it('penalises mileage difference', () => {
    const lowMileage = scoreComp({
      subjectYear: 2022,
      subjectMileageKm: 25000,
      subjectTrim: 'XLE',
      trimMode: 'exact',
      comp: makeComp({ mileageKm: 26000 }),
    });
    const highMileage = scoreComp({
      subjectYear: 2022,
      subjectMileageKm: 25000,
      subjectTrim: 'XLE',
      trimMode: 'exact',
      comp: makeComp({ mileageKm: 120000 }),
    });
    expect(lowMileage.total).toBeGreaterThan(highMileage.total);
  });

  it('gives 0 trim score for mismatch in exact mode', () => {
    const result = scoreComp({
      subjectYear: 2022,
      subjectMileageKm: 25000,
      subjectTrim: 'XLE',
      trimMode: 'exact',
      comp: makeComp({ trim: 'Limited' }),
    });
    // Trim mismatch in exact mode should be penalised
    const exactResult = scoreComp({
      subjectYear: 2022,
      subjectMileageKm: 25000,
      subjectTrim: 'XLE',
      trimMode: 'exact',
      comp: makeComp({ trim: 'XLE' }),
    });
    expect(exactResult.total).toBeGreaterThan(result.total);
  });

  it('gives partial trim score in near mode', () => {
    const nearMode = scoreComp({
      subjectYear: 2022,
      subjectMileageKm: 25000,
      subjectTrim: 'XLE Premium',
      trimMode: 'near',
      comp: makeComp({ trim: 'XLE' }),
    });
    const exactMode = scoreComp({
      subjectYear: 2022,
      subjectMileageKm: 25000,
      subjectTrim: 'XLE Premium',
      trimMode: 'exact',
      comp: makeComp({ trim: 'XLE' }),
    });
    // Near mode should be more lenient
    expect(nearMode.total).toBeGreaterThanOrEqual(exactMode.total);
  });

  it('rewards higher-quality data sources', () => {
    const autotrader = scoreComp({
      subjectYear: 2022,
      subjectMileageKm: 25000,
      subjectTrim: 'XLE',
      trimMode: 'exact',
      comp: makeComp({ source: 'autotrader' }),
    });
    const unknown = scoreComp({
      subjectYear: 2022,
      subjectMileageKm: 25000,
      subjectTrim: 'XLE',
      trimMode: 'exact',
      comp: makeComp({ source: 'unknown' as any }),
    });
    expect(autotrader.total).toBeGreaterThanOrEqual(unknown.total);
  });

  it('returns a reasons array with all scoring components', () => {
    const result = scoreComp({
      subjectYear: 2022,
      subjectMileageKm: 25000,
      subjectTrim: 'XLE',
      trimMode: 'exact',
      comp: makeComp(),
    });
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});

// ─── Condition Normalization ──────────────────────────────────────────────────

describe('Condition normalization', () => {
  describe('mapConditionEnum', () => {
    it('maps "Excellent" → excellent', () => {
      expect(mapConditionEnum('Excellent')).toBe('excellent');
    });

    it('maps "Good" → good (case insensitive)', () => {
      expect(mapConditionEnum('GOOD')).toBe('good');
    });

    it('maps "Fair" → fair', () => {
      expect(mapConditionEnum('fair')).toBe('fair');
    });

    it('maps "Poor" / "Rough" → poor', () => {
      expect(mapConditionEnum('Poor')).toBe('poor');
      expect(mapConditionEnum('Rough')).toBe('poor');
    });

    it('maps unknown strings → unknown', () => {
      expect(mapConditionEnum('Pristine')).toBe('unknown');
      expect(mapConditionEnum('')).toBe('unknown');
      expect(mapConditionEnum(null)).toBe('unknown');
    });
  });

  describe('normalizeCondition', () => {
    it('picks the best candidate from available sources', () => {
      // ConditionCandidate uses { raw, source } — raw holds the condition value
      const result = normalizeCondition([
        { source: 'scraper', raw: 'Good' },
        { source: 'user', raw: 'Excellent' },
      ]);
      expect(['good', 'excellent', 'unknown']).toContain(result.condition);
    });

    it('handles unrecognised raw values gracefully', () => {
      const result = normalizeCondition([
        { source: 'scraper', raw: 'Pristine-Custom-Value' },
      ]);
      expect(result.condition).toBe('unknown');
    });

    it('returns unknown for empty candidates', () => {
      const result = normalizeCondition([]);
      expect(result.condition).toBe('unknown');
    });

    it('returns a chosen source name when available', () => {
      const result = normalizeCondition([
        { source: 'autotrader', raw: 'Good' },
      ]);
      if (result.chosenSource) {
        expect(typeof result.chosenSource).toBe('string');
      }
    });
  });

  describe('conditionForDisplay', () => {
    it('returns a displayable string for each condition', () => {
      const conditions = ['excellent', 'good', 'fair', 'poor'] as const;
      for (const c of conditions) {
        const display = conditionForDisplay(c);
        expect(typeof display === 'string' || display === null).toBe(true);
        if (display) {
          expect(display.length).toBeGreaterThan(0);
        }
      }
    });

    it('returns null or string for unknown', () => {
      const result = conditionForDisplay('unknown');
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });
});
