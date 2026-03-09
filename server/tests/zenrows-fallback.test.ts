import { zenrowsFallbackAggregate } from '../zenrows-fallback';

describe('ZenRows fallback invocation', () => {
  test('invokes zenRowsScrape when enabled and configured', async () => {
    const browserlessService: any = {
      isZenRowsConfigured: () => true,
      zenRowsScrape: jest.fn().mockResolvedValue({
        success: true,
        html: `<!doctype html><html><body>
          <article>
            <a href="/a/british-columbia/123456789">2020 Toyota RAV4 XLE</a>
            <div>$31,995</div>
            <div>65,000 km</div>
          </article>
        </body></html>`,
      }),
    };

    const r = await zenrowsFallbackAggregate({
      dealershipId: 1,
      make: 'Toyota',
      model: 'RAV4',
      yearMin: 2019,
      yearMax: 2021,
      postalCode: 'V6B 1A1',
      radiusKm: 100,
      maxResults: 10,
      config: { enabled: true, maxCallsPerMinute: 100, maxCallsPerHour: 1000 },
      browserlessService,
    });

    expect(browserlessService.zenRowsScrape).toHaveBeenCalledTimes(1);
    expect(r.used).toBe(true);
    expect(r.listings.length).toBeGreaterThanOrEqual(1);
    expect(r.listings[0].source).toBe('autotrader_zenrows');
  });

  test('does not call zenRowsScrape when disabled', async () => {
    const browserlessService: any = {
      isZenRowsConfigured: () => true,
      zenRowsScrape: jest.fn(),
    };

    const r = await zenrowsFallbackAggregate({
      dealershipId: 1,
      make: 'Toyota',
      model: 'RAV4',
      postalCode: 'V6B 1A1',
      radiusKm: 100,
      config: { enabled: false, maxCallsPerMinute: 1, maxCallsPerHour: 1 },
      browserlessService,
    } as any);

    expect(browserlessService.zenRowsScrape).not.toHaveBeenCalled();
    expect(r.used).toBe(false);
  });
});
