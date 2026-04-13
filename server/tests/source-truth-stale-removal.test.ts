import { assessSourceTruthStaleRemoval } from '../source-truth-stale-removal';

describe('source-truth-stale-removal', () => {
  test('identifies stale active inventory when fresh source URLs are available', () => {
    const decision = assessSourceTruthStaleRemoval({
      visibleSourceVehicleUrls: [
        'https://dealer.example/vehicles/2025/kia/ev6/path/?sale_class=used',
        'https://dealer.example/vehicles/2024/acura/zdx/path',
      ],
      observedVehicles: [
        { id: 1, dealerVdpUrl: 'https://dealer.example/vehicles/2025/kia/ev6/path', year: 2025, make: 'Kia', model: 'EV6', trim: 'Land' },
        { id: 2, dealerVdpUrl: 'https://dealer.example/vehicles/2024/acura/zdx/path', year: 2024, make: 'Acura', model: 'ZDX', trim: 'Type S' },
        { id: 3, dealerVdpUrl: 'https://dealer.example/vehicles/2023/jeep/wrangler/path', year: 2023, make: 'Jeep', model: 'Wrangler', trim: 'Hybrid' },
      ],
      minVisibleSourceVehicleCount: 2,
    });

    expect(decision.safeToApply).toBe(true);
    expect(decision.foundVehicleIds).toEqual([1, 2]);
    expect(decision.staleVehicleCount).toBe(1);
    expect(decision.staleVehicles.map((vehicle) => vehicle.id)).toEqual([3]);
  });

  test('blocks deletions when source coverage is too small', () => {
    const decision = assessSourceTruthStaleRemoval({
      visibleSourceVehicleUrls: ['https://dealer.example/vehicles/2025/kia/ev6/path'],
      observedVehicles: [{ id: 1, dealerVdpUrl: 'https://dealer.example/vehicles/2025/kia/ev6/path' }],
      minVisibleSourceVehicleCount: 2,
    });

    expect(decision.safeToApply).toBe(false);
    expect(decision.blockedReason).toBe('source_vehicle_count_below_threshold');
  });

  test('blocks deletions when the stale ratio exceeds the guardrail', () => {
    const decision = assessSourceTruthStaleRemoval({
      visibleSourceVehicleUrls: [
        'https://dealer.example/vehicles/2025/kia/ev6/path',
        'https://dealer.example/vehicles/2024/acura/zdx/path',
      ],
      observedVehicles: [
        { id: 1, dealerVdpUrl: 'https://dealer.example/vehicles/2025/kia/ev6/path' },
        { id: 2, dealerVdpUrl: 'https://dealer.example/vehicles/2021/honda/civic/path' },
        { id: 3, dealerVdpUrl: 'https://dealer.example/vehicles/2020/toyota/corolla/path' },
        { id: 4, dealerVdpUrl: 'https://dealer.example/vehicles/2019/mazda/cx-5/path' },
      ],
      minVisibleSourceVehicleCount: 2,
      maxDeletionRatio: 0.5,
    });

    expect(decision.safeToApply).toBe(false);
    expect(decision.blockedReason).toBe('stale_deletion_ratio_above_threshold');
    expect(decision.staleVehicleCount).toBe(3);
  });
});
