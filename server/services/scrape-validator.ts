/**
 * Scrape Validation Service
 * Validates the quality of every scrape result before storing in the database.
 * Prevents silent data corruption, empty scrapes, and low-quality inventory.
 */

import { logInfo, logWarn, logError } from "../error-utils";
import { storage } from "../storage";
import {
  sendScrapeFailureAlert,
  sendPartialScrapeAlert,
  sendQualityAlert,
} from "./scrape-alerts";
import { validateVIN } from "../vin-validation";

// ---- Validation Configuration ----

const VALIDATION_RULES = {
  minVehiclesRatio: 0.5,        // Must find at least 50% of previously known vehicles
  validVinRatio: 0.9,           // At least 90% of VINs must pass full format/check-digit validation
  photoCoverageRatio: 0.5,      // At least 50% of vehicles should have photos
  maxDuplicates: 0,              // Zero duplicates allowed (will be merged instead)
  maxPriceVariance: 0.5,        // Median price shouldn't change by more than 50%
  identityFields: ["vin", "year", "make", "model"] as const,
  requiredFields: ["vin", "price", "year", "make", "model"] as const,
};

// ---- Types ----

export interface ScrapedVehicle {
  vin: string;
  price?: number;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  color?: string;
  mileage?: number;
  odometer?: number;
  photos?: string[];
  sourceUrl?: string;
  [key: string]: unknown;
}

export type ScrapedVehicleData = ScrapedVehicle;

export interface ScrapeValidationResult {
  isValid: boolean;
  isPartial: boolean;
  vehiclesFound: number;
  expectedVehicles: number;
  validVins: number;
  invalidVins: string[];
  vehiclesWithPhotos: number;
  duplicateCount: number;
  duplicates: Array<{ vin: string; count: number }>;
  medianPrice: number | null;
  previousMedianPrice: number | null;
  priceVariance: number | null;
  missingRequiredFields: Array<{ vin: string; missing: string[] }>;
  warnings: string[];
  errors: string[];
  score: number; // 0-100 quality score
}

// ---- Core Validation ----

/**
 * Validate a complete scrape result.
 * Call this BEFORE inserting vehicles into the database.
 */
