import { evaluateDealershipScrapeGate, reconcileVehicleTruth } from '../scrape-truth-foundation';
import { summarizeDealershipScrapeGateBlockReason } from '../autopost-queue-service';

describe('scrape truth foundation', () => {
  test('reconciliation reports exact mismatches and blocking reasons', () => {
    const result = reconcileVehicleTruth({
      dealershipId: 7,
      source: {
        vin: '1HGCM82633A004352',
        stockNumber: 'A1',
        year: 2023,
        make: 'Toyota',
        model: 'RAV4',
        trim: 'XLE',
        price: 31995,
        odometer: 15000,
        photoCount: 12,
        primaryPhoto: 'https://dealer.example/a.jpg',
        transmission: 'Automatic',
        drivetrain: 'AWD',
        fuelType: 'Gasoline',
        carfaxUrl: 'https://vhr.carfax.ca/report?id=abc',
        carfaxBadges: ['One Owner'],
      },
      observed: {
        vin: '1HGCM82633A004352',
        stockNumber: 'A1',
        year: 2023,
        make: 'Toyota',
        model: 'RAV4',
        trim: 'LE',
        price: 30995,
        odometer: 15150,
        photoCount: 9,
        primaryPhoto: 'https://dealer.example/b.jpg',
        transmission: 'Automatic',
        drivetrain: 'FWD',
        fuelType: 'Gasoline',
        carfaxUrl: null,
        carfaxBadges: [],
      },
    });

    expect(result.matches).toEqual(expect.arrayContaining(['vin', 'stockNumber', 'year', 'make', 'model', 'transmission', 'fuelType']));
    expect(result.blockingReasons).toEqual(expect.arrayContaining([
      'price:Price mismatch',
      'photoCount:Photo count mismatch',
      'primaryPhoto:Primary photo mismatch',
    ]));
    expect(result.mismatches.map(m => m.field)).toEqual(expect.arrayContaining([
      'trim',
      'price',
      'odometer',
      'photoCount',
      'primaryPhoto',
      'drivetrain',
      'carfaxUrl',
      'carfaxBadges',
    ]));
  });

  test('dealership gate passes when all launch thresholds are met', () => {
    const sample = reconcileVehicleTruth({
      dealershipId: 9,
      source: {
        vin: '1HGCM82633A004352',
        stockNumber: 'A1',
        year: 2023,
        make: 'Toyota',
        model: 'RAV4',
        trim: 'XLE',
        price: 31995,
        odometer: 15000,
        photoCount: 12,
        primaryPhoto: 'https://dealer.example/a.jpg',
        transmission: 'Automatic',
        drivetrain: 'AWD',
        fuelType: 'Gasoline',
        exteriorColor: 'Blue',
        interiorColor: 'Black',
        carfaxUrl: null,
        carfaxBadges: [],
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
        carfaxUrl: null,
        carfaxBadges: [],
      },
    });

    const gate = evaluateDealershipScrapeGate({
      dealershipId: 9,
      sampledVehicles: Array.from({ length: 25 }, () => sample),
      scrapeSuccessRate: 0.995,
      staleRemovalWithinSla: true,
      consecutiveDaysAbove95: 7,
      imageContaminationRate: 0,
      hasCarfaxUnknownsOnlyWhenAbsent: true,
    });

    expect(gate.passed).toBe(true);
    expect(gate.score).toBeGreaterThanOrEqual(95);
    expect(gate.blockers).toEqual([]);
  });

  test('dealership gate hard fails when VIN mismatch exists even if most metrics are healthy', () => {
    const good = reconcileVehicleTruth({
      dealershipId: 4,
      source: { vin: '1', stockNumber: 'A', year: 2020, make: 'Ford', model: 'Escape', price: 20000, photoCount: 5, primaryPhoto: 'https://a', trim: 'SEL', odometer: 10000, transmission: 'Auto', drivetrain: 'AWD', fuelType: 'Gas', exteriorColor: 'White', interiorColor: 'Black' },
      observed: { vin: '1', stockNumber: 'A', year: 2020, make: 'Ford', model: 'Escape', price: 20000, photoCount: 5, primaryPhoto: 'https://a', trim: 'SEL', odometer: 10000, transmission: 'Auto', drivetrain: 'AWD', fuelType: 'Gas', exteriorColor: 'White', interiorColor: 'Black' },
    });
    const bad = reconcileVehicleTruth({
      dealershipId: 4,
      source: { vin: '2', stockNumber: 'B', year: 2021, make: 'Ford', model: 'Edge', price: 25000, photoCount: 7, primaryPhoto: 'https://b', trim: 'Titanium', odometer: 12000, transmission: 'Auto', drivetrain: 'AWD', fuelType: 'Gas', exteriorColor: 'Gray', interiorColor: 'Black' },
      observed: { vin: 'WRONG', stockNumber: 'B', year: 2021, make: 'Ford', model: 'Edge', price: 25000, photoCount: 7, primaryPhoto: 'https://b', trim: 'Titanium', odometer: 12000, transmission: 'Auto', drivetrain: 'AWD', fuelType: 'Gas', exteriorColor: 'Gray', interiorColor: 'Black' },
    });

    const gate = evaluateDealershipScrapeGate({
      dealershipId: 4,
      sampledVehicles: [...Array.from({ length: 24 }, () => good), bad],
      scrapeSuccessRate: 0.999,
      staleRemovalWithinSla: true,
      consecutiveDaysAbove95: 7,
      imageContaminationRate: 0,
      hasCarfaxUnknownsOnlyWhenAbsent: true,
    });

    expect(gate.passed).toBe(false);
    expect(gate.blockers).toContain('vin_mismatch_present');
  });

  test('dealership gate fails until seven consecutive green days are reached', () => {
    const good = reconcileVehicleTruth({
      dealershipId: 11,
      source: { vin: '1', stockNumber: 'A', year: 2020, make: 'Honda', model: 'Civic', price: 22000, photoCount: 8, primaryPhoto: 'https://a', trim: 'EX', odometer: 15000, transmission: 'Auto', drivetrain: 'FWD', fuelType: 'Gas', exteriorColor: 'Red', interiorColor: 'Black' },
      observed: { vin: '1', stockNumber: 'A', year: 2020, make: 'Honda', model: 'Civic', price: 22000, photoCount: 8, primaryPhoto: 'https://a', trim: 'EX', odometer: 15000, transmission: 'Auto', drivetrain: 'FWD', fuelType: 'Gas', exteriorColor: 'Red', interiorColor: 'Black' },
    });

    const gate = evaluateDealershipScrapeGate({
      dealershipId: 11,
      sampledVehicles: Array.from({ length: 25 }, () => good),
      scrapeSuccessRate: 0.995,
      staleRemovalWithinSla: true,
      consecutiveDaysAbove95: 6,
      imageContaminationRate: 0,
      hasCarfaxUnknownsOnlyWhenAbsent: true,
    });

    expect(gate.passed).toBe(false);
    expect(gate.blockers).toContain('insufficient_consecutive_green_days');
  });

  test('carfax truthfulness fails if the system implies history when source is absent', () => {
    const good = reconcileVehicleTruth({
      dealershipId: 12,
      source: { vin: '1', stockNumber: 'A', year: 2020, make: 'Honda', model: 'CR-V', price: 28000, photoCount: 8, primaryPhoto: 'https://a', trim: 'EX-L', odometer: 15000, transmission: 'Auto', drivetrain: 'AWD', fuelType: 'Gas', exteriorColor: 'Silver', interiorColor: 'Black', carfaxUrl: null, carfaxBadges: [] },
      observed: { vin: '1', stockNumber: 'A', year: 2020, make: 'Honda', model: 'CR-V', price: 28000, photoCount: 8, primaryPhoto: 'https://a', trim: 'EX-L', odometer: 15000, transmission: 'Auto', drivetrain: 'AWD', fuelType: 'Gas', exteriorColor: 'Silver', interiorColor: 'Black', carfaxUrl: null, carfaxBadges: [] },
    });

    const gate = evaluateDealershipScrapeGate({
      dealershipId: 12,
      sampledVehicles: Array.from({ length: 25 }, () => good),
      scrapeSuccessRate: 0.995,
      staleRemovalWithinSla: true,
      consecutiveDaysAbove95: 7,
      imageContaminationRate: 0,
      hasCarfaxUnknownsOnlyWhenAbsent: false,
    });

    expect(gate.passed).toBe(false);
    expect(gate.blockers).toContain('carfax_truthfulness_failed');
  });

  test('autopost layer gets a dealership-level scrape gate block reason', () => {
    const reason = summarizeDealershipScrapeGateBlockReason({
      dealershipId: 5,
      score: 91.2,
      passed: false,
      blockers: ['overall_score_below_launch_gate', 'price_accuracy_below_threshold'],
      categoryBreakdown: {
        identity: 100,
        price: 90,
        media: 100,
        details: 100,
        freshness: 100,
        history: 100,
      },
    });

    expect(reason).toContain('SCRAPE_GATE_FAILED:91');
    expect(reason).toContain('overall_score_below_launch_gate');
  });
});
