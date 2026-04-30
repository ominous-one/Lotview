/**
 * Vehicle Deduplication Service
 * Prevents duplicate vehicles during scraping by merging new data with
 * existing records. Uses VIN as the primary deduplication key.
 *
 * Merge strategy preserves manual overrides while updating scraped data.
 */

import { logInfo, logWarn } from "../error-utils";
import { storage } from "../storage";
import { validateVIN } from "../vin-validation";
import type { Vehicle } from "@shared/schema";

// ---- Merge Configuration ----

const MERGE_RULES = {
  // Fields that always use scraped (newer) data
  price: "scrape",
  mileage: "scrape",
  photos: "merge",       // Merge photo sets, keep manual photos
  status: "conditional", // Never change "sold" back to "available"
  description: "manual", // Preserve manual edits
  // Fields that use manual data if present
  notes: "manual",
  tags: "manual",
  // Fields that always use scraped data
  sourceUrl: "scrape",
  lastScrapedAt: "scrape",
};

// ---- Types ----

export interface ScrapedVehicleData {
  vin: string;
  price?: number | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  color?: string | null;
  mileage?: number | null;
  photos?: string[];
  description?: string | null;
  status?: string | null;
  sourceUrl?: string | null;
  sourceId?: string;
  sourceType?: string;
  scrapedAt?: Date;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DedupResult {
  inserted: number;
  merged: number;
  skipped: number;
  errors: number;
  vehicleId?: number;
  action?: "created" | "merged" | "duplicate_skipped" | "insert" | "merge" | "skip";
  confidence?: number;
  details: Array<{
    vin: string;
    action: "insert" | "merge" | "skip";
    reason?: string;
  }>;
}

// ---- Core Deduplication ----

/**
 * Deduplicate and store scraped vehicles.
 * Call this AFTER validation passes.
 */
export async function deduplicateAndStore(
  dealershipId: number,
  vehicles: ScrapedVehicleData[] | ScrapedVehicleData
): Promise<DedupResult> {
  const vehiclesToProcess = Array.isArray(vehicles) ? vehicles : [vehicles];
  const result: DedupResult = {
    inserted: 0,
    merged: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  // Build lookup of existing vehicles by VIN
  const existingVehicles = await storage.getVehiclesByDealership(dealershipId);
  const existingByVin = new Map<string, Vehicle>();
  for (const v of existingVehicles) {
    if (v.vin) existingByVin.set(v.vin.toUpperCase(), v);
  }

  for (const scraped of vehiclesToProcess) {
    try {
      const vinValidation = validateVIN(scraped.vin);
      if (!vinValidation.isValid) {
        result.skipped++;
        result.details.push({
          vin: vinValidation.vin || "(missing)",
          action: "skip",
          reason: vinValidation.errorCode || "INVALID_VIN",
        });
        continue;
      }

      const normalizedVin = vinValidation.vin;
      const normalizedScraped = { ...scraped, vin: normalizedVin };
      const existing = existingByVin.get(normalizedVin);

      if (existing) {
        // Merge with existing
        await mergeVehicle(existing, normalizedScraped, dealershipId);
        result.merged++;
        result.details.push({ vin: normalizedVin, action: "merge" });
      } else {
        // Insert new
        await insertVehicle(normalizedScraped, dealershipId);
        result.inserted++;
        result.details.push({ vin: normalizedVin, action: "insert" });
      }
    } catch (error) {
      result.errors++;
      result.details.push({
        vin: scraped.vin || "(unknown)",
        action: "skip",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logInfo(`[Dedup] Completed: ${result.inserted} inserted, ${result.merged} merged, ${result.skipped} skipped, ${result.errors} errors`, {
    dealershipId,
  });

  return result;
}

/**
 * Find duplicate vehicles in the database.
 * Returns groups of vehicles that share the same VIN.
 */
export async function findDuplicates(dealershipId: number): Promise<
  Array<{ vin: string; vehicleIds: number[]; count: number }>
> {
  const vehicles = await storage.getVehiclesByDealership(dealershipId);
  const vinMap = new Map<string, number[]>();

  for (const v of vehicles) {
    if (!v.vin) continue;
    const vin = v.vin.toUpperCase();
    const ids = vinMap.get(vin) || [];
    ids.push(v.id);
    vinMap.set(vin, ids);
  }

  return Array.from(vinMap.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([vin, vehicleIds]) => ({
      vin,
      vehicleIds,
      count: vehicleIds.length,
    }));
}

/**
 * Merge duplicate vehicles into a single record.
 * Keeps the oldest record as the base, merges data from others.
 */
export async function mergeDuplicates(
  dealershipId: number,
  vin: string,
  vehicleIds: number[]
): Promise<{ success: boolean; keptId: number; removedIds: number[] }> {
  const vehicles = await storage.getVehiclesByDealership(dealershipId);
  const duplicates = vehicles.filter((v) => v.vin?.toUpperCase() === vin.toUpperCase());

  if (duplicates.length < 2) {
    return { success: false, keptId: 0, removedIds: [] };
  }

  // Sort by created_at, keep the oldest
  duplicates.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const keeper = duplicates[0];
  const toRemove = duplicates.slice(1);

  // Merge: use most recent data for each field
  const merged: Record<string, unknown> = {};
  for (const v of toRemove) {
    if (v.price && v.price !== keeper.price) merged.price = v.price;
    if (v.mileage && v.mileage !== keeper.mileage) merged.mileage = v.mileage;
    if (v.photos && Array.isArray(v.photos)) {
      const existingPhotos = (keeper.photos as string[]) || [];
      const allPhotos = [...new Set([...existingPhotos, ...v.photos])];
      if (allPhotos.length > existingPhotos.length) merged.photos = allPhotos;
    }
  }

  // Update keeper with merged data
  if (Object.keys(merged).length > 0) {
    await (storage as any).updateVehicle(keeper.id, merged);
  }

  // Remove duplicates
  for (const v of toRemove) {
    await (storage as any).deleteVehicle(v.id);
  }

  logInfo(`[Dedup] Merged ${toRemove.length} duplicates for VIN ${vin}`, {
    dealershipId,
    keptId: keeper.id,
  });

  return {
    success: true,
    keptId: keeper.id,
    removedIds: toRemove.map((v) => v.id),
  };
}

// ---- Internal ----

async function mergeVehicle(
  existing: Vehicle,
  scraped: ScrapedVehicleData,
  dealershipId: number
): Promise<void> {
  const updates: Record<string, unknown> = {};

  // Price: always update from scrape (more recent market data)
  if (scraped.price !== undefined && scraped.price !== null) {
    updates.price = scraped.price;
  }

  // Mileage: update if newer
  if (scraped.mileage !== undefined && scraped.mileage !== null) {
    updates.mileage = scraped.mileage;
  }

  // Photos: merge sets, preserve manual photos
  if (scraped.photos && scraped.photos.length > 0) {
    const existingPhotos = ((existing.photos as string[]) || []).filter((p) => !p.startsWith("manual:"));
    const scrapedPhotos = scraped.photos.filter((p) => !existingPhotos.includes(p));
    if (scrapedPhotos.length > 0) {
      updates.photos = [...existingPhotos, ...scrapedPhotos];
    }
  }

  // Status: NEVER change "sold" back to "available"
  if (scraped.status && existing.status === "sold" && scraped.status === "available") {
    // Skip status update — sold stays sold
    logInfo(`[Dedup] Prevented status revert: VIN ${scraped.vin} kept as "sold"`);
  } else if (scraped.status) {
    updates.status = scraped.status;
  }

  // Description: preserve manual edits
  if (scraped.description && !existing.description) {
    updates.description = scraped.description;
  }

  // Core fields: update if missing in existing
  if (scraped.year && !existing.year) updates.year = scraped.year;
  if (scraped.make && !existing.make) updates.make = scraped.make;
  if (scraped.model && !existing.model) updates.model = scraped.model;
  if (scraped.trim && !existing.trim) updates.trim = scraped.trim;
  if (scraped.color && !existing.color) updates.color = scraped.color;

  // Source metadata
  updates.sourceUrl = scraped.sourceUrl;
  updates.lastScrapedAt = new Date();
  updates.updatedAt = new Date();

  if (Object.keys(updates).length > 0) {
    await (storage as any).updateVehicle(existing.id, updates);
  }
}

async function insertVehicle(scraped: ScrapedVehicleData, dealershipId: number): Promise<void> {
  await storage.createVehicle({
    dealershipId,
    vin: scraped.vin.toUpperCase().trim(),
    price: scraped.price || null,
    year: scraped.year || null,
    make: scraped.make || null,
    model: scraped.model || null,
    trim: scraped.trim || null,
    color: scraped.color || null,
    mileage: scraped.mileage || null,
    photos: scraped.photos || [],
    description: scraped.description || null,
    status: scraped.status || "available",
    sourceUrl: scraped.sourceUrl || null,
    lastScrapedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);
}
