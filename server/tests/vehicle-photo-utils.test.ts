import {
  PHOTO_STATUS_COMPLETE_THRESHOLD,
  PRICE_ONLY_REFRESH_MIN_PHOTO_COUNT,
  computePhotoStatus,
  hasEnoughPhotosForPriceOnlyRefresh,
  uniquePhotoCount,
} from '../vehicle-photo-utils';

describe('vehicle photo utils', () => {
  it('treats 10 unique photos as complete for photo status', () => {
    const urls = Array.from(
      { length: PHOTO_STATUS_COMPLETE_THRESHOLD },
      (_, index) => `https://cdn.example.com/${index + 1}.jpg`
    );

    expect(uniquePhotoCount(urls)).toBe(PHOTO_STATUS_COMPLETE_THRESHOLD);
    expect(computePhotoStatus(urls)).toBe('complete');
  });

  it('requires more than 10 unique photos before price-only refresh is allowed', () => {
    const tenUrls = Array.from(
      { length: 10 },
      (_, index) => `https://cdn.example.com/${index + 1}.jpg`
    );
    const elevenUrls = Array.from(
      { length: PRICE_ONLY_REFRESH_MIN_PHOTO_COUNT },
      (_, index) => `https://cdn.example.com/${index + 1}.jpg`
    );

    expect(hasEnoughPhotosForPriceOnlyRefresh(tenUrls)).toBe(false);
    expect(hasEnoughPhotosForPriceOnlyRefresh(elevenUrls)).toBe(true);
  });

  it('deduplicates fingerprint-equivalent photo urls before applying thresholds', () => {
    const urls = [
      'https://cdn.example.com/hero.jpg?size=800',
      'https://cdn.example.com/hero.jpg?size=1600',
      ...Array.from(
        { length: 10 },
        (_, index) => `https://cdn.example.com/gallery-${index + 1}.jpg`
      ),
    ];

    expect(uniquePhotoCount(urls)).toBe(11);
    expect(hasEnoughPhotosForPriceOnlyRefresh(urls)).toBe(true);
  });
});
