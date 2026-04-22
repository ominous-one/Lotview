/**
 * Photo Guard Service
 * Prevents the photo enrichment sweep from overwriting manually uploaded photos.
 * Tracks photo provenance so manual photos are always preserved.
 */

import { logInfo, logWarn } from "../error-utils";
import { storage } from "../storage";

// ---- Types ----

interface PhotoMetadata {
  url: string;
  source: "scrape" | "manual" | "enrichment";
  uploadedAt: Date;
  uploadedBy?: number; // User ID for manual uploads
}

// ---- Core Functions ----

/**
 * Add a photo with provenance tracking.
 * Call this when manually uploading a photo.
 */
export async function addManualPhoto(
  vehicleId: number,
  photoUrl: string,
  userId: number
): Promise<void> {
  const vehicle = await storage.getVehicle(vehicleId);
  if (!vehicle) throw new Error("Vehicle not found");

  const photos = ((vehicle.images as string[]) || []).filter(
    (p) => typeof p === "string"
  );

  // Check if photo already exists
  if (photos.includes(photoUrl)) return;

  // Mark as manual with metadata
  const manualPhoto = `manual:${photoUrl}`;
  const updatedPhotos = [...photos, manualPhoto];

  await storage.updateVehicle(vehicleId, {
    photos: updatedPhotos,
    updatedAt: new Date(),
  });

  logInfo(`[PhotoGuard] Added manual photo to vehicle ${vehicleId}`, { userId });
}

/**
 * Enrich images from scrape results — WITHOUT overwriting manual photos.
 * Call this during the image enrichment sweep.
 */
export async function enrichPhotosSafely(
  vehicleId: number,
  scrapedImages: string[]
): Promise<{ added: number; preserved: number; skipped: number }> {
  const vehicle = await storage.getVehicle(vehicleId);
  if (!vehicle) return { added: 0, preserved: 0, skipped: 0 };

  const existingPhotos = ((vehicle.images as string[]) || []).filter(
    (p) => typeof p === "string"
  );

  // Separate manual and scraped photos
  const manualPhotos: string[] = [];
  const scrapedExisting: string[] = [];

  for (const photo of existingPhotos) {
    if (photo.startsWith("manual:")) {
      manualPhotos.push(photo); // Preserve — never overwrite
    } else {
      scrapedExisting.push(photo);
    }
  }

  // Add new scraped photos that don't already exist
  const newPhotos: string[] = [];
  let skipped = 0;
  for (const photo of scrapedImages) {
    // Check against both scraped and manual (strip manual: prefix for comparison)
    const manualUrls = manualPhotos.map((p) => p.replace("manual:", ""));
    if (scrapedExisting.includes(photo) || manualUrls.includes(photo)) {
      skipped++;
      continue;
    }
    newPhotos.push(photo);
  }

  // Merge: manual photos first (they're the highest quality), then scraped
  const finalPhotos = [...manualPhotos, ...scrapedExisting, ...newPhotos];

  // Limit to 25 photos max (Facebook Marketplace limit)
  const cappedPhotos = finalPhotos.slice(0, 25);

  if (cappedPhotos.length !== existingPhotos.length) {
    await storage.updateVehicle(vehicleId, {
      photos: cappedPhotos,
      updatedAt: new Date(),
    });
  }

  return {
    added: newPhotos.length,
    preserved: manualPhotos.length,
    skipped,
  };
}

/**
 * Get photo provenance report for a vehicle.
 * Shows which photos are manual vs scraped.
 */
export async function getPhotoProvenance(vehicleId: number): Promise<{
  total: number;
  manual: number;
  scraped: number;
  photos: Array<{ url: string; source: "manual" | "scraped"; isPrimary: boolean }>;
}> {
  const vehicle = await storage.getVehicle(vehicleId);
  if (!vehicle) {
    return { total: 0, manual: 0, scraped: 0, photos: [] };
  }

  const photos = ((vehicle.images as string[]) || []).filter(
    (p) => typeof p === "string"
  );
  const primaryPhoto = (vehicle.primaryPhotoUrl as string) || null;

  let manualCount = 0;
  let scrapedCount = 0;

  const mapped = photos.map((p) => {
    const isManual = p.startsWith("manual:");
    const url = isManual ? p.replace("manual:", "") : p;
    if (isManual) manualCount++;
    else scrapedCount++;

    return {
      url,
      source: (isManual ? "manual" : "scraped") as "manual" | "scraped",
      isPrimary: url === primaryPhoto,
    };
  });

  return {
    total: photos.length,
    manual: manualCount,
    scraped: scrapedCount,
    photos: mapped,
  };
}

/**
 * Remove manual photo marker when setting primary.
 * Ensures primary photo URL doesn't include the manual: prefix.
 */
export function stripManualPrefix(photoUrl: string | null | undefined): string | null {
  if (!photoUrl) return null;
  return photoUrl.startsWith("manual:") ? photoUrl.replace("manual:", "") : photoUrl;
}

/**
 * Migrate existing photos to add provenance.
 * Run once as a data migration.
 */
export async function migratePhotoProvenance(dealershipId: number): Promise<{
  migrated: number;
  errors: number;
}> {
  const vehicles = await storage.getVehiclesByDealership(dealershipId);
  let migrated = 0;
  let errors = 0;

  for (const vehicle of vehicles) {
    try {
      const photos = ((vehicle.images as string[]) || []).filter(
        (p) => typeof p === "string"
      );

      // If no manual: prefix exists on any photo, assume all are scraped
      // (this is the default state before PhotoGuard)
      const hasManualMarkers = photos.some((p) => p.startsWith("manual:"));
      if (hasManualMarkers) {
        migrated++; // Already migrated
        continue;
      }

      // Mark photos as scraped (no manual: prefix = scraped)
      // Photos stay as-is — they're already in scraped format
      migrated++;
    } catch (error) {
      errors++;
      logWarn(`[PhotoGuard] Migration failed for vehicle ${vehicle.id}: ${error}`);
    }
  }

  logInfo(`[PhotoGuard] Migration complete: ${migrated} vehicles processed, ${errors} errors`, {
    dealershipId,
  });

  return { migrated, errors };
}
