/**
 * Robust scraper validation helper tests
 */

jest.mock('../storage', () => ({
  storage: {
    createScrapeRun: jest.fn(),
    updateScrapeRun: jest.fn(),
    getScrapeRuns: jest.fn(),
  },
}));

jest.mock('../db', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('../apify-service', () => ({
  getApifyServiceForDealership: jest.fn(),
}));

jest.mock('../browserless-service', () => ({
  getBrowserlessServiceForDealership: jest.fn(),
  getGlobalBrowserlessService: jest.fn(),
}));

jest.mock('../browserless-unified', () => ({
  BrowserlessUnifiedService: jest.fn(),
}));

jest.mock('../scraper', () => ({
  scrapeAllDealershipsIncremental: jest.fn(),
  upsertVehicleByVin: jest.fn(),
  checkVehicleNeedsEnrichment: jest.fn(),
  updateVehiclePriceOnly: jest.fn(),
}));

jest.mock('../precision-image-extractor', () => ({
  maximizeImageUrl: (url: string) => url,
}));

jest.mock('../error-utils', () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

import { robustScraperTestables } from '../robust-scraper';

const { validateVehicleData, extractPhotoUrlsFromSrcset } = robustScraperTestables;

describe('robust scraper validation helpers', () => {
  it('keeps srcset image urls in order for downstream reconciliation', () => {
    expect(
      extractPhotoUrlsFromSrcset('https://cdn.example.com/a.jpg 640w, https://cdn.example.com/b.jpg 1280w')
    ).toEqual([
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/b.jpg',
    ]);
  });

  it('accepts pending-enrichment placeholder vehicles with warnings but no hard validation failure', () => {
    const result = validateVehicleData({
      year: 2023,
      make: 'Toyota',
      model: 'RAV4',
      price: 0,
      odometer: 0,
      images: [],
      vin: 'PENDING-abc123',
    });

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      'Price is 0 (pending enrichment)',
      'No valid vehicle images found (pending enrichment)',
    ]));
  });
});
