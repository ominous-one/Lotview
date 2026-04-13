/**
 * Robust scraper image folder validation unit tests
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

const { validateSameFolderImages } = robustScraperTestables;

describe('robust scraper image folder validation', () => {
  it('keeps only the dominant AutoTrader CDN folder to avoid cross-vehicle image mixing', () => {
    const images = [
      'https://images.autotradercdn.ca/photos/import/202401/1234/111111/1.jpg',
      'https://images.autotradercdn.ca/photos/import/202401/1234/111111/2.jpg',
      'https://images.autotradercdn.ca/photos/import/202401/1234/222222/1.jpg',
      'https://dealer.example/uploads/local-hero.jpg',
    ];

    expect(validateSameFolderImages(images)).toEqual([
      'https://images.autotradercdn.ca/photos/import/202401/1234/111111/1.jpg',
      'https://images.autotradercdn.ca/photos/import/202401/1234/111111/2.jpg',
      'https://dealer.example/uploads/local-hero.jpg',
    ]);
  });
});
