import { resolveCarfaxReportUrlFromVdpHtml } from '../carfax-scraper';

describe('carfax scraper resolver', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('resolves the randomized vhr url and badges from dealer modal config', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'badge-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ResponseData: {
            Badges: [
              {
                VhrReportUrl: 'https://vhr.carfax.ca/?id=popup123',
                BadgeList: [
                  { BadgeName: 'One Owner' },
                  { BadgeName: 'No Reported Accidents' },
                ],
              },
            ],
          },
        }),
      });

    global.fetch = fetchMock as unknown as typeof fetch;

    const html = `
      <html>
        <body>
          <script>
            window.inventory = {"carfaxAccountId":"33267","carfaxNonce":"abc123"};
          </script>
        </body>
      </html>
    `;

    const result = await resolveCarfaxReportUrlFromVdpHtml(
      'https://www.olympichyundaivancouver.com/vehicles/2022/hyundai/ioniq-5/vancouver/bc/69188186/',
      html,
      'KM8KN4AE6NU054295',
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://www.olympichyundaivancouver.com/wp-admin/admin-ajax.php',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('https://badgingapi.carfax.ca/api/v3/badges?CompanyId=33267'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer badge-token',
        }),
      }),
    );
    expect(result).toEqual({
      reportUrl: 'https://vhr.carfax.ca/?id=popup123',
      badges: ['One Owner', 'No Reported Accidents'],
    });
  });
});
