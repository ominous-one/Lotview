/**
 * Free-tier VIN trim extractor.
 *
 * NHTSA's vPIC returns trim under multiple field names depending on the
 * manufacturer. Hyundai and Kia put trim in `Series`, Honda often puts it
 * in `Trim`, Ford uses `Series`, Toyota uses both `Trim` and `Series`. The
 * current decoder only reads `Trim`, so trim is missing for many real-world
 * VINs in the dealership's inventory.
 *
 * This extractor reads every NHTSA trim-bearing field, normalizes them, and
 * picks the best signal. It is intentionally independent of the broader
 * VIN decoder so it can be unit-tested in isolation and reused if we later
 * add a manufacturer-specific lookup.
 *
 * Field priority (per NHTSA's own field guide and empirical observation):
 *   1. Trim          — when present, manufacturer-supplied trim name
 *   2. Series        — many OEMs put trim here (Hyundai, Kia, Ford)
 *   3. Trim2         — secondary trim qualifier (rare, e.g., performance pkg)
 *   4. Series2       — secondary series qualifier
 *
 * If two distinct values are present and neither is a substring of the other,
 * they are joined with " / " (e.g., "EX-L / Sport"). If one is a substring or
 * the same case-folded value, the longer one wins.
 */

const TRIM_SOURCE_FIELDS = ["Trim", "Series", "Trim2", "Series2"] as const;

const PLACEHOLDER_VALUES = new Set([
  "",
  "not applicable",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "unknown",
  "0",
]);

function normalize(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) {
    return null;
  }

  return trimmed;
}

function isSubstringMatch(a: string, b: string): boolean {
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  return lowerA.includes(lowerB) || lowerB.includes(lowerA);
}

export interface ExtractTrimResult {
  trim: string | null;
  source: "Trim" | "Series" | "Trim2" | "Series2" | "combined" | null;
  rawValues: Partial<Record<(typeof TRIM_SOURCE_FIELDS)[number], string>>;
}

export function extractTrim(nhtsaResult: Record<string, unknown>): ExtractTrimResult {
  const rawValues: ExtractTrimResult["rawValues"] = {};
  const distinctValues: Array<{ field: (typeof TRIM_SOURCE_FIELDS)[number]; value: string }> = [];

  for (const field of TRIM_SOURCE_FIELDS) {
    const normalized = normalize(nhtsaResult[field]);
    if (normalized === null) {
      continue;
    }
    rawValues[field] = normalized;

    const isDuplicate = distinctValues.some(existing => existing.value.toLowerCase() === normalized.toLowerCase());
    if (!isDuplicate) {
      distinctValues.push({ field, value: normalized });
    }
  }

  if (distinctValues.length === 0) {
    return { trim: null, source: null, rawValues };
  }

  if (distinctValues.length === 1) {
    return { trim: distinctValues[0].value, source: distinctValues[0].field, rawValues };
  }

  // Multiple distinct values — collapse substring matches, keeping the longer one
  const collapsed: typeof distinctValues = [];
  for (const candidate of distinctValues) {
    const supersededIndex = collapsed.findIndex(existing => isSubstringMatch(existing.value, candidate.value));

    if (supersededIndex === -1) {
      collapsed.push(candidate);
      continue;
    }

    if (candidate.value.length > collapsed[supersededIndex].value.length) {
      collapsed[supersededIndex] = candidate;
    }
  }

  if (collapsed.length === 1) {
    return { trim: collapsed[0].value, source: collapsed[0].field, rawValues };
  }

  return {
    trim: collapsed.map(item => item.value).join(" / "),
    source: "combined",
    rawValues,
  };
}
