jest.mock('../db', () => ({
  db: {},
}));

jest.mock('../storage', () => ({
  storage: {},
}));

jest.mock('../cargurus-scraper', () => ({
  scrapeAllCarGurusDealers: jest.fn(),
}));

jest.mock('../openai', () => ({
  generateVehicleDescription: jest.fn(),
}));

jest.mock('../dealer-listing-scraper', () => ({
  scrapeAllDealerListings: jest.fn(),
  scrapeDealerListingsWithCallback: jest.fn(),
  scrapeDealerListingsCheckpointed: jest.fn(),
}));

jest.mock('../vehicle-matcher', () => ({
  matchCarGurusToDealer: jest.fn(),
}));

jest.mock('../objectStorage', () => ({
  ObjectStorageService: jest.fn().mockImplementation(() => ({
    uploadVehicleImageFromUrl: jest.fn(),
  })),
}));

jest.mock('../carfax-scraper', () => ({
  scrapeCarfaxReport: jest.fn(),
}));

import { buildIncrementalCleanupScopeClause, normalizeScrapedVehicleAliases } from '../scraper';

describe('scraper incremental cleanup scope', () => {
  test('includes dealership filter and excludes already soft-deleted vehicles', () => {
    const clause = buildIncrementalCleanupScopeClause([2, 7]) as any;
    const topChunks = clause.queryChunks as any[];
    expect(Array.isArray(topChunks)).toBe(true);

    const andClause = topChunks[1];
    const andChunks = andClause.queryChunks as any[];

    const dealershipFilter = andChunks[0];
    const dealershipChunks = dealershipFilter.queryChunks as any[];
    expect(dealershipChunks[1].name).toBe('dealership_id');

    const deletedAtFilter = andChunks[2];
    const deletedAtChunks = deletedAtFilter.queryChunks as any[];
    expect(deletedAtChunks[1].name).toBe('deleted_at');
    expect(deletedAtChunks[2].value.join('').toLowerCase()).toContain('is null');
  });

  test('normalizes legacy colour aliases onto canonical color fields', () => {
    const normalized = normalizeScrapedVehicleAliases({
      year: 2025,
      make: 'Hyundai',
      model: 'Kona',
      trim: 'N Line',
      type: 'SUV',
      price: 33388,
      odometer: 23,
      images: [],
      badges: [],
      location: 'Vancouver',
      dealership: 'Olympic Hyundai Vancouver',
      dealershipId: 1,
      description: 'test',
      exteriorColour: 'Red',
      interiorColour: 'Black',
    });

    expect(normalized.exteriorColor).toBe('Red');
    expect(normalized.interiorColor).toBe('Black');
  });
});
