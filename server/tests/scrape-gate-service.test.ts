jest.mock('../storage', () => ({
  storage: {
    getDealership: jest.fn(),
    getVehicles: jest.fn(),
    getLatestScrapeRun: jest.fn(),
  },
}));

jest.mock('../scrape-certification', () => {
  const actual = jest.requireActual('../scrape-certification');
  return {
    ...actual,
    readDealershipScrapeCertificationArtifact: jest.fn(),
  };
});

import { resolveDealershipScrapeGateForPosting } from '../scrape-gate-service';
import {
  buildDealershipScrapeCertificationArtifact,
  readDealershipScrapeCertificationArtifact,
  SCRAPE_SUSTAINED_GREEN_STREAK_BLOCKER,
} from '../scrape-certification';
import { storage } from '../storage';

const mockedStorage = storage as jest.Mocked<typeof storage>;
const mockedReadDealershipScrapeCertificationArtifact =
  readDealershipScrapeCertificationArtifact as jest.MockedFunction<typeof readDealershipScrapeCertificationArtifact>;

const baseMetrics = {
  sampledVehicleCount: 25,
  sampledVehiclePassCount: 25,
  scrapeSuccessRate: 0.998,
  staleRemovalWithinSla: true,
  consecutiveDaysAbove95: 7,
  imageContaminationRate: 0,
  hasCarfaxUnknownsOnlyWhenAbsent: true,
};

describe('scrape-gate-service', () => {
  beforeEach(() => {
    mockedReadDealershipScrapeCertificationArtifact.mockReset();
    mockedStorage.getDealership.mockReset();
    mockedStorage.getVehicles.mockReset();
    mockedStorage.getLatestScrapeRun.mockReset();
  });

  test('uses source-truth certification for posting and does not block on the bootstrap streak warning', async () => {
    mockedReadDealershipScrapeCertificationArtifact.mockReturnValue(
      buildDealershipScrapeCertificationArtifact({
        dealershipId: 44,
        generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        truthBoundary: 'source_truth_reconciliation',
        gate: {
          dealershipId: 44,
          score: 99.1,
          passed: false,
          blockers: [SCRAPE_SUSTAINED_GREEN_STREAK_BLOCKER],
          categoryBreakdown: {
            identity: 100,
            price: 100,
            media: 99.5,
            details: 99,
            freshness: 99.8,
            history: 100,
          },
        },
        metrics: {
          ...baseMetrics,
          consecutiveDaysAbove95: 3,
        },
        sampledVehicles: [],
      }),
    );

    const result = await resolveDealershipScrapeGateForPosting(44);

    expect(result.source).toBe('external_certification');
    expect(result.launchEligible).toBe(true);
    expect(result.truthBoundary).toBe('source_truth_reconciliation');
    expect(result.gate.passed).toBe(true);
    expect(result.gate.blockers).toEqual([]);
    expect(mockedStorage.getVehicles).not.toHaveBeenCalled();
  });

  test('ignores stored-inventory artifacts on disk and falls back to live diagnostic resolution', async () => {
    mockedReadDealershipScrapeCertificationArtifact.mockReturnValue(
      buildDealershipScrapeCertificationArtifact({
        dealershipId: 44,
        generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        truthBoundary: 'stored_inventory_internal_consistency',
        gate: {
          dealershipId: 44,
          score: 99.4,
          passed: true,
          blockers: [],
          categoryBreakdown: {
            identity: 100,
            price: 100,
            media: 100,
            details: 99,
            freshness: 99,
            history: 100,
          },
        },
        metrics: baseMetrics,
        sampledVehicles: [],
      }),
    );

    mockedStorage.getVehicles.mockResolvedValue({
      vehicles: [
        {
          vin: '1HGBH41JXMN109186',
          stockNumber: 'A123',
          year: 2024,
          make: 'Toyota',
          model: 'Camry',
          trim: 'SE',
          price: 31995,
          odometer: 12000,
          images: ['https://cdn.example.com/a.jpg'],
          transmission: 'Automatic',
          drivetrain: 'FWD',
          fuelType: 'Gas',
          exteriorColor: 'Silver',
          interiorColor: 'Black',
          carfaxUrl: null,
          carfaxBadges: [],
        },
      ],
      total: 1,
    } as any);
    mockedStorage.getDealership.mockResolvedValue({
      id: 44,
      name: 'Olympic Hyundai Vancouver',
      slug: 'olympic-hyundai',
      subdomain: 'olympic',
    } as any);
    mockedStorage.getLatestScrapeRun.mockResolvedValue(undefined);

    const result = await resolveDealershipScrapeGateForPosting(44);

    expect(result.source).toBe('stored_inventory_diagnostic');
    expect(result.truthBoundary).toBe('stored_inventory_internal_consistency');
    expect(result.launchEligible).toBe(false);
    expect(result.certificationBlockers).toContain('certification_artifact_missing');
    expect(result.certificationBlockers).toContain('truth_boundary_not_source_reconciled');
    expect(result.artifact?.dealershipLabel).toBe('olympic');
  });
});
