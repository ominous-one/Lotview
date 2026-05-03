/**
 * Smart Merge Service — World-Class Vehicle Data Management
 * 
 * Core Logic:
 * - Only updates price if changed AND not manually locked
 * - Only updates photos if current count < 10
 * - Never overwrites manually set fields (trim, description, VDP)
 * - Tracks "last source" for every field (scrape vs manual)
 * - Respects edit locks per field per role
 */

export type FieldSource = "scrape" | "manual" | "ai" | "import";

export interface VehicleFieldLock {
  field: string;
  lockedBy: number; // userId
  lockedAt: Date;
  reason?: string;
  expiresAt?: Date;
}

export interface SmartMergeRules {
  dealershipId: number;
  vehicleId: number;
  maxPhotos: number;
  updatePriceIfChanged: boolean;
  preserveManualFields: boolean;
  allowPhotoAddOnly: boolean;
  fieldLocks: VehicleFieldLock[];
}

export interface MergeResult {
  updated: Record<string, { old: any; new: any; source: FieldSource }>;
  skipped: Record<string, { reason: string; currentValue: any; incomingValue: any }>;
  locked: Record<string, { lockedBy: number; lockedAt: Date }>;
}

const ALWAYS_PRESERVE_FIELDS = new Set([
  "trim", "description", "vdpContent", "videoUrl", "videoProvider",
  "notes", "internalNotes", "listingTitle", "customPrice",
]);

const PHOTO_FIELDS = new Set([
  "images", "localImages", "photoUrls",
]);

const PRICE_FIELDS = new Set([
  "price", "msrp", "salePrice", "internetPrice",
]);

const INTEGER_FIELDS = new Set([
  "year",
  "price",
  "odometer",
  "cargurusPrice",
  "carfaxConfidenceScore",
  "missedScrapeCount",
]);

const STRING_FIELDS = new Set([
  "make",
  "model",
  "trim",
  "type",
  "location",
  "dealership",
  "description",
  "fullPageContent",
  "interiorColor",
  "exteriorColor",
  "transmission",
  "fuelType",
  "drivetrain",
  "engine",
  "cargurusUrl",
  "dealRating",
  "carfaxUrl",
  "highlights",
  "vdpDescription",
  "techSpecs",
  "dealerVdpUrl",
  "photoStatus",
  "verificationStatus",
  "photoFingerprint",
]);

const STRING_ARRAY_FIELDS = new Set([
  "images",
  "badges",
  "carfaxBadges",
]);

const DATE_FIELDS = new Set([
  "carfaxLastUpdated",
  "lastScrapedAt",
  "verificationCheckedAt",
  "lastPriceRefreshAt",
]);

const URL_FIELDS = new Set([
  "cargurusUrl",
  "carfaxUrl",
  "dealerVdpUrl",
]);

const IMAGE_URL_FIELDS = new Set([
  "images",
]);

const PHOTO_STATUSES = new Set([
  "unknown",
  "pending",
  "complete",
  "no_vdp",
  "terminal",
]);

const VERIFICATION_STATUSES = new Set([
  "VERIFIED",
  "UNVERIFIED",
  "STALE",
  "ERROR",
]);

const MIN_REASONABLE_VEHICLE_YEAR = 1900;
const MAX_REASONABLE_FUTURE_YEAR_OFFSET = 2;
const MAX_REASONABLE_PRICE = 1_000_000;
const MAX_REASONABLE_ODOMETER = 1_500_000;

export const SMART_MERGE_SCRAPE_FIELDS = new Set([
  "year",
  "make",
  "model",
  "trim",
  "type",
  "price",
  "odometer",
  "images",
  "badges",
  "location",
  "dealership",
  "description",
  "fullPageContent",
  "interiorColor",
  "exteriorColor",
  "transmission",
  "fuelType",
  "drivetrain",
  "engine",
  "cargurusPrice",
  "cargurusUrl",
  "dealRating",
  "carfaxUrl",
  "carfaxBadges",
  "carfaxConfidenceScore",
  "carfaxLastUpdated",
  "highlights",
  "vdpDescription",
  "techSpecs",
  "dealerVdpUrl",
  "photoStatus",
  "lastScrapedAt",
  "verificationStatus",
  "verificationCheckedAt",
  "missedScrapeCount",
  "photoFingerprint",
  "lastPriceRefreshAt",
]);

export function isSmartMergeScrapeField(field: string): boolean {
  return SMART_MERGE_SCRAPE_FIELDS.has(field);
}

