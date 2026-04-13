jest.mock('puppeteer', () => ({
  __esModule: true,
  default: {
    executablePath: jest.fn(() => 'C:\\bundled\\chrome.exe'),
  },
}));

import { BrowserlessUnifiedService } from '../browserless-unified';

function createPage() {
  return {
    goto: jest.fn().mockResolvedValue(undefined),
    waitForSelector: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

describe('BrowserlessUnifiedService scrapeDealerInventory', () => {
  test('uses an isolated page for each VDP scrape in a batch run', async () => {
    const service = new BrowserlessUnifiedService();
    const listingPage = createPage();
    const vdpPageOne = createPage();
    const vdpPageTwo = createPage();
    const browser = {
      newPage: jest
        .fn()
        .mockResolvedValueOnce(listingPage)
        .mockResolvedValueOnce(vdpPageOne)
        .mockResolvedValueOnce(vdpPageTwo),
    };

    (service as any).connectBrowser = jest.fn().mockResolvedValue({
      browser,
      isCloud: false,
    });
    (service as any).configurePage = jest.fn().mockResolvedValue(undefined);
    (service as any).scrollToLoadAll = jest.fn().mockResolvedValue(undefined);
    (service as any).extractVehicleUrls = jest
      .fn()
      .mockResolvedValue([
        'https://dealer.example/vehicles/2025/hyundai/kona/test-one/',
        'https://dealer.example/vehicles/2025/hyundai/kona/test-two/',
      ]);
    (service as any).scrapeVdpPage = jest
      .fn()
      .mockResolvedValueOnce({
        year: 2025,
        make: 'Hyundai',
        model: 'Kona',
        price: 32000,
        odometer: 1000,
        images: [],
        badges: [],
        location: 'BC',
        dealership: 'Dealer',
        dealershipId: 1,
      })
      .mockResolvedValueOnce({
        year: 2025,
        make: 'Hyundai',
        model: 'Kona',
        price: 33000,
        odometer: 2000,
        images: [],
        badges: [],
        location: 'BC',
        dealership: 'Dealer',
        dealershipId: 1,
      });

    const result = await service.scrapeDealerInventory('https://dealer.example/inventory', {
      dealershipId: 1,
      dealershipName: 'Dealer',
      scrapeVdp: true,
      maxVehicles: 2,
    });

    expect(result.success).toBe(true);
    expect(result.vehicles).toHaveLength(2);
    expect(browser.newPage).toHaveBeenCalledTimes(3);
    expect((service as any).scrapeVdpPage).toHaveBeenNthCalledWith(
      1,
      vdpPageOne,
      'https://dealer.example/vehicles/2025/hyundai/kona/test-one/',
      expect.objectContaining({ dealershipId: 1, dealershipName: 'Dealer' }),
    );
    expect((service as any).scrapeVdpPage).toHaveBeenNthCalledWith(
      2,
      vdpPageTwo,
      'https://dealer.example/vehicles/2025/hyundai/kona/test-two/',
      expect.objectContaining({ dealershipId: 1, dealershipName: 'Dealer' }),
    );
    expect(vdpPageOne.close).toHaveBeenCalled();
    expect(vdpPageTwo.close).toHaveBeenCalled();
  });
});
