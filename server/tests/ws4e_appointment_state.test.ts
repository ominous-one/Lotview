import { assertAllowedTransition } from '../appointments/appointment-state';

describe('WS4E appointment state machine', () => {
  test('allows PROPOSED -> BOOKED', () => {
    expect(() => assertAllowedTransition('PROPOSED', 'BOOKED')).not.toThrow();
  });

  test('allows BOOKED -> RESCHEDULE_REQUESTED', () => {
    expect(() => assertAllowedTransition('BOOKED', 'RESCHEDULE_REQUESTED')).not.toThrow();
  });

  test('allows BOOKED -> RESCHEDULED (dealer reschedule endpoint)', () => {
    expect(() => assertAllowedTransition('BOOKED', 'RESCHEDULED')).not.toThrow();
  });

  test('allows RESCHEDULE_REQUESTED -> RESCHEDULED', () => {
    expect(() => assertAllowedTransition('RESCHEDULE_REQUESTED', 'RESCHEDULED')).not.toThrow();
  });

  test('allows BOOKED -> NO_SHOW', () => {
    expect(() => assertAllowedTransition('BOOKED', 'NO_SHOW')).not.toThrow();
  });

  test('allows BOOKED -> COMPLETED', () => {
    expect(() => assertAllowedTransition('BOOKED', 'COMPLETED')).not.toThrow();
  });

  test('rejects BOOKED -> PROPOSED', () => {
    expect(() => assertAllowedTransition('BOOKED', 'PROPOSED' as any)).toThrow(/Invalid appointment transition/);
  });

  test('rejects terminal -> any', () => {
    expect(() => assertAllowedTransition('COMPLETED', 'BOOKED')).toThrow(/Invalid appointment transition/);
    expect(() => assertAllowedTransition('NO_SHOW', 'RESCHEDULE_REQUESTED')).toThrow(/Invalid appointment transition/);
    expect(() => assertAllowedTransition('CANCELLED_BY_BUYER', 'BOOKED')).toThrow(/Invalid appointment transition/);
  });
});
