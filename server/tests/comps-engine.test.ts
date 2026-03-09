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
      trimMode: 'near',
      comp: {
        listingUrl: 'x',
        source: 'cargurus',
        year: 2021,
        make: 'Toyota',
        model: 'RAV4',
        trim: 'XLE',
        price: 30500,
        accidentHistory: 'unknown',
      },
    });

    expect(scored.components.trim).toBeGreaterThan(0);
    expect(scored.reasons.join(' ')).toContain('Near-trim');
  });
});
