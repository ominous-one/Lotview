import {
  buildComparableVehicleTruthSamples,
  buildLiveSourceReconciliationArtifact,
  matchObservedVehicle,
  normalizeCarfaxEvidenceUrl,
  normalizeDealerVdpUrl,
} from '../live-source-reconciliation';

describe('live-source-reconciliation', () => {
  test('normalizes dealership VDP URLs consistently', () => {
    expect(normalizeDealerVdpUrl('https://Dealer.example/vehicles/2025/kia/ev6/path/?sale_class=used')).toBe(
      'https://dealer.example/vehicles/2025/kia/ev6/path',
    );
  });

  test('matches observed vehicles by canonical VDP URL before VIN fallback', () => {
    const sourceVehicle = {
      dealerVdpUrl: 'https://dealer.example/vehicles/2025/kia/ev6/path/?sale_class=used',
      vin: 'VIN123',
      stockNumber: 'STK1',
    } as any;
    const observedVehicles = [
      {
        id: 99,
        dealerVdpUrl: 'https://dealer.example/vehicles/2025/kia/ev6/path',
        vin: 'OTHER',
        stockNumber: 'OTHER',
      },
    ];

    expect(matchObservedVehicle(sourceVehicle, observedVehicles)).toEqual({
      vehicle: observedVehicles[0],
      matchedBy: 'dealerVdpUrl',
    });
  });

  test('builds reconciliation artifact with missing inventory coverage and sample mismatch summaries', () => {
    const artifact = buildLiveSourceReconciliationArtifact({
      dealership: {
        id: 1,
        label: 'olympic',
        name: 'Olympic Hyundai Vancouver',
      },
      listingUrl: 'https://dealer.example/vehicles/used',
      visibleSourceVehicleCount: 12,
      sourceVehicleUrls: [
        'https://dealer.example/vehicles/2025/kia/ev6/path',
        'https://dealer.example/vehicles/2024/acura/zdx/path',
        'https://dealer.example/vehicles/2023/acura/tlx/path',
      ],
      sourceVehicles: [
        {
          year: 2025,
          make: 'Kia',
          model: 'EV6',
          trim: 'Land AWD',
          price: 51888,
          odometer: 182,
          images: ['https://dealer.example/a.jpg'],
          badges: ['One Owner'],
          dealershipId: 1,
          dealership: 'Olympic Hyundai Vancouver',
          location: 'Vancouver',
          dealerVdpUrl: 'https://dealer.example/vehicles/2025/kia/ev6/path',
          vin: 'VIN1',
          stockNumber: 'STK1',
          carfaxUrl: 'https://vhr.carfax.ca/report?id=1',
          transmission: 'Automatic',
          drivetrain: 'AWD',
          fuelType: 'Electric',
          exteriorColor: 'White',
        },
        {
          year: 2023,
          make: 'Acura',
          model: 'TLX',
          trim: 'A-Spec',
          price: 40888,
          odometer: 12000,
          images: ['https://dealer.example/b.jpg'],
          badges: [],
          dealershipId: 1,
          dealership: 'Olympic Hyundai Vancouver',
          location: 'Vancouver',
          dealerVdpUrl: 'https://dealer.example/vehicles/2023/acura/tlx/path',
          vin: 'VIN2',
          stockNumber: 'STK2',
          carfaxUrl: null,
          transmission: 'Automatic',
          drivetrain: 'AWD',
          fuelType: 'Gasoline',
          exteriorColor: 'Blue',
        },
      ] as any,
      observedVehicles: [
        {
          id: 10,
          vin: 'VIN1',
          stockNumber: 'STK1',
          year: 2025,
          make: 'Kia',
          model: 'EV6',
          trim: 'Land AWD',
          price: 51888,
          odometer: 182,
          images: ['https://dealer.example/a.jpg'],
          transmission: 'Automatic',
          drivetrain: 'AWD',
          fuelType: 'Electric',
          exteriorColor: 'White',
          carfaxUrl: 'https://vhr.carfax.ca/report?id=1',
          carfaxBadges: ['OneOwner'],
          dealerVdpUrl: 'https://dealer.example/vehicles/2025/kia/ev6/path',
        },
      ],
    });

    expect(artifact.dealership.listingPageSignals.visibleVehicleLinkCount).toBe(12);
    expect(artifact.dealership.listingPageSignals.visibleVehicleUrls).toEqual([
      'https://dealer.example/vehicles/2025/kia/ev6/path',
      'https://dealer.example/vehicles/2024/acura/zdx/path',
      'https://dealer.example/vehicles/2023/acura/tlx/path',
    ]);
    expect(artifact.dealership.listingPageSignals.missingStoredVehicleCount).toBe(2);
    expect(artifact.sampledVehicles[0].reconciliationSummary.status).toBe('match');
    expect(artifact.sampledVehicles[1].reconciliationSummary.status).toBe('missing_in_inventory');
    expect(artifact.sampledVehicles[1].reconciliationSummary.blockingMismatches).toEqual(['missing_inventory_vehicle']);
  });

  test('comparison samples ignore internal proxy image URLs and treat live photo count as a lower bound', () => {
    const comparable = buildComparableVehicleTruthSamples(
      {
        vin: 'VIN1',
        stockNumber: 'STK1',
        year: 2025,
        make: 'Kia',
        model: 'EV6',
        price: 51888,
        odometer: 182,
        images: Array.from({ length: 9 }, (_, index) => `https://dealer.example/${index}.jpg`),
        primaryPhoto: 'https://dealer.example/0.jpg',
        carfaxUrl: 'https://www.carfax.ca/',
      },
      {
        vin: 'VIN1',
        stockNumber: 'STK1',
        year: 2025,
        make: 'Kia',
        model: 'EV6',
        price: 51888,
        odometer: 182,
        images: Array.from({ length: 24 }, (_, index) => `/api/public/vehicle-image/10/${index}`),
        primaryPhoto: '/api/public/vehicle-image/10/0',
        carfaxUrl: 'https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=VIN1',
      },
      ['No Reported Accidents'],
      ['AccidentFree'],
    );

    expect(comparable.source.photoCount).toBe(24);
    expect(comparable.observed.photoCount).toBe(24);
    expect(comparable.source.primaryPhoto).toBeNull();
    expect(comparable.observed.primaryPhoto).toBeNull();
    expect(comparable.source.carfaxUrl).toBeNull();
    expect(comparable.observed.carfaxUrl).toBeNull();
    expect(comparable.source.carfaxBadges).toEqual(['No Reported Accidents']);
    expect(comparable.observed.carfaxBadges).toEqual(['No Reported Accidents']);
  });

  test('drops generic CARFAX homepages from evidence URLs', () => {
    expect(normalizeCarfaxEvidenceUrl('https://www.carfax.ca/')).toBeNull();
    expect(normalizeCarfaxEvidenceUrl('https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=VIN1')).toBeNull();
    expect(normalizeCarfaxEvidenceUrl('https://vhr.carfax.ca/report?id=123')).toBe('https://vhr.carfax.ca/report?id=123');
  });

  test('sanitizes detail noise before truth comparison', () => {
    const comparable = buildComparableVehicleTruthSamples(
      {
        vin: 'VIN1',
        stockNumber: 'STK1',
        year: 2025,
        make: 'Kia',
        model: 'EV6',
        trim: 'Land',
        price: 51888,
        odometer: 182,
        images: ['https://dealer.example/0.jpg'],
        transmission: 'Automatic',
        drivetrain: 'AWD',
        fuelType: 'Electric',
        exteriorColor: 'Blue',
        interiorColor: 'Print Page',
      },
      {
        vin: 'VIN1',
        stockNumber: 'STK1',
        year: 2025,
        make: 'Kia',
        model: 'EV6',
        trim: 'www.olympichyundaivancouver.com',
        price: 51888,
        odometer: 182,
        images: ['https://dealer.example/0.jpg'],
        transmission: 'Automatic',
        drivetrain: 'AWD',
        fuelType: 'Electric',
        exteriorColor: 'Blue   Engine: Electric Transmission: Automatic Drive Train: AWD  Mileage: 11',
        interiorColor: 'Black',
      },
    );

    expect(comparable.source.interiorColor).toBeNull();
    expect(comparable.observed.trim).toBeNull();
    expect(comparable.observed.exteriorColor).toBe('Blue');
  });
});
