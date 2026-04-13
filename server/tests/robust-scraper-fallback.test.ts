/**
 * Robust scraper fallback orchestration tests
 */

const createScrapeRun = jest.fn();
const updateScrapeRun = jest.fn();
const getScrapeRuns = jest.fn();
const dbSelect = jest.fn();
const dbUpdate = jest.fn();
const isZenRowsConfigured = jest.fn();
const isScrapingBeeConfigured = jest.fn();

jest.mock('../storage', () => ({
  storage: {
    createScrapeRun: (...args: any[]) => createScrapeRun(...args),
    updateScrapeRun: (...args: any[]) => updateScrapeRun(...args),
    getScrapeRuns: (...args: any[]) => getScrapeRuns(...args),
  },
}));

jest.mock('../db', () => ({
  db: {
    select: (...args: any[]) => dbSelect(...args),
    update: (...args: any[]) => dbUpdate(...args),
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
  BrowserlessUnifiedService: jest.fn().mockImplementation(() => ({
    isZenRowsConfigured: (...args: any[]) => isZenRowsConfigured(...args),
    isScrapingBeeConfigured: (...args: any[]) => isScrapingBeeConfigured(...args),
  })),
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
import { scrapeAllDealershipsIncremental } from '../scraper';

const { runRobustScrape } = robustScraperTestables;
const mockedScrapeAllDealershipsIncremental = scrapeAllDealershipsIncremental as jest.MockedFunction<typeof scrapeAllDealershipsIncremental>;

jest.spyOn(robustScraperTestables, 'runRobustScrape');

describe('robust scraper fallback orchestration', () => {
  jest.setTimeout(30000);

  beforeEach(() => {
    jest.clearAllMocks();
    createScrapeRun.mockResolvedValue({ id: 123 });
    updateScrapeRun.mockResolvedValue(undefined);
    getScrapeRuns.mockResolvedValue([]);
    isZenRowsConfigured.mockReturnValue(false);
    isScrapingBeeConfigured.mockReturnValue(false);
    mockedScrapeAllDealershipsIncremental.mockResolvedValue(0);

    dbSelect.mockReturnValue({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([
        { id: 11, dealershipId: 1 },
        { id: 12, dealershipId: 1 },
      ]),
      limit: jest.fn().mockResolvedValue([
        { id: 11, dealershipId: 1 },
        { id: 12, dealershipId: 1 },
      ]),
    });
  });

  it('treats zero-vehicle puppeteer runs as failed and falls back to cache-preserve mode', async () => {
    const result = await runRobustScrape('manual', 1);

    expect(result).toMatchObject({
      success: false,
      method: 'cache_preserve',
      vehiclesFound: 2,
      vehiclesInserted: 0,
      vehiclesUpdated: 0,
      vehiclesDeleted: 0,
      vehiclesRejected: 0,
    });

    expect(updateScrapeRun).toHaveBeenCalledWith(
      123,
      expect.objectContaining({
        status: 'partial',
        scrapeMethod: 'cache_preserve',
        errorMessage: expect.stringContaining('Puppeteer: Puppeteer scrape returned 0 vehicles'),
      })
    );
  });

  it('closes abandoned running scrape runs before starting a new scrape', async () => {
    getScrapeRuns.mockResolvedValue([
      {
        id: 77,
        status: 'running',
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
        errorMessage: null,
      },
    ]);
    mockedScrapeAllDealershipsIncremental.mockResolvedValue(5);

    const result = await runRobustScrape('manual', 1);

    expect(result).toMatchObject({
      success: true,
      method: 'puppeteer',
      vehiclesFound: 5,
    });
    expect(updateScrapeRun).toHaveBeenCalledWith(
      77,
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'abandoned_before_new_run',
      }),
    );
    expect(updateScrapeRun).toHaveBeenCalledWith(
      123,
      expect.objectContaining({
        status: 'success',
        scrapeMethod: 'puppeteer',
        vehiclesFound: 5,
      }),
    );
  });
});
