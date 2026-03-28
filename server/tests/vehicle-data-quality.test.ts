import { buildVehicleTruthfulnessContext, computeVehicleDataQualitySignals } from '../vehicle-data-quality';

describe('vehicle-data-quality', () => {
  test('marks active fresh vehicle with VIN + stock as availability-safe', () => {
    const signals = computeVehicleDataQualitySignals({
      vin: '1HGCM82633A004352',
      stockNumber: ' ab-123 ',
      normalizedStockNumber: null,
      dealerVdpUrl: 'https://dealer.example/vehicle/1',
      carfaxUrl: 'https://vhr.carfax.ca/?id=abc',
      carfaxBadges: ['One Owner'],
      lastScrapedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      deletedAt: null,
      lifecycleStatus: 'ACTIVE',
      photoStatus: 'complete',
    });

    expect(signals.isFreshForAvailability).toBe(true);
    expect(signals.isSoldOrRemoved).toBe(false);
    expect(signals.hasExactIdentity).toBe(true);
    expect(signals.hasTrustedHistorySignal).toBe(true);
    expect(signals.blockers).toEqual([]);
  });

  test('flags stale sold vehicle with incomplete identity', () => {
    const signals = computeVehicleDataQualitySignals({
      vin: 'PENDING',
      stockNumber: null,
      normalizedStockNumber: null,
      dealerVdpUrl: null,
      carfaxUrl: null,
      carfaxBadges: [],
      lastScrapedAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
      deletedAt: new Date(),
      lifecycleStatus: 'REMOVED_BY_SYNC',
      photoStatus: 'no_vdp',
    });

    expect(signals.isFreshForAvailability).toBe(false);
    expect(signals.isSoldOrRemoved).toBe(true);
    expect(signals.hasExactIdentity).toBe(false);
    expect(signals.blockers).toEqual(expect.arrayContaining([
      'inventory_not_active',
      'inventory_stale',
      'identity_incomplete',
      'missing_vdp_source',
    ]));
  });

  test('truthfulness context surfaces freshness and guardrails', () => {
    const lines = buildVehicleTruthfulnessContext({
      vin: null,
      stockNumber: 'Z9',
      normalizedStockNumber: 'Z9',
      dealerVdpUrl: 'https://dealer.example/vehicle/2',
      carfaxUrl: null,
      carfaxBadges: [],
      lastScrapedAt: null,
      deletedAt: null,
      lifecycleStatus: 'ACTIVE',
      photoStatus: 'pending',
    });

    expect(lines.join('\n')).toContain('Inventory Freshness: unknown');
    expect(lines.join('\n')).toContain('Truthfulness Guardrails: freshness_unknown, identity_incomplete, inventory_stale');
  });
});
