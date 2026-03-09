export type CancelledBy = 'BUYER' | 'DEALER';

/**
 * Accepts common client representations: BUYER/DEALER, buyer/dealer.
 * Throws on unknown values to fail closed.
 */
export function parseCancelledBy(input: unknown): CancelledBy {
  if (input == null) return 'DEALER';
  if (typeof input !== 'string') throw new Error('cancelledBy must be a string');

  const norm = input.trim().toUpperCase();
  if (norm === 'BUYER') return 'BUYER';
  if (norm === 'DEALER') return 'DEALER';

  throw new Error(`Invalid cancelledBy: ${input}`);
}
