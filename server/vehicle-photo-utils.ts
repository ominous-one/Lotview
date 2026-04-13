import { normalizeImageUrlForFingerprint } from './inventory-enrichment-utils';

export const PHOTO_STATUS_COMPLETE_THRESHOLD = 10;
export const PRICE_ONLY_REFRESH_MIN_PHOTO_COUNT = PHOTO_STATUS_COMPLETE_THRESHOLD + 1;

export function uniquePhotoCount(urls: string[] | null | undefined): number {
  const set = new Set<string>();
  for (const u of urls || []) {
    const n = normalizeImageUrlForFingerprint(u);
    if (n) set.add(n);
  }
  return set.size;
}

export function computePhotoStatus(
  urls: string[] | null | undefined,
  minPhotosTarget = PHOTO_STATUS_COMPLETE_THRESHOLD
): 'pending'|'complete'|'unknown' {
  const count = uniquePhotoCount(urls);
  if (count === 0) return 'pending';
  if (count >= minPhotosTarget) return 'complete';
  return 'unknown';
}

export function hasEnoughPhotosForPriceOnlyRefresh(
  urls: string[] | null | undefined,
  minPhotosRequired = PRICE_ONLY_REFRESH_MIN_PHOTO_COUNT
): boolean {
  return uniquePhotoCount(urls) >= minPhotosRequired;
}