export async function validateScrape(
  dealershipId: number,
  vehicles: ScrapedVehicle[]
): Promise<ScrapeValidationResult> {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 1. Get expected vehicle count from previous scrape
  const previousInventory = await storage.getVehiclesByDealership(dealershipId);
  const expectedVehicles = previousInventory.length;

  // 2. Vehicle count check
  const vehiclesFound = vehicles.length;
  if (vehiclesFound === 0) {
    errors.push("No vehicles found in scrape result");
    return buildResult(false, true, vehiclesFound, expectedVehicles, errors, warnings);
  }

  // 3. VIN validation
  const validVins: string[] = [];
  const invalidVins: string[] = [];
  for (const v of vehicles) {
    const normalizedVin = normalizeValidVin(v.vin);
    if (normalizedVin) {
      validVins.push(normalizedVin);
    } else {
      invalidVins.push(v.vin || "(missing)");
    }
  }
  const vinRatio = vehiclesFound > 0 ? validVins.length / vehiclesFound : 0;
  if (invalidVins.length > 0) {
    errors.push(
      `Invalid VINs present in scrape result: ${invalidVins.slice(0, 10).join(", ")}`
    );
  }
  if (vinRatio < VALIDATION_RULES.validVinRatio) {
    errors.push(
      `VIN validity ${Math.round(vinRatio * 100)}% below threshold ${Math.round(
        VALIDATION_RULES.validVinRatio * 100
      )}%`
    );
  }

  // 4. Duplicate detection
  const vinCounts = new Map<string, number>();
  for (const v of vehicles) {
    const normalizedVin = normalizeValidVin(v.vin);
    if (!normalizedVin) {
      continue;
    }

    vinCounts.set(normalizedVin, (vinCounts.get(normalizedVin) || 0) + 1);
  }
  const duplicates = Array.from(vinCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([vin, count]) => ({ vin, count }));
  const duplicateCount = duplicates.reduce((sum, d) => sum + d.count - 1, 0);
  if (duplicateCount > 0) {
    warnings.push(`${duplicateCount} duplicate vehicles detected (will be merged)`);
  }

  // 5. Photo coverage
  const invalidPhotoFields: Array<{ vin: string; value: unknown }> = [];
  const vehiclesWithPhotos = vehicles.filter((v) => {
    if (v.photos === undefined || v.photos === null) {
      return false;
    }

    if (!Array.isArray(v.photos)) {
      invalidPhotoFields.push({ vin: v.vin || "(unknown)", value: v.photos });
      return false;
    }

    let hasSafePhoto = false;
    for (const photo of v.photos) {
      if (isHttpUrl(photo)) {
        hasSafePhoto = true;
      } else {
        invalidPhotoFields.push({ vin: v.vin || "(unknown)", value: photo });
      }
    }

    return hasSafePhoto;
  }).length;
  const photoRatio = vehiclesFound > 0 ? vehiclesWithPhotos / vehiclesFound : 0;
  if (photoRatio < VALIDATION_RULES.photoCoverageRatio) {
    warnings.push(
      `Photo coverage ${Math.round(photoRatio * 100)}% below threshold ${Math.round(
        VALIDATION_RULES.photoCoverageRatio * 100
      )}%`
    );
  }

  // 6. Required fields check
  const missingRequiredFields: Array<{ vin: string; missing: string[] }> = [];
  const missingIdentityFields: Array<{ vin: string; missing: string[] }> = [];
  const missingNonIdentityFields: Array<{ vin: string; missing: string[] }> = [];
  const invalidPriceFields: Array<{ vin: string; price: unknown }> = [];
  const invalidMileageFields: Array<{ vin: string; field: "mileage" | "odometer"; value: unknown }> = [];
  const invalidIdentityFields: Array<{ vin: string; field: "year" | "make" | "model"; value: unknown }> = [];
  const invalidSourceUrlFields: Array<{ vin: string; sourceUrl: unknown }> = [];
  for (const v of vehicles) {
    const missing = VALIDATION_RULES.requiredFields.filter(
      (field) => v[field] === undefined || v[field] === null || v[field] === ""
    );
    if (missing.length > 0) {
      const vin = v.vin || "(unknown)";
      missingRequiredFields.push({ vin, missing });

      const missingIdentity = missing.filter((field) =>
        (VALIDATION_RULES.identityFields as readonly string[]).includes(field)
      );
      if (missingIdentity.length > 0) {
        missingIdentityFields.push({ vin, missing: missingIdentity });
      }

      const missingNonIdentity = missing.filter(
        (field) => !(VALIDATION_RULES.identityFields as readonly string[]).includes(field)
      );
      if (missingNonIdentity.length > 0) {
        missingNonIdentityFields.push({ vin, missing: missingNonIdentity });
      }
    }

    if (v.price !== undefined && v.price !== null && !isPositiveFiniteNumber(v.price)) {
      invalidPriceFields.push({ vin: v.vin || "(unknown)", price: v.price });
    }
    if (v.mileage !== undefined && v.mileage !== null && !isNonNegativeFiniteNumber(v.mileage)) {
      invalidMileageFields.push({ vin: v.vin || "(unknown)", field: "mileage", value: v.mileage });
    }
    if (v.odometer !== undefined && v.odometer !== null && !isNonNegativeFiniteNumber(v.odometer)) {
      invalidMileageFields.push({ vin: v.vin || "(unknown)", field: "odometer", value: v.odometer });
    }
    const yearValue = v.year as unknown;
    const makeValue = v.make as unknown;
    const modelValue = v.model as unknown;
    if (yearValue !== undefined && yearValue !== null && yearValue !== "" && !isValidModelYear(yearValue)) {
      invalidIdentityFields.push({ vin: v.vin || "(unknown)", field: "year", value: yearValue });
    }
    if (makeValue !== undefined && makeValue !== null && makeValue !== "" && !isNonEmptyString(makeValue)) {
      invalidIdentityFields.push({ vin: v.vin || "(unknown)", field: "make", value: makeValue });
    }
    if (modelValue !== undefined && modelValue !== null && modelValue !== "" && !isNonEmptyString(modelValue)) {
      invalidIdentityFields.push({ vin: v.vin || "(unknown)", field: "model", value: modelValue });
    }
    if (v.sourceUrl !== undefined && v.sourceUrl !== null && v.sourceUrl !== "" && !isHttpUrl(v.sourceUrl)) {
      invalidSourceUrlFields.push({ vin: v.vin || "(unknown)", sourceUrl: v.sourceUrl });
    }
  }
  if (missingIdentityFields.length > 0) {
    errors.push(
      `Missing required identity fields in scrape result: ${missingIdentityFields
        .slice(0, 10)
        .map((entry) => `${entry.vin}(${entry.missing.join(",")})`)
        .join("; ")}`
    );
  }
  if (missingNonIdentityFields.length > 0) {
    errors.push(
      `Missing required scrape fields in scrape result: ${missingNonIdentityFields
        .slice(0, 10)
        .map((entry) => `${entry.vin}(${entry.missing.join(",")})`)
        .join("; ")}`
    );
  }
  if (invalidPriceFields.length > 0) {
    errors.push(
      `Invalid required price facts in scrape result: ${invalidPriceFields
        .slice(0, 10)
        .map((entry) => `${entry.vin}(${String(entry.price)})`)
        .join("; ")}`
    );
  }
  if (invalidMileageFields.length > 0) {
    errors.push(
      `Invalid scraped mileage facts in scrape result: ${invalidMileageFields
        .slice(0, 10)
        .map((entry) => `${entry.vin}(${entry.field}=${String(entry.value)})`)
        .join("; ")}`
    );
  }
  if (invalidIdentityFields.length > 0) {
    errors.push(
      `Invalid required identity facts in scrape result: ${invalidIdentityFields
        .slice(0, 10)
        .map((entry) => `${entry.vin}(${entry.field}=${String(entry.value)})`)
        .join("; ")}`
    );
  }
  if (invalidSourceUrlFields.length > 0) {
    errors.push(
      `Invalid scraped source URLs in scrape result: ${invalidSourceUrlFields
        .slice(0, 10)
        .map((entry) => `${entry.vin}(${String(entry.sourceUrl)})`)
        .join("; ")}`
    );
  }
  if (invalidPhotoFields.length > 0) {
    errors.push(
      `Invalid scraped photo URLs in scrape result: ${invalidPhotoFields
        .slice(0, 10)
        .map((entry) => `${entry.vin}(${String(entry.value)})`)
        .join("; ")}`
    );
  }

  // 7. Price variance check
  const prices = vehicles.map((v) => v.price).filter(isPositiveFiniteNumber);
  const medianPrice = prices.length > 0 ? median(prices) : null;
  const previousPrices = previousInventory
    .map((v) => v.price)
    .filter(isPositiveFiniteNumber);
  const previousMedianPrice = previousPrices.length > 0 ? median(previousPrices) : null;
  let priceVariance: number | null = null;
  if (medianPrice && previousMedianPrice && previousMedianPrice > 0) {
    priceVariance = Math.abs(medianPrice - previousMedianPrice) / previousMedianPrice;
    if (priceVariance > VALIDATION_RULES.maxPriceVariance) {
      warnings.push(
        `Price variance ${Math.round(priceVariance * 100)}% exceeds threshold ${Math.round(
          VALIDATION_RULES.maxPriceVariance * 100
        )}%`
      );
    }
  }

  // 8. Calculate quality score (0-100)
  let score = 100;
  score -= Math.max(0, (1 - vinRatio) * 30); // VIN validity: up to -30
  score -= Math.max(0, (1 - photoRatio) * 20); // Photo coverage: up to -20
  score -= duplicateCount * 2; // Duplicates: -2 each
  score -= missingRequiredFields.length * 0.5; // Missing fields: -0.5 each
  score = Math.max(0, Math.min(100, Math.round(score)));

  // 9. Determine validity
  const isPartial =
    expectedVehicles > 0 &&
    vehiclesFound / expectedVehicles < VALIDATION_RULES.minVehiclesRatio;
  const isValid = errors.length === 0 && !isPartial && score >= 60;

  if (!isValid) {
    errors.push(`Scrape quality score ${score}/100 below threshold 60`);
  }

  // 10. Send alerts
  if (!isValid) {
    await sendScrapeFailureAlert(dealershipId, errors.join("; "));
  } else if (isPartial) {
    await sendPartialScrapeAlert(dealershipId, vehiclesFound, expectedVehicles);
  }
  if (
    invalidVins.length > 0 ||
    vinRatio < VALIDATION_RULES.validVinRatio ||
    photoRatio < VALIDATION_RULES.photoCoverageRatio
  ) {
    await sendQualityAlert(dealershipId, vinRatio, photoRatio);
  }

  return {
    isValid,
    isPartial,
    vehiclesFound,
    expectedVehicles,
    validVins: validVins.length,
    invalidVins,
    vehiclesWithPhotos,
    duplicateCount,
    duplicates,
    medianPrice,
    previousMedianPrice,
    priceVariance,
    missingRequiredFields: missingRequiredFields.slice(0, 10), // Cap at 10
    warnings,
    errors,
    score,
  };
}

// ---- Utility Functions ----

function normalizeValidVin(vin: string | undefined): string | null {
  const result = validateVIN(vin);
  return result.isValid ? result.vin : null;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isValidModelYear(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isInteger(value)) return false;
  const maxModelYear = new Date().getUTCFullYear() + 2;
  return value >= 1981 && value <= maxModelYear;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;

  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function buildResult(
  isValid: boolean,
  isPartial: boolean,
  vehiclesFound: number,
  expectedVehicles: number,
  errors: string[],
  warnings: string[]
): ScrapeValidationResult {
  return {
    isValid,
    isPartial,
    vehiclesFound,
    expectedVehicles,
    validVins: 0,
    invalidVins: [],
    vehiclesWithPhotos: 0,
    duplicateCount: 0,
    duplicates: [],
    medianPrice: null,
    previousMedianPrice: null,
    priceVariance: null,
    missingRequiredFields: [],
    warnings,
    errors,
    score: 0,
  };
}