export function validateSmartMergeScrapeValue(
  field: string,
  value: unknown,
): { ok: true; value: any } | { ok: false; reason: string } {
  if (INTEGER_FIELDS.has(field)) {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return { ok: false, reason: "Field must be an integer" };
    }

    if (field === "year") {
      const maxYear = new Date().getFullYear() + MAX_REASONABLE_FUTURE_YEAR_OFFSET;
      if (value < MIN_REASONABLE_VEHICLE_YEAR || value > maxYear) {
        return { ok: false, reason: "Vehicle year is outside the allowed range" };
      }
    }

    if ((field === "price" || field === "cargurusPrice") && (value <= 0 || value > MAX_REASONABLE_PRICE)) {
      return { ok: false, reason: "Vehicle price is outside the allowed range" };
    }

    if (field === "odometer" && (value < 0 || value > MAX_REASONABLE_ODOMETER)) {
      return { ok: false, reason: "Vehicle odometer is outside the allowed range" };
    }

    if (field === "carfaxConfidenceScore" && (value < 0 || value > 100)) {
      return { ok: false, reason: "Carfax confidence score must be between 0 and 100" };
    }

    if (field === "missedScrapeCount" && value < 0) {
      return { ok: false, reason: "Missed scrape count cannot be negative" };
    }

    return { ok: true, value };
  }

  if (STRING_FIELDS.has(field)) {
    if (typeof value !== "string") {
      return { ok: false, reason: "Field must be a string" };
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return { ok: false, reason: "Field must not be empty" };
    }

    if (URL_FIELDS.has(field) && !isHttpUrl(trimmed)) {
      return { ok: false, reason: "Field must be an HTTP or HTTPS URL" };
    }

    if (field === "photoStatus" && !PHOTO_STATUSES.has(trimmed)) {
      return { ok: false, reason: "Photo status is not allowed" };
    }

    if (field === "verificationStatus" && !VERIFICATION_STATUSES.has(trimmed)) {
      return { ok: false, reason: "Verification status is not allowed" };
    }

    return { ok: true, value: trimmed };
  }

  if (STRING_ARRAY_FIELDS.has(field)) {
    if (!Array.isArray(value)) {
      return { ok: false, reason: "Field must be a string array" };
    }

    const normalized = value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (normalized.length !== value.length) {
      return { ok: false, reason: "Field must contain only non-empty strings" };
    }

    if (IMAGE_URL_FIELDS.has(field) && normalized.some((entry) => !isHttpUrl(entry))) {
      return { ok: false, reason: "Image URLs must be HTTP or HTTPS URLs" };
    }

    return { ok: true, value: normalized };
  }

  if (DATE_FIELDS.has(field)) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return { ok: true, value };
    }

    if (typeof value === "string") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return { ok: true, value: parsed };
      }
    }

    return { ok: false, reason: "Field must be a valid date" };
  }

  return { ok: false, reason: "Field has no scrape smart merge validator" };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Apply smart merge rules to incoming scraped data.
 * Returns what changed, what was skipped, and why.
 */
