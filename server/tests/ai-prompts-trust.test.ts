import { buildCarfaxContext, buildSalesAgentSystemPrompt, buildVehicleContext } from '../ai-prompts';

describe('ai prompt truthfulness proof', () => {
  test('vehicle context carries freshness + provenance guardrails alongside CARFAX availability', () => {
    const context = buildVehicleContext({
      id: 101,
      year: 2022,
      make: 'Toyota',
      model: 'RAV4',
      trim: 'XLE',
      price: 34995,
      odometer: 42123,
      exteriorColor: 'Blue',
      interiorColor: 'Black',
      transmission: 'Automatic',
      drivetrain: 'AWD',
      fuelType: 'Gasoline',
      type: 'SUV',
      vin: '2T3R1RFV0NW123456',
      stockNumber: 'rv-42',
      normalizedStockNumber: 'RV42',
      dealerVdpUrl: 'https://dealer.example/vehicles/rav4-xle',
      carfaxUrl: 'https://vhr.carfax.ca/?id=proof',
      carfaxBadges: ['One Owner'],
      lastScrapedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      deletedAt: null,
      lifecycleStatus: 'ACTIVE',
      photoStatus: 'complete',
      badges: ['Heated Seats'],
      highlights: 'AWD | Heated Seats',
      dealRating: 'Great Deal',
      cargurusPrice: 35250,
      vdpDescription: 'Clean local SUV with a documented service history.',
      techSpecs: JSON.stringify({ features: ['Blind Spot Monitor'], interior: ['Heated steering wheel'] }),
      dealership: 'Trust Toyota',
      location: 'Surrey, BC',
    } as any);

    expect(context).toContain('Carfax URL Available: yes');
    expect(context).toContain('Verification Signals: inventory:last_scraped_at, identity:vin, identity:stock, source:dealer_vdp, history:carfax_url, history:carfax_badges');
    expect(context).toContain('Inventory Freshness:');
    expect(context).not.toContain('Truthfulness Guardrails:');
  });

  test('sales prompt hard-blocks invented history and unsupported promises', () => {
    const prompt = buildSalesAgentSystemPrompt({
      dealership: {
        name: 'Trust Toyota',
        address: '123 Main St',
        city: 'Surrey',
        province: 'BC',
        postalCode: 'V3T 1A1',
        phone: '604-555-0101',
      } as any,
      currentDateTime: 'Monday, March 30, 2026 4:50 PM',
      vehicleContext: 'Vehicle: 2022 Toyota RAV4 XLE',
      carfaxContext: 'CARFAX available only. No structured accident count stored.',
      conversationMeta: { isFirstMessage: true },
      aiSettings: null,
    });

    expect(prompt).toContain('Never summarize a Carfax/history report unless the data above explicitly supports it.');
    expect(prompt).toContain('Never promise financing approval, price discounts, accident-free status, or warranty coverage unless the data above explicitly supports it.');
    expect(prompt).toContain('=== CARFAX REPORT ===\nCARFAX available only. No structured accident count stored.');
  });

  test('carfax context prefers exact stored facts over marketing spin', () => {
    const context = buildCarfaxContext({
      accidentCount: 0,
      ownerCount: 1,
      serviceRecordCount: 9,
      lastReportedOdometer: 41880,
      damageReported: false,
      lienReported: false,
      badges: ['One Owner', 'No Accidents Reported'],
    });

    expect(context).toContain('No reported accidents');
    expect(context).toContain('1 previous owner(s)');
    expect(context).toContain('9 service records on file');
    expect(context).toContain('Last reported odometer: 41,880 km');
    expect(context).toContain('Badges: One Owner, No Accidents Reported');
  });
});
