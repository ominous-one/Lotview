export function normalizeStockNumber(stockNumber: string | null | undefined): string | null {
  const raw = (stockNumber || '').trim();
  if (!raw) return null;
  // Uppercase and remove all non-alphanumeric characters.
  const normalized = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized.length ? normalized : null;
}

export function normalizeVin(vin: string | null | undefined): string | null {
  const raw = (vin || '').trim().toUpperCase();
  if (!raw) return null;
  return raw;
}

export function isPlaceholderVin(vin: string | null | undefined): boolean {
  const v = (vin || '').trim().toUpperCase();
  if (!v) return true;
  return v === 'PENDING' || v.startsWith('PENDING-') || v === 'UNKNOWN';
}