export function smartMerge(
  current: Record<string, any>,
  incoming: Record<string, any>,
  rules: SmartMergeRules,
  actorRole: "super_admin" | "master" | "manager" | "salesperson" = "manager",
  source: FieldSource = "scrape"
): MergeResult {
  const result: MergeResult = {
    updated: {},
    skipped: {},
    locked: {},
  };

  // Build lookup of locked fields
  const lockedFields = new Map<string, VehicleFieldLock>();
  for (const lock of rules.fieldLocks) {
    if (!lock.expiresAt || lock.expiresAt > new Date()) {
      lockedFields.set(lock.field, lock);
    }
  }

  for (const [field, rawIncomingValue] of Object.entries(incoming)) {
    // Skip null/undefined incoming values
    if (rawIncomingValue === null || rawIncomingValue === undefined) continue;

    if (!isSmartMergeScrapeField(field)) {
      result.skipped[field] = {
        reason: "Field is not allowed for scrape smart merge",
        currentValue: current[field],
        incomingValue: rawIncomingValue,
      };
      continue;
    }

    const validation = validateSmartMergeScrapeValue(field, rawIncomingValue);
    if (validation.ok === false) {
      result.skipped[field] = {
        reason: validation.reason,
        currentValue: current[field],
        incomingValue: rawIncomingValue,
      };
      continue;
    }

    const incomingValue = validation.value;
    const currentValue = current[field];

    // Check 1: Field is explicitly locked
    const lock = lockedFields.get(field);
    if (lock && !canOverrideLock(actorRole, lock)) {
      result.locked[field] = {
        lockedBy: lock.lockedBy,
        lockedAt: lock.lockedAt,
      };
      continue;
    }

    // Check 2: Always-preserve fields (manual edits sacred)
    if (rules.preserveManualFields && ALWAYS_PRESERVE_FIELDS.has(field)) {
      const currentSource = current[`${field}_source`] as FieldSource;
      if (currentSource === "manual" && source === "scrape") {
        result.skipped[field] = {
          reason: "Field manually edited — preserved",
          currentValue,
          incomingValue,
        };
        continue;
      }
    }

    // Check 3: Photo field rules
    if (PHOTO_FIELDS.has(field)) {
      const currentPhotos = Array.isArray(currentValue) ? currentValue : [];
      const incomingPhotos = Array.isArray(incomingValue) ? incomingValue : [];

      // If allowPhotoAddOnly: only ADD new photos, never remove
      if (rules.allowPhotoAddOnly) {
        const existingUrls = new Set(currentPhotos.map((p: string) => p.split("?")[0]));
        const newPhotos = incomingPhotos.filter((p: string) => !existingUrls.has(p.split("?")[0]));
        
        if (newPhotos.length === 0) {
          result.skipped[field] = {
            reason: "No new photos to add",
            currentValue: currentPhotos.length,
            incomingValue: incomingPhotos.length,
          };
          continue;
        }

        // Only add if total won't exceed max
        const totalAfter = currentPhotos.length + newPhotos.length;
        if (totalAfter > rules.maxPhotos) {
          const allowedToAdd = rules.maxPhotos - currentPhotos.length;
          if (allowedToAdd <= 0) {
            result.skipped[field] = {
              reason: `Photo limit reached (${rules.maxPhotos})`,
              currentValue: currentPhotos.length,
              incomingValue: incomingPhotos.length,
            };
            continue;
          }
          const toAdd = newPhotos.slice(0, allowedToAdd);
          result.updated[field] = {
            old: currentPhotos,
            new: [...currentPhotos, ...toAdd],
            source,
          };
          continue;
        }

        result.updated[field] = {
          old: currentPhotos,
          new: [...currentPhotos, ...newPhotos],
          source,
        };
        continue;
      }

      // Replace photos only if current count < maxPhotos
      if (currentPhotos.length >= rules.maxPhotos) {
        result.skipped[field] = {
          reason: `Already has ${currentPhotos.length} photos (max: ${rules.maxPhotos})`,
          currentValue: currentPhotos.length,
          incomingValue: incomingPhotos.length,
        };
        continue;
      }
    }

    // Check 4: Price field rules
    if (PRICE_FIELDS.has(field)) {
      if (!rules.updatePriceIfChanged) {
        result.skipped[field] = {
          reason: "Price updates disabled",
          currentValue,
          incomingValue,
        };
        continue;
      }

      // Don't update if price is the same
      if (currentValue === incomingValue) {
        result.skipped[field] = {
          reason: "Price unchanged",
          currentValue,
          incomingValue,
        };
        continue;
      }

      // Don't update if price difference is suspicious (>50% change)
      if (currentValue && incomingValue) {
        const change = Math.abs((incomingValue - currentValue) / currentValue);
        if (change > 0.5) {
          result.skipped[field] = {
            reason: `Price change too large (${Math.round(change * 100)}%) — flagged for review`,
            currentValue,
            incomingValue,
          };
          continue;
        }
      }
    }

    // Check 5: Don't overwrite with empty/lower-quality data
    if (currentValue && !incomingValue) {
      result.skipped[field] = {
        reason: "Existing value better than incoming",
        currentValue,
        incomingValue,
      };
      continue;
    }

    // All checks passed — field can be updated
    result.updated[field] = {
      old: currentValue,
      new: incomingValue,
      source,
    };
  }

  return result;
}

function canOverrideLock(
  role: "super_admin" | "master" | "manager" | "salesperson",
  _lock: VehicleFieldLock
): boolean {
  // Super admin and master can override any lock
  if (role === "super_admin" || role === "master") return true;
  // Manager can override salesperson locks
  if (role === "manager") return true;
  return false;
}

/**
 * Apply the merge result to an actual vehicle object.
 */
export function applyMerge(
  vehicle: Record<string, any>,
  result: MergeResult,
  source: FieldSource = "scrape"
): Record<string, any> {
  const updated = { ...vehicle };

  for (const [field, change] of Object.entries(result.updated)) {
    updated[field] = change.new;
    // Track source
    updated[`${field}_source`] = source;
    updated[`${field}_updatedAt`] = new Date().toISOString();
  }

  return updated;
}

/**
 * Build the database patch for a smart merge without copying tenant/system fields
 * from the full vehicle record back into the update payload.
 */
export function buildSmartMergeStoragePatch(result: MergeResult): Record<string, any> {
  const patch: Record<string, any> = {};

  for (const [field, change] of Object.entries(result.updated)) {
    if (isSmartMergeScrapeField(field)) {
      patch[field] = change.new;
    }
  }

  return patch;
}

/**
 * Create default merge rules for a dealership.
 */
export function createDefaultMergeRules(
  dealershipId: number,
  vehicleId: number
): SmartMergeRules {
  return {
    dealershipId,
    vehicleId,
    maxPhotos: 10,
    updatePriceIfChanged: true,
    preserveManualFields: true,
    allowPhotoAddOnly: true,
    fieldLocks: [],
  };
}

/**
 * Detect which fields were manually edited vs scraped.
 * Useful for audit trails and merge decisions.
 */
export function detectFieldSources(vehicle: Record<string, any>): Record<string, FieldSource> {
  const sources: Record<string, FieldSource> = {};
  
  for (const key of Object.keys(vehicle)) {
    const sourceKey = `${key}_source`;
    if (vehicle[sourceKey]) {
      sources[key] = vehicle[sourceKey] as FieldSource;
    } else {
      // Default to scrape if no source tracking
      sources[key] = "scrape";
    }
  }

  return sources;
}
