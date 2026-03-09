import { conditionForDisplay, mapConditionEnum, normalizeCondition } from '../condition-normalization';

describe('condition normalization', () => {
  test('maps common raw strings to enum', () => {
    expect(mapConditionEnum('Excellent')).toBe('excellent');
    expect(mapConditionEnum('like new')).toBe('excellent');
    expect(mapConditionEnum('Very Good')).toBe('good');
    expect(mapConditionEnum('fair condition')).toBe('fair');
    expect(mapConditionEnum('needs work')).toBe('poor');
    expect(mapConditionEnum('')).toBe('unknown');
    expect(mapConditionEnum(null)).toBe('unknown');
  });

  test('selects best candidate using source priority and known-vs-unknown', () => {
    const r = normalizeCondition([
      { source: 'kijiji', raw: 'unknown' },
      { source: 'marketcheck', raw: 'good' },
      { source: 'craigslist', raw: 'excellent' },
    ]);

    // marketcheck has highest priority among known values
    expect(r.condition).toBe('good');
  });

  test('UI display helper returns null for unknown', () => {
    expect(conditionForDisplay('unknown')).toBeNull();
    expect(conditionForDisplay('good')).toBe('good');
  });
});
