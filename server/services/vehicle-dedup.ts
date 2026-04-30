/**
 * Vehicle Deduplication Service
 * Prevents duplicate vehicles during scraping by merging new data with
 * existing records. Uses VIN as the primary deduplication key.
 *
 * Merge strategy preserves manual overrides while updating scraped data.
 */

import { logInfo } from "../error-utils";
import { storage } from "../storage";
import { validateVIN } from "../vin-validation";
import type { Vehicle } from "@shared/schema";
import { findActiveStockNumberConflict, normalizeStockNumber } from "./vehicle-stock-number";

// ---- Types ----

export interface ScrapedVehicleData {
  vin: string;
  price?: number | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  type?: string | null;
  bodyStyle?: string | null;
  color?: string | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  mileage?: number | null;
  odometer?: number | null;
  photos?: string[];
  images?: string[];
  description?: string | null;
  status?: string | null;
  sourceUrl?: string | null;
  stockNumber?: string | null;
  dealership?: string | null;
  location?: string | null;
  badges?: string[];
  transmission?: string | null;
  engine?: string | null;
  drivetrain?: string | null;
  fuelType?: string | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function firstStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (strings.length > 0) return strings;
  }
  return [];
}

function normalizeScrapedVehicle(scraped: ScrapedVehicleData): ScrapedVehicleData {
  const data = isRecord(scraped.data) ? scraped.data : {};
  return {
    ...scraped,
    price: firstNumber(scraped.price, data.price) ?? null,
    year: firstNumber(scraped.year, data.year) ?? null,
    make: firstString(scraped.make, data.make) ?? null,
    model: firstString(scraped.model, data.model) ?? null,
    trim: firstString(scraped.trim, data.trim) ?? null,
    type: firstString(scraped.type, scraped.bodyStyle, data.type, data.bodyStyle) ?? null,
    color: firstString(scraped.color, scraped.exteriorColor, data.color, data.exteriorColor) ?? null,
    exteriorColor: firstString(scraped.exteriorColor, scraped.color, data.exteriorColor, data.color) ?? null,
    interiorColor: firstString(scraped.interiorColor, data.interiorColor) ?? null,
    mileage: firstNumber(scraped.mileage, scraped.odometer, data.mileage, data.odometer) ?? null,
    odometer: firstNumber(scraped.odometer, scraped.mileage, data.odometer, data.mileage) ?? null,
    photos: firstStringArray(scraped.photos, scraped.images, data.photos, data.images),
    images: firstStringArray(scraped.images, scraped.photos, data.images, data.photos),
    description: firstString(scraped.description, data.description) ?? null,
    sourceUrl: firstString(scraped.sourceUrl, data.sourceUrl, data.dealerVdpUrl) ?? null,
    stockNumber: firstString(scraped.stockNumber, data.stockNumber) ?? null,
    dealership: firstString(scraped.dealership, data.dealership) ?? null,
    location: firstString(scraped.location, data.location) ?? null,
    badges: firstStringArray(scraped.badges, data.badges),
    transmission: firstString(scraped.transmission, data.transmission) ?? null,
    engine: firstString(scraped.engine, data.engine) ?? null,
    drivetrain: firstString(scraped.drivetrain, data.drivetrain) ?? null,
    fuelType: firstString(scraped.fuelType, data.fuelType) ?? null,
  };
}

