import { normalizeStockNumber, isPlaceholderVin } from '../inventory-identity';

describe('inventory-identity', () => {
  test('normalizeStockNumber strips non-alnum and uppercases', () => {
    expect(normalizeStockNumber(' ab-123 ')).toBe('AB123');
    expect(normalizeStockNumber('')).toBeNull();
    expect(normalizeStockNumber(null)).toBeNull();
  });

  test('isPlaceholderVin detects pending', () => {
    expect(isPlaceholderVin(null)).toBe(true);
    expect(isPlaceholderVin('PENDING')).toBe(true);
    expect(isPlaceholderVin('pending-123')).toBe(true);
    expect(isPlaceholderVin('1HGCM82633A004352')).toBe(false);
  });
});
