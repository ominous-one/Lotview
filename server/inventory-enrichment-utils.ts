import crypto from 'crypto';

export function normalizeImageUrlForFingerprint(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    // Fingerprint should ignore volatile query params.
    return `${u.origin}${u.pathname}`.toLowerCase();
  } catch {
    return url.split('?')[0].split('#')[0].toLowerCase();
  }
}

export function computePhotoFingerprint(urls: string[]): string {
  const normalized = (urls || [])
    .map(normalizeImageUrlForFingerprint)
    .filter(Boolean)
    .sort();

  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(normalized));
  return hash.digest('hex');
}

export function shouldUpdatePhotos(params: {
  existingUrls: string[];
  existingFingerprint?: string | null;
  candidateUrls: string[];
  minPhotosTarget: number;
}): { shouldUpdate: boolean; reason: string; fingerprint: string; candidateCount: number } {
  const existingCount = params.existingUrls?.length || 0;
  const candidateCount = params.candidateUrls?.length || 0;

  const fingerprint = computePhotoFingerprint(params.candidateUrls);

  if (candidateCount === 0) {
    return { shouldUpdate: false, reason: 'no_candidate_photos', fingerprint, candidateCount };
  }

  if (params.existingFingerprint && params.existingFingerprint === fingerprint) {
    return { shouldUpdate: false, reason: 'fingerprint_unchanged', fingerprint, candidateCount };
  }

  // Prefer more photos.
  if (candidateCount > existingCount) {
    return { shouldUpdate: true, reason: 'more_photos', fingerprint, candidateCount };
  }

  // If we're still under target, allow update even if count not higher (image set may have changed).
  if (existingCount < params.minPhotosTarget) {
    return { shouldUpdate: true, reason: 'under_target_maybe_changed', fingerprint, candidateCount };
  }

  return { shouldUpdate: false, reason: 'not_better', fingerprint, candidateCount };
}