function getMissingNewInventoryFacts(scraped: ScrapedVehicleData): string[] {
  const missing: string[] = [];
  if (!scraped.year) missing.push("year");
  if (!scraped.make) missing.push("make");
  if (!scraped.model) missing.push("model");
  if (scraped.price === undefined || scraped.price === null) missing.push("price");
  return missing;
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
        result.action = "skip";
        result.details.push({
          vin: vinValidation.vin || "(missing)",
          action: "skip",
          reason: vinValidation.errorCode || "INVALID_VIN",
        });
        continue;
      }

      const normalizedVin = vinValidation.vin;
      const normalizedScraped = normalizeScrapedVehicle({ ...scraped, vin: normalizedVin });
      const existing = existingByVin.get(normalizedVin);
      const stockConflict = findActiveStockNumberConflict(existingVehicles, normalizedScraped.stockNumber);

      if (existing) {
        // Merge with existing
        await mergeVehicle(existing, normalizedScraped, dealershipId);
        result.merged++;
        result.vehicleId = existing.id;
        result.action = "merged";
        result.details.push({ vin: normalizedVin, action: "merge" });
      } else if (stockConflict) {
        const conflictVin = typeof stockConflict.vin === "string" ? stockConflict.vin.trim().toUpperCase() : "";
        if (conflictVin && conflictVin !== normalizedVin) {
          result.skipped++;
          result.action = "skip";
          result.details.push({
            vin: normalizedVin,
            action: "skip",
            reason: `DUPLICATE_STOCK_NUMBER_CONFLICT:${normalizeStockNumber(normalizedScraped.stockNumber)}`,
          });
          continue;
        }

        await mergeVehicle(stockConflict, normalizedScraped, dealershipId);
        result.merged++;
        result.vehicleId = stockConflict.id;
        result.action = "merged";
        result.details.push({ vin: normalizedVin, action: "merge", reason: "MATCHED_STOCK_NUMBER" });
      } else {
        const missingFacts = getMissingNewInventoryFacts(normalizedScraped);
        if (missingFacts.length > 0) {
          result.skipped++;
          result.action = "skip";
          result.details.push({
            vin: normalizedVin,
            action: "skip",
            reason: `MISSING_REQUIRED_SOURCE_FACTS:${missingFacts.join(",")}`,
          });
          continue;
        }

        // Insert new
        const created = await insertVehicle(normalizedScraped, dealershipId);
        existingVehicles.push(created);
        existingByVin.set(normalizedVin, created);
        result.inserted++;
        result.vehicleId = created.id;
        result.action = "created";
        result.details.push({ vin: normalizedVin, action: "insert" });
      }
    } catch (error) {
      result.errors++;
      result.action = "skip";
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
  const selectedIds = new Set(vehicleIds);
  const duplicates = vehicles.filter((v) =>
    selectedIds.has(v.id) && v.vin?.toUpperCase() === vin.toUpperCase()
  );

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
    if (v.odometer && v.odometer !== keeper.odometer) merged.odometer = v.odometer;
    const duplicateImages = ((v.images as string[]) || (v.photos as string[]) || []);
    if (duplicateImages.length > 0) {
      const existingImages = ((keeper.images as string[]) || (keeper.photos as string[]) || []);
      const allImages = [...new Set([...existingImages, ...duplicateImages])];
      if (allImages.length > existingImages.length) merged.images = allImages;
    }
  }

  // Update keeper with merged data
  if (Object.keys(merged).length > 0) {
    await (storage as any).updateVehicle(keeper.id, merged, dealershipId);
  }

  // Remove duplicates
  for (const v of toRemove) {
    await (storage as any).deleteVehicle(v.id, dealershipId);
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

  // Mileage/odometer: update if newer
  const odometer = scraped.odometer ?? scraped.mileage;
  if (odometer !== undefined && odometer !== null) {
    updates.odometer = odometer;
  }

  // Photos: merge sets, preserve manual photos
  const scrapedImages = scraped.images && scraped.images.length > 0 ? scraped.images : scraped.photos;
  if (scrapedImages && scrapedImages.length > 0) {
    const existingImages = ((existing.images as string[]) || (existing.photos as string[]) || []);
    const existingImageUrls = new Set(existingImages.map((p) => p.replace(/^manual:/, "")));
    const newScrapedImages = scrapedImages.filter((p) => !existingImageUrls.has(p.replace(/^manual:/, "")));
    if (newScrapedImages.length > 0) {
      updates.images = [...existingImages, ...newScrapedImages];
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
  if (scraped.vin && !existing.vin) updates.vin = scraped.vin.toUpperCase().trim();
  if (scraped.year && !existing.year) updates.year = scraped.year;
  if (scraped.make && !existing.make) updates.make = scraped.make;
  if (scraped.model && !existing.model) updates.model = scraped.model;
  if (scraped.trim && !existing.trim) updates.trim = scraped.trim;
  if (scraped.type && !existing.type) updates.type = scraped.type;
  if (scraped.color && !existing.exteriorColor) updates.exteriorColor = scraped.color;
  if (scraped.exteriorColor && !existing.exteriorColor) updates.exteriorColor = scraped.exteriorColor;
  if (scraped.interiorColor && !existing.interiorColor) updates.interiorColor = scraped.interiorColor;
  if (scraped.stockNumber && !existing.stockNumber) {
    updates.stockNumber = scraped.stockNumber;
    updates.normalizedStockNumber = normalizeStockNumber(scraped.stockNumber);
  } else if (scraped.stockNumber && !existing.normalizedStockNumber) {
    updates.normalizedStockNumber = normalizeStockNumber(scraped.stockNumber);
  }
  if (scraped.transmission && !existing.transmission) updates.transmission = scraped.transmission;
  if (scraped.engine && !existing.engine) updates.engine = scraped.engine;
  if (scraped.drivetrain && !existing.drivetrain) updates.drivetrain = scraped.drivetrain;
  if (scraped.fuelType && !existing.fuelType) updates.fuelType = scraped.fuelType;

  // Source metadata
  if (scraped.sourceUrl) updates.dealerVdpUrl = scraped.sourceUrl;
  updates.lastScrapedAt = new Date();
  updates.updatedAt = new Date();

  if (Object.keys(updates).length > 0) {
    await (storage as any).updateVehicle(existing.id, updates, dealershipId);
  }
}

async function insertVehicle(scraped: ScrapedVehicleData, dealershipId: number): Promise<Vehicle> {
  const odometer = scraped.odometer ?? scraped.mileage ?? 0;
  const images = scraped.images && scraped.images.length > 0 ? scraped.images : scraped.photos || [];

  return storage.createVehicle({
    dealershipId,
    vin: scraped.vin.toUpperCase().trim(),
    price: scraped.price ?? 0,
    year: scraped.year ?? 0,
    make: scraped.make ?? "",
    model: scraped.model ?? "",
    trim: scraped.trim ?? "",
    type: scraped.type || scraped.bodyStyle || "",
    odometer,
    images,
    badges: scraped.badges || [],
    location: scraped.location || "",
    dealership: scraped.dealership || "",
    description: scraped.description || "",
    stockNumber: scraped.stockNumber || null,
    normalizedStockNumber: normalizeStockNumber(scraped.stockNumber),
    exteriorColor: scraped.exteriorColor || scraped.color || null,
    interiorColor: scraped.interiorColor || null,
    transmission: scraped.transmission || null,
    engine: scraped.engine || null,
    drivetrain: scraped.drivetrain || null,
    fuelType: scraped.fuelType || null,
    dealerVdpUrl: scraped.sourceUrl || null,
    lastScrapedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);
}
