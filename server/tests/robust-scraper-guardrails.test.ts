/**
 * Robust scraper guardrail unit tests
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

const { isCloudflareBlockPage, normalizeAutoTraderPhotoUrl, normalizeDealerVdpUrl } = robustScraperTestables;

describe('robust scraper guardrails', () => {
  it('detects Cloudflare challenge pages before reconciliation parses garbage data', () => {
    const challengeHtml = `
      <html>
        <body>
          <div class="cf-wrapper">Attention Required! | Cloudflare</div>
          <div>Please enable JavaScript and cookies to continue</div>
          <div>Cloudflare Ray ID: abc123</div>
        </body>
      </html>
    `;

    expect(isCloudflareBlockPage(challengeHtml)).toBe(true);
    expect(isCloudflareBlockPage('<html><body><h1>2023 Toyota RAV4</h1></body></html>')).toBe(false);
  });

  it('normalizes AutoTrader photo urls to stable high-resolution urls for reconciliation', () => {
    expect(
      normalizeAutoTraderPhotoUrl('https://images.autotradercdn.ca/photos/import/202401/1234/5678/abc-640x480.jpg?w=800&amp;fmt=webp')
    ).toBe('https://images.autotradercdn.ca/photos/import/202401/1234/5678/abc-2048x1536.jpg?w=800&fmt=webp');

    expect(
      normalizeAutoTraderPhotoUrl('https://1s-photomanager-prd.autotradercdn.ca/photos/import/202601/3021/4605/example.jpg-1024x786?w=2048&h=1536&fit=bounds&auto=webp&quality=90')
    ).toBe('https://1s-photomanager-prd.autotradercdn.ca/photos/import/202601/3021/4605/example.jpg?w=2048&h=1536&fit=bounds&auto=webp&quality=90');
  });

  it('normalizes dealer VDP urls so stale-inventory reconciliation ignores query strings and trailing slashes', () => {
    expect(
      normalizeDealerVdpUrl('https://www.olympichyundaivancouver.com/vehicles/2024/rivian/r1s/vancouver/bc/68578448/?sale_class=used&utm_source=test')
    ).toBe('https://www.olympichyundaivancouver.com/vehicles/2024/rivian/r1s/vancouver/bc/68578448');
  });
});
