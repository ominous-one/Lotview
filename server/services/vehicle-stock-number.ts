export function normalizeStockNumber(stockNumber: unknown): string | null {
  if (stockNumber === null || stockNumber === undefined) return null;
  const value = String(stockNumber).trim().toUpperCase();
  if (!value) return null;

  const normalized = value.replace(/[^A-Z0-9]/g, "");
  return normalized.length > 0 ? normalized : null;
}

export function withNormalizedStockNumber<T extends Record<string, unknown>>(
  payload: T,
): T & { normalizedStockNumber?: string | null } {
  if (!Object.prototype.hasOwnProperty.call(payload, "stockNumber")) {
    return payload;
  }

  return {
    ...payload,
    normalizedStockNumber: normalizeStockNumber(payload.stockNumber),
  };
}
