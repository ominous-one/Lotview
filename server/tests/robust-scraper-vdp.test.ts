/**
 * Robust scraper VDP extraction unit tests
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

const { extractVdpContent, extractFuelType, extractEngine } = robustScraperTestables;

describe('robust scraper VDP extraction', () => {
  it('extracts rich vehicle details from VDP html', () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@type": "Vehicle",
              "fuelType": "Electric"
            }
          </script>
        </head>
        <body>
          <div class="vehicle-description">
            This IONIQ 5 comes with premium seating, advanced safety tech, and a long-range battery setup.
          </div>
          <dl>
            <dt>Exterior Colour</dt><dd>Atlas White</dd>
            <dt>Interior Colour</dt><dd>Black</dd>
            <dt>Transmission</dt><dd>Automatic</dd>
            <dt>Drive Train</dt><dd>AWD</dd>
            <dt>Engine</dt><dd>Dual Motor</dd>
          </dl>
          <input name="stockNumber" value="HYU1234" />
          <div class="techspecs-tab mb-md">
            <h3>Mechanical</h3>
            <ul><li>Dual motor AWD</li></ul>
            <h3>Safety</h3>
            <ul><li>Blind-spot monitoring</li></ul>
          </div>
          <a href="https://vhr.carfax.ca/?id=abc123">
            <img src="https://cdn.carfax.ca/badging/OneOwner.svg" alt="One Owner" />
          </a>
        </body>
      </html>
    `;

    const result = extractVdpContent(html);

    expect(result.vdpDescription).toContain('premium seating');
    expect(result.techSpecs).toContain('Dual motor AWD');
    expect(result.carfaxUrl).toBe('https://vhr.carfax.ca/?id=abc123');
    expect(result.carfaxBadges).toContain('One Owner');
    expect(result.stockNumber).toBe('HYU1234');
    expect(result.exteriorColor).toBe('Atlas White');
    expect(result.interiorColor).toBe('Black');
    expect(result.transmission).toBe('Automatic');
    expect(result.drivetrain).toBe('AWD');
    expect(result.fuelType).toBe('Electric');
    expect(result.engine).toBe('Dual Motor');
  });

  it('does not infer electric from generic electric component wording', () => {
    const html = `
      <html>
        <body>
          <div>Electric power steering</div>
          <div>Electric windows</div>
        </body>
      </html>
    `;

    expect(extractFuelType(html, 'Honda', 'Civic')).toBe('Gasoline');
  });

  it('extracts engine labels safely', () => {
    const html = `<dt>Engine</dt><dd>2.5L I4</dd>`;
    expect(extractEngine(html)).toBe('2.5L I4');
  });
});
