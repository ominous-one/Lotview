import { assessDealershipScrapeCertificationArtifact } from '../scrape-certification';
import { buildSourceTruthCertificationArtifactFromLiveReconciliation } from '../source-truth-certification';

describe('source-truth-certification', () => {
  test('turns live reconciliation evidence into a launch-blocking source-truth artifact when inventory completeness and history grounding fail', () => {
    const artifact = buildSourceTruthCertificationArtifactFromLiveReconciliation({
      dealershipId: 1,
      dealershipLabel: 'olympic',
      storedInventoryTotal: 35,
      latestScrapeRunId: 6,
      consecutiveDaysAbove95: 7,
      liveArtifact: {
        generatedAt: new Date().toISOString(),
        dealership: {
          listingPageSignals: {
            visibleVehicleLinkCount: 59,
          },
        },
        sampledVehicles: [
          {
            source: {
              vin: '1',
              stockNumber: 'A1',
              year: 2024,
              make: 'Acura',
              model: 'ZDX',
              trim: 'Type S AWD',
              price: 49888,
              odometer: 11978,
              photoCountObservedInDom: 17,
              primaryPhoto: 'https://dealer.example/a.jpg',
              transmission: 'Automatic',
              drivetrain: 'AWD',
              fuelType: 'Electric',
              exteriorColor: 'Blue',
              carfaxSignalsPresent: true,
            },
            observed: {
              vin: '1',
              stockNumber: 'A1',
              year: 2024,
              make: 'Acura',
              model: 'ZDX',
              trim: 'Type S AWD',
              price: 49888,
              odometer: 11978,
              photoCount: 17,
              primaryPhoto: 'https://dealer.example/a.jpg',
              transmission: 'Automatic',
              drivetrain: 'AWD',
              fuelType: 'Electric',
              exteriorColor: 'Blue',
            },
          },
        ],
      },
    });

    const assessment = assessDealershipScrapeCertificationArtifact(artifact);

    expect(artifact.truthBoundary).toBe('source_truth_reconciliation');
    expect(artifact.metrics.scrapeSuccessRate).toBeCloseTo(35 / 59, 5);
    expect(artifact.gate.blockers).toContain('scrape_success_rate_below_threshold');
    expect(artifact.gate.blockers).toContain('carfax_truthfulness_failed');
    expect(artifact.launchBlockers).toContain('source_truth_sample_size_below_threshold');
    expect(assessment.usable).toBe(false);
  });

  test('fresh, sufficiently sampled live reconciliation can produce a usable source-truth artifact', () => {
    const sample = {
      source: {
        vin: '1HGCM82633A004352',
        stockNumber: 'A1',
        year: 2023,
        make: 'Toyota',
        model: 'RAV4',
        trim: 'XLE',
        price: 31995,
        odometer: 15000,
        photoCountObservedInDom: 12,
        primaryPhoto: 'https://dealer.example/a.jpg',
        transmission: 'Automatic',
        drivetrain: 'AWD',
        fuelType: 'Gasoline',
        exteriorColor: 'Blue',
        interiorColor: 'Black',
        carfaxUrl: 'https://vhr.carfax.ca/report?id=abc',
        carfaxBadges: ['One Owner'],
        carfaxSignalsPresent: true,
      },
      observed: {
        vin: '1HGCM82633A004352',
        stockNumber: 'A1',
        year: 2023,
        make: 'Toyota',
        model: 'RAV4',
        trim: 'XLE',
        price: 31995,
        odometer: 15000,
        photoCount: 12,
        primaryPhoto: 'https://dealer.example/a.jpg?size=large',
        transmission: 'Automatic',
        drivetrain: 'AWD',
        fuelType: 'Gasoline',
        exteriorColor: 'Blue',
        interiorColor: 'Black',
        carfaxUrl: 'https://vhr.carfax.ca/report?id=abc',
        carfaxBadges: ['One Owner'],
      },
    };

    const artifact = buildSourceTruthCertificationArtifactFromLiveReconciliation({
      dealershipId: 9,
      dealershipLabel: 'test-store',
      storedInventoryTotal: 25,
      latestScrapeRunId: 11,
      consecutiveDaysAbove95: 7,
      liveArtifact: {
        generatedAt: new Date().toISOString(),
        dealership: {
          listingPageSignals: {
            visibleVehicleLinkCount: 25,
          },
        },
        sampledVehicles: Array.from({ length: 10 }, () => sample),
      },
    });

    const assessment = assessDealershipScrapeCertificationArtifact(artifact);

    expect(artifact.gate.passed).toBe(true);
    expect(artifact.launchEligible).toBe(true);
    expect(assessment.usable).toBe(true);
  });
});
