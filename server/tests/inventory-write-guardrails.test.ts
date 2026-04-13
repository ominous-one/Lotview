import { assessInventoryWrite, normalizeGroundedCarfaxUrl, sanitizeVehicleColorField } from '../inventory-write-guardrails';

describe('inventory write guardrails', () => {
  test('blocks low-confidence inserts before bad placeholder rows are created', () => {
    const decision = assessInventoryWrite({
      year: 2026,
      make: 'Nissan',
      model: 'Leaf',
      trim: 'www.olympichyundaivancouver.com',
      price: 0,
      odometer: 0,
      images: [],
      vin: null,
      stockNumber: null,
      dealerVdpUrl: 'https://www.olympichyundaivancouver.com/vehicles/2026/nissan/leaf/vancouver/bc/69514072',
      carfaxUrl: null,
      carfaxBadges: [],
    });

    expect(decision.allow).toBe(false);
    expect(decision.blockers).toEqual(expect.arrayContaining([
      'insert_identity_incomplete',
      'insert_low_confidence_payload',
    ]));
    expect(decision.warnings).toContain('suspicious_trim_discarded');
  });

  test('blocks destructive regressions against an already trustworthy row', () => {
    const decision = assessInventoryWrite(
      {
        year: 2025,
        make: 'Kia',
        model: 'Ev6',
        trim: 'www.olympichyundaivancouver.com',
        price: 0,
        odometer: 0,
        images: [],
        vin: null,
        stockNumber: null,
        dealerVdpUrl: 'https://www.olympichyundaivancouver.com/vehicles/2025/kia/ev6/vancouver/bc/69299603',
        carfaxUrl: 'https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=5XYC3DJC7SG005262',
        carfaxBadges: [],
      },
      {
        id: 38,
        year: 2025,
        make: 'Kia',
        model: 'Ev6',
        trim: 'Land',
        price: 51888,
        odometer: 0,
        images: ['/api/public/vehicle-image/38/0'],
        vin: '5XYC3DJC7SG005262',
        stockNumber: 'OHV397013A',
        normalizedStockNumber: 'OHV397013A',
        carfaxUrl: null,
        carfaxBadges: ['No Reported Accidents', 'One Owner'],
        dealerVdpUrl: 'https://www.olympichyundaivancouver.com/vehicles/2025/kia/ev6/vancouver/bc/69299603',
        exteriorColor: 'White',
        interiorColor: 'Black',
        transmission: 'Automatic',
        fuelType: 'Electric',
        drivetrain: 'AWD',
        engine: null,
      },
    );

    expect(decision.allow).toBe(false);
    expect(decision.blockers).toContain('destructive_regression_payload');
    expect(decision.warnings).toEqual(expect.arrayContaining([
      'suspicious_trim_discarded',
      'ungrounded_carfax_url_discarded',
    ]));
  });

  test('blocks identity conflicts instead of merging mismatched vehicles', () => {
    const decision = assessInventoryWrite(
      {
        year: 2025,
        make: 'Audi',
        model: 'Q3',
        trim: 'Technik',
        price: 47888,
        odometer: 6818,
        images: ['https://cdn.example.com/a.jpg'],
        vin: 'WA1FECF37S1089281',
        stockNumber: 'OHV396042A',
        dealerVdpUrl: 'https://www.olympichyundaivancouver.com/vehicles/2025/audi/q3/vancouver/bc/69684447',
        carfaxUrl: null,
        carfaxBadges: ['One Owner'],
      },
      {
        id: 46,
        year: 2025,
        make: 'Audi',
        model: 'Q3',
        trim: 'Technik',
        price: 47888,
        odometer: 6818,
        images: ['/api/public/vehicle-image/46/0'],
        vin: 'WA1FECF37S1089281',
        stockNumber: 'OHV396042A',
        normalizedStockNumber: 'ohv396042a',
        carfaxUrl: null,
        carfaxBadges: ['One Owner'],
        dealerVdpUrl: 'https://www.olympichyundaivancouver.com/vehicles/2025/audi/q3/vancouver/bc/69684447',
        exteriorColor: 'Black',
        interiorColor: 'Black',
        transmission: 'Automatic',
        fuelType: 'Gasoline',
        drivetrain: 'AWD',
        engine: null,
      },
    );

    expect(decision.allow).toBe(true);

    const conflict = assessInventoryWrite(
      {
        year: 2025,
        make: 'Audi',
        model: 'Q3',
        trim: 'Technik',
        price: 47888,
        odometer: 6818,
        images: ['https://cdn.example.com/a.jpg'],
        vin: 'WA1FECF37S1089282',
        stockNumber: 'OHV396042A',
        dealerVdpUrl: 'https://www.olympichyundaivancouver.com/vehicles/2025/audi/q3/vancouver/bc/69684447',
        carfaxUrl: null,
        carfaxBadges: ['One Owner'],
      },
      {
        id: 46,
        year: 2025,
        make: 'Audi',
        model: 'Q3',
        trim: 'Technik',
        price: 47888,
        odometer: 6818,
        images: ['/api/public/vehicle-image/46/0'],
        vin: 'WA1FECF37S1089281',
        stockNumber: 'OHV396042A',
        normalizedStockNumber: 'ohv396042a',
        carfaxUrl: null,
        carfaxBadges: ['One Owner'],
        dealerVdpUrl: 'https://www.olympichyundaivancouver.com/vehicles/2025/audi/q3/vancouver/bc/69684447',
        exteriorColor: 'Black',
        interiorColor: 'Black',
        transmission: 'Automatic',
        fuelType: 'Gasoline',
        drivetrain: 'AWD',
        engine: null,
      },
    );

    expect(conflict.allow).toBe(false);
    expect(conflict.blockers).toContain('vin_conflict_with_existing_record');
  });

  test('accepts only grounded CARFAX URLs', () => {
    expect(normalizeGroundedCarfaxUrl('https://www.carfax.ca/')).toBeNull();
    expect(normalizeGroundedCarfaxUrl('https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=KM8KN4AE6NU054295')).toBeNull();
    expect(normalizeGroundedCarfaxUrl('https://vhr.carfax.ca/?id=resolved')).toBe('https://vhr.carfax.ca/?id=resolved');
  });

  test('salvages real color tokens from noisy scraped color strings', () => {
    expect(sanitizeVehicleColorField('Blue   Engine: Electric Transmission: Automatic Drive Train: AWD  Mileage: 11')).toBe('Blue');
    expect(sanitizeVehicleColorField('Heated Front Zero Gravity Seats -inc: 8-way power driver seat')).toBeNull();
  });
});
