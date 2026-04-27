export function optimizePhoto(url: string): string {
  return url;
}

export function uniquePhotoCount(photos: unknown): number {
  if (!Array.isArray(photos)) {
    return 0;
  }

  const urls = photos
    .filter((photo): photo is string => typeof photo === "string")
    .map((photo) => photo.trim())
    .filter(Boolean);

  return new Set(urls).size;
}
