const dbSelect = jest.fn();

jest.mock('../db', () => ({
  db: {
    select: (...args: any[]) => dbSelect(...args),
    update: jest.fn(),
    insert: jest.fn(),
    delete: jest.fn(),
    execute: jest.fn(),
  },
}));

jest.mock('../storage', () => ({
  storage: {
    getAllDealerships: jest.fn(),
  },
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
  ObjectStorageService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../carfax-scraper', () => ({
  scrapeCarfaxReport: jest.fn(),
}));

import { checkVehicleNeedsEnrichment } from '../scraper';

describe('scraper photo gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockVehicleRow(row: {
    techSpecs: unknown;
    vdpDescription: string | null;
    fuelType: string | null;
    images: string[];
    price: number | null;
  }) {
    const limit = jest.fn().mockResolvedValue([
      {
        id: 42,
        techSpecs: row.techSpecs,
        vdpDescription: row.vdpDescription,
        fuelType: row.fuelType,
        images: row.images,
        price: row.price,
      },
    ]);
    const where = jest.fn(() => ({ limit }));
    const from = jest.fn(() => ({ where }));
    dbSelect.mockReturnValue({ from });
  }

  it('keeps a vehicle in enrichment mode when it has 10 or fewer uploaded photos', async () => {
    mockVehicleRow({
      techSpecs: { features: ['Heat pump'] },
      vdpDescription: 'Full VDP description',
      fuelType: 'Electric',
      images: Array.from(
        { length: 10 },
        (_, index) => `https://cdn.example.com/${index + 1}.jpg`
      ),
      price: 53998,
    });

    const result = await checkVehicleNeedsEnrichment('KM8KRDAF0PU000001', 1);

    expect(result).toEqual({
      exists: true,
      needsEnrichment: true,
      id: 42,
      currentPrice: 53998,
    });
  });

  it('allows price-only refresh once the vehicle has more than 10 uploaded photos and complete VDP data', async () => {
    mockVehicleRow({
      techSpecs: { features: ['Heat pump'] },
      vdpDescription: 'Full VDP description',
      fuelType: 'Electric',
      images: Array.from(
        { length: 11 },
        (_, index) => `https://cdn.example.com/${index + 1}.jpg`
      ),
      price: 53998,
    });

    const result = await checkVehicleNeedsEnrichment('KM8KRDAF0PU000001', 1);

    expect(result).toEqual({
      exists: true,
      needsEnrichment: false,
      id: 42,
      currentPrice: 53998,
    });
  });

  it('allows price-only refresh without dealer overview copy once specs, fuel type, and photo threshold are present', async () => {
    mockVehicleRow({
      techSpecs: { features: ['Heat pump'] },
      vdpDescription: null,
      fuelType: 'Electric',
      images: Array.from(
        { length: 11 },
        (_, index) => `https://cdn.example.com/${index + 1}.jpg`
      ),
      price: 53998,
    });

    const result = await checkVehicleNeedsEnrichment('KM8KRDAF0PU000001', 1);

    expect(result).toEqual({
      exists: true,
      needsEnrichment: false,
      id: 42,
      currentPrice: 53998,
    });
  });
});
