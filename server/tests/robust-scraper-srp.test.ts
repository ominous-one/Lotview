/**
 * Robust scraper SRP extraction unit tests
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

const { isOlympicHyundaiDomain, parseListingPriceText, extractVehicleListingsFromSrp } = robustScraperTestables;

describe('robust scraper SRP helpers', () => {
  it('recognizes Olympic Hyundai hostnames', () => {
    expect(isOlympicHyundaiDomain('olympichyundaivancouver.com')).toBe(true);
    expect(isOlympicHyundaiDomain('inventory.olympichyundaivancouver.com')).toBe(true);
    expect(isOlympicHyundaiDomain('example.com')).toBe(false);
  });

  it('parses realistic SRP price text and rejects out-of-range values', () => {
    expect(parseListingPriceText('Sale Price $31,998')).toBe(31998);
    expect(parseListingPriceText('Blowout $5,000')).toBe(5000);
    expect(parseListingPriceText('$500,000')).toBe(500000);
    expect(parseListingPriceText('MSRP $499')).toBeNull();
    expect(parseListingPriceText('$501000')).toBeNull();
  });

  it('extracts vehicle listing urls and lowest trustworthy SRP price from Olympic-style cards', () => {
    const html = `
      <div class="vehicle-card">
        <a href="/vehicles/2023/toyota/rav4/vancouver/bc/69117759/?sale_class=used">View vehicle</a>
        <div class="price-block">
          <div class="price-block__single">MSRP <span class="price-block__price">$42,998</span></div>
          <div class="price-block__single">Sale Price <span class="price-block__price">$39,998</span></div>
        </div>
      </div>
      <div class="vehicle-card">
        <a href="https://www.olympichyundaivancouver.com/vehicles/2022/honda/cr-v/vancouver/bc/12345678/?sale_class=used">View vehicle</a>
        <div class="price-block__price--primary">$28,888</div>
      </div>
    `;

    expect(extractVehicleListingsFromSrp(html, 'https://www.olympichyundaivancouver.com/vehicles/used/')).toEqual([
      {
        vdpUrl: 'https://www.olympichyundaivancouver.com/vehicles/2023/toyota/rav4/vancouver/bc/69117759',
        srpPrice: 39998,
      },
      {
        vdpUrl: 'https://www.olympichyundaivancouver.com/vehicles/2022/honda/cr-v/vancouver/bc/12345678',
        srpPrice: 28888,
      },
    ]);
  });
});
