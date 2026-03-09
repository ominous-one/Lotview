import { parseCancelledBy } from '../appointments/appointment-input';

describe('WS4E appointment cancelledBy parsing', () => {
  test('accepts BUYER (any case)', () => {
    expect(parseCancelledBy('BUYER')).toBe('BUYER');
    expect(parseCancelledBy('buyer')).toBe('BUYER');
    expect(parseCancelledBy(' Buyer ')).toBe('BUYER');
  });

  test('accepts DEALER (any case)', () => {
    expect(parseCancelledBy('DEALER')).toBe('DEALER');
    expect(parseCancelledBy('dealer')).toBe('DEALER');
  });

  test('defaults to DEALER when omitted', () => {
    expect(parseCancelledBy(undefined)).toBe('DEALER');
    expect(parseCancelledBy(null)).toBe('DEALER');
  });

  test('rejects unknown values', () => {
    expect(() => parseCancelledBy('salesperson')).toThrow(/Invalid cancelledBy/);
  });
});
