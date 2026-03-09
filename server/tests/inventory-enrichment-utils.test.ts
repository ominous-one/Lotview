import { computePhotoFingerprint, normalizeImageUrlForFingerprint, shouldUpdatePhotos } from '../inventory-enrichment-utils';

describe('inventory-enrichment-utils', () => {
  test('normalizeImageUrlForFingerprint strips query/hash', () => {
    expect(normalizeImageUrlForFingerprint('https://cdn.example.com/a/b.jpg?w=123#x'))
      .toBe('https://cdn.example.com/a/b.jpg');
  });

  test('computePhotoFingerprint stable across ordering + query params', () => {
    const a = computePhotoFingerprint([
      'https://cdn.example.com/a.jpg?w=1',
      'https://cdn.example.com/b.jpg?w=2',
    ]);

    const b = computePhotoFingerprint([
      'https://cdn.example.com/b.jpg?w=999',
      'https://cdn.example.com/a.jpg',
    ]);

    expect(a).toBe(b);
  });

  test('shouldUpdatePhotos prevents thrash when fingerprint unchanged', () => {
    const candidate = ['https://cdn.example.com/a.jpg?w=1'];
    const fp = computePhotoFingerprint(candidate);

    const decision = shouldUpdatePhotos({
      existingUrls: ['https://cdn.example.com/a.jpg?w=2'],
      existingFingerprint: fp,
      candidateUrls: candidate,
      minPhotosTarget: 10,
    });

    expect(decision.shouldUpdate).toBe(false);
    expect(decision.reason).toBe('fingerprint_unchanged');
  });
});
