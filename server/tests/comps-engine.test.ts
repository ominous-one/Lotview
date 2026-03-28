import { scoreComp } from '../comps-scoring';

describe('comps-engine scoring', () => {
  test('exact trim mode heavily penalizes trim mismatch', () => {
    const scored = scoreComp({
      subjectYear: 2021,
      subjectMileageKm: 60000,
      subjectTrim: 'Limited',
      trimMode: 'exact',
      comp: {
        listingUrl: 'x',
        source: 'marketcheck',
        year: 2021,
        make: 'Toyota',
        model: 'RAV4',
        trim: 'LE',
        price: 30000,
        accidentHistory: 'unknown',
      },
    });

    expect(scored.components.trim).toBe(0);
    expect(scored.total).toBeLessThan(60);
  });

  test('near trim mode gives partial credit for token overlap', () => {
    const scored = scoreComp({
      subjectYear: 2021,
      subjectMileageKm: 60000,
      subjectTrim: 'XLE Premium',
      subjectDrivetrain: 'AWD',
      trimMode: 'near',
      comp: {
        listingUrl: 'x',
        source: 'cargurus',
        year: 2021,
        make: 'Toyota',
        model: 'RAV4',
        trim: 'XLE AWD',
        drivetrain: 'AWD',
        price: 30500,
        scrapedAt: new Date(),
        accidentHistory: 'unknown',
      },
    });

    expect(scored.components.trim).toBeGreaterThan(0);
    expect(scored.components.drivetrain).toBe(10);
    expect(scored.components.freshness).toBeGreaterThan(0);
    expect(scored.reasons.join(' ')).toContain('Near-trim');
  });

  test('drivetrain mismatch is explicitly penalized', () => {
    const scored = scoreComp({
      subjectYear: 2024,
      subjectMileageKm: 15000,
      subjectTrim: 'Preferred AWD',
      subjectDrivetrain: 'AWD',
      trimMode: 'near',
      comp: {
        listingUrl: 'x',
        source: 'autotrader',
        year: 2024,
        make: 'Hyundai',
        model: 'Tucson',
        trim: 'Preferred FWD',
        drivetrain: 'FWD',
        price: 32995,
        scrapedAt: new Date(Date.now() - 45 * 86400000),
        accidentHistory: 'unknown',
      },
    });

    expect(scored.components.drivetrain).toBe(0);
    expect(scored.components.freshness).toBe(0);
    expect(scored.reasons.join(' ')).toContain('Drivetrain mismatch');
    expect(scored.reasons.join(' ')).toContain('Scrape age 45d');
  });
});
