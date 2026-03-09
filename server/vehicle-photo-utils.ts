import { normalizeImageUrlForFingerprint } from './inventory-enrichment-utils';

export function uniquePhotoCount(urls: string[] | null | undefined): number {
  const set = new Set<string>();
  for (const u of urls || []) {
    const n = normalizeImageUrlForFingerprint(u);
    if (n) set.add(n);
  }
  return set.size;
}

export function computePhotoStatus(urls: string[] | null | undefined, minPhotosTarget = 10): 'pending'|'complete'|'unknown' {
  const count = uniquePhotoCount(urls);
  if (count === 0) return 'pending';
  if (count >= minPhotosTarget) return 'complete';
  return 'unknown';
}
