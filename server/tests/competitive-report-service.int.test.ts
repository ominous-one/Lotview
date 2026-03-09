jest.mock('../storage', () => {
  const now = new Date('2026-03-08T00:00:00Z');
  const latestRun = {
    id: 123,
    dealershipId: 1,
    generatedAt: now,
    radiusKm: 100,
    sources: [],
    status: 'success',
    metrics: { unitsWritten: 1 },
    error: null,
    createdAt: now,
  };

  return {
    storage: {
      getDealershipAutomationSettings: jest.fn().mockResolvedValue({ competitiveReportCadenceHours: 48 }),
      getLatestCompetitiveReportRun: jest.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValue(latestRun),
      createCompetitiveReportRun: jest.fn().mockResolvedValue({
        ...latestRun,
        status: 'running',
        metrics: null,
      }),
      updateCompetitiveReportRun: jest.fn().mockResolvedValue(undefined),
      getVehicles: jest.fn().mockResolvedValue({
        vehicles: [
          { id: 1, year: 2021, make: 'Toyota', model: 'RAV4', trim: 'XLE', vin: 'JT123456789012345', odometer: 60000, price: 31995, daysOnLot: 12 },
        ],
        total: 1,
      }),
      getMarketListingsByUrls: jest.fn().mockResolvedValue([]),
      getMarketListings: jest.fn().mockResolvedValue({
        listings: [
          {
            id: 999,
            dealershipId: 1,
            externalId: 'mc_1',
            source: 'marketcheck',
            listingType: 'dealer',
            year: 2021,
            make: 'Toyota',
            model: 'RAV4',
            trim: 'XLE',
            price: 30995,
            mileage: 65000,
            location: 'Vancouver, BC',
            postalCode: null,
            latitude: null,
            longitude: null,
            sellerName: 'Competitor Dealer',
            imageUrl: null,
            listingUrl: 'https://example.com/1',
            postedDate: null,
            scrapedAt: now,
            isActive: true,
            interiorColor: 'Black',
            exteriorColor: 'White',
            vin: null,
            colorScrapedAt: null,
            sourceConfidence: 80,
            specsJson: null,
            featuresJson: null,
            marketAvailabilityCount: null,
            dataSourceRank: 1,
            vehicleHash: null,
            dealerRating: null,
            historyBadges: JSON.stringify(['No Accidents Reported']),
            daysOnLot: 20,
          },
        ],
        total: 1,
      }),
      createCompetitiveReportUnits: jest.fn().mockImplementation(async (units: any[]) => units.map((u, idx) => ({ ...u, id: idx + 1, createdAt: now }))),
    }
  };
});

jest.mock('../comps-engine', () => ({
  getAppraisalComps: jest.fn().mockResolvedValue({ spec: {}, comps: [], summary: { count: 0 } }),
}));

import { CompetitiveReportService } from '../competitive-report-service';

describe('competitive report snapshot job (integration-ish)', () => {
  test('creates a run and unit rows deterministically', async () => {
    const svc = new CompetitiveReportService();
    const result = await svc.runCompetitiveReport({
      dealershipId: 1,
      radiusKm: 100,
      postalCode: 'V6B 1A1',
      disableExternalFetches: true,
      maxVehicles: 10,
    });

    expect(result.unitsCreated).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.run.status).toBe('success');
  });
});
