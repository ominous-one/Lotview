export interface ExtractedVehicleImage {
  url: string;
  reason?: string;
}

export async function extractImages(_html: string): Promise<string[]> {
  return [];
}

export async function extractVehicleImages(): Promise<{ images: ExtractedVehicleImage[]; disabled: true }> {
  return { images: [], disabled: true };
}

export function validateImages(images: ExtractedVehicleImage[] | string[]): {
  valid: ExtractedVehicleImage[];
  rejected: ExtractedVehicleImage[];
} {
  const normalized = images
    .map((image) => (typeof image === "string" ? { url: image } : image))
    .filter((image): image is ExtractedVehicleImage => typeof image?.url === "string" && image.url.trim().length > 0);

  return { valid: normalized, rejected: [] };
}
