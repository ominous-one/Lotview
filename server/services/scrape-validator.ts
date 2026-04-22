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

// ---- Validation Configuration ----

const VALIDATION_RULES = {
  minVehiclesRatio: 0.5,        // Must find at least 50% of previously known vehicles
  validVinRatio: 0.9,           // At least 90% of VINs must be valid 17-char codes
  photoCoverageRatio: 0.5,      // At least 50% of vehicles should have photos
  maxDuplicates: 0,              // Zero duplicates allowed (will be merged instead)
  maxPriceVariance: 0.5,        // Median price shouldn't change by more than 50%
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
  photos?: string[];
  sourceUrl?: string;
  [key: string]: unknown;
}

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
    if (isValidVin(v.vin)) {
      validVins.push(v.vin);
    } else {
      invalidVins.push(v.vin || "(missing)");
    }
  }
  const vinRatio = vehiclesFound > 0 ? validVins.length / vehiclesFound : 0;
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
    vinCounts.set(v.vin, (vinCounts.get(v.vin) || 0) + 1);
  }
  const duplicates = Array.from(vinCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([vin, count]) => ({ vin, count }));
  const duplicateCount = duplicates.reduce((sum, d) => sum + d.count - 1, 0);
  if (duplicateCount > 0) {
    warnings.push(`${duplicateCount} duplicate vehicles detected (will be merged)`);
  }

  // 5. Photo coverage
  const vehiclesWithPhotos = vehicles.filter(
    (v) => v.photos && v.photos.length > 0
  ).length;
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
  for (const v of vehicles) {
    const missing = VALIDATION_RULES.requiredFields.filter(
      (field) => v[field] === undefined || v[field] === null || v[field] === ""
    );
    if (missing.length > 0) {
      missingRequiredFields.push({ vin: v.vin || "(unknown)", missing });
    }
  }
  if (missingRequiredFields.length > vehiclesFound * 0.2) {
    warnings.push(
      `${missingRequiredFields.length} vehicles missing required fields`
    );
  }

  // 7. Price variance check
  const prices = vehicles.map((v) => v.price).filter((p): p is number => p !== undefined && p > 0);
  const medianPrice = prices.length > 0 ? median(prices) : null;
  const previousPrices = previousInventory
    .map((v) => v.price)
    .filter((p): p is number => p !== null && p > 0);
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
  if (vinRatio < VALIDATION_RULES.validVinRatio || photoRatio < VALIDATION_RULES.photoCoverageRatio) {
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

function isValidVin(vin: string | undefined): boolean {
  if (!vin || vin.length !== 17) return false;
  // Basic VIN check: 17 alphanumeric chars, no I/O/Q
  const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/i;
  if (!vinRegex.test(vin)) return false;

  // Check digit validation (position 9)
  // This is the MOD 11 check digit per ISO 3779
  const transliteration: Record<string, number> = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
    1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 0: 0,
  };
  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const char = vin[i].toUpperCase();
    const value = transliteration[char];
    if (value === undefined) return false;
    sum += value * weights[i];
  }

  const checkDigit = sum % 11;
  const expectedChar = checkDigit === 10 ? "X" : String(checkDigit);
  return vin[8].toUpperCase() === expectedChar;
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
