/**
 * Unit tests for the free-tier VIN trim extractor.
 *
 * Covers the real-world cases NHTSA returns for the major brands a dealership
 * sees on the lot — Hyundai (Series), Honda (Trim), Ford (Series), Toyota
 * (Trim or Series), plus the placeholder cases (empty string, "Not Applicable",
 * "0") that the live API returns when it has no data.
 */

import { describe, expect, it } from "@jest/globals";
import { extractTrim } from "../services/vin-trim-extractor";

describe("extractTrim", () => {
  it("reads Trim when only Trim is populated", () => {
    const result = extractTrim({ Trim: "EX-L", Series: "", Trim2: "", Series2: "" });
    expect(result).toEqual({
      trim: "EX-L",
      source: "Trim",
      rawValues: { Trim: "EX-L" },
    });
  });

  it("falls back to Series when Trim is empty (Hyundai/Kia/Ford typical)", () => {
    const result = extractTrim({ Trim: "", Series: "Preferred", Trim2: "", Series2: "" });
    expect(result.trim).toBe("Preferred");
    expect(result.source).toBe("Series");
  });

  it("falls back to Trim2 when Trim and Series are empty", () => {
    const result = extractTrim({ Trim: "", Series: "", Trim2: "Performance Pkg", Series2: "" });
    expect(result.trim).toBe("Performance Pkg");
    expect(result.source).toBe("Trim2");
  });

  it("falls back to Series2 when everything else is empty", () => {
    const result = extractTrim({ Trim: "", Series: "", Trim2: "", Series2: "Limited" });
    expect(result.trim).toBe("Limited");
    expect(result.source).toBe("Series2");
  });

  it("returns null when no trim-bearing field has a value", () => {
    const result = extractTrim({ Trim: "", Series: "", Trim2: "", Series2: "" });
    expect(result).toEqual({ trim: null, source: null, rawValues: {} });
  });

  it("treats NHTSA placeholder strings as absent", () => {
    const result = extractTrim({
      Trim: "Not Applicable",
      Series: "N/A",
      Trim2: "0",
      Series2: "Unknown",
    });
    expect(result.trim).toBeNull();
    expect(result.rawValues).toEqual({});
  });

  it("deduplicates identical values across fields", () => {
    const result = extractTrim({ Trim: "Limited", Series: "Limited", Trim2: "", Series2: "" });
    expect(result.trim).toBe("Limited");
    expect(result.source).toBe("Trim");
  });

  it("keeps the longer value when one field is a substring of another", () => {
    const result = extractTrim({
      Trim: "Sport",
      Series: "Sport Touring",
      Trim2: "",
      Series2: "",
    });
    expect(result.trim).toBe("Sport Touring");
    expect(result.source).toBe("Series");
  });

  it("combines genuinely distinct values with \" / \"", () => {
    const result = extractTrim({
      Trim: "EX-L",
      Series: "Hybrid",
      Trim2: "",
      Series2: "",
    });
    expect(result.trim).toBe("EX-L / Hybrid");
    expect(result.source).toBe("combined");
  });

  it("trims whitespace from input values", () => {
    const result = extractTrim({ Trim: "  Limited  ", Series: "", Trim2: "", Series2: "" });
    expect(result.trim).toBe("Limited");
  });

  it("ignores non-string field values defensively", () => {
    const result = extractTrim({
      Trim: 42 as unknown as string,
      Series: null,
      Trim2: undefined,
      Series2: "Preferred",
    });
    expect(result.trim).toBe("Preferred");
    expect(result.source).toBe("Series2");
  });

  it("returns raw values for diagnostics regardless of which field wins", () => {
    const result = extractTrim({
      Trim: "EX-L",
      Series: "Hybrid",
      Trim2: "AWD",
      Series2: "",
    });
    expect(result.rawValues).toEqual({ Trim: "EX-L", Series: "Hybrid", Trim2: "AWD" });
  });

  it("returns the same trim regardless of field order in the input", () => {
    const a = extractTrim({ Series2: "", Trim2: "", Series: "Preferred", Trim: "" });
    const b = extractTrim({ Trim: "", Series: "Preferred", Trim2: "", Series2: "" });
    expect(a.trim).toBe(b.trim);
    expect(a.source).toBe(b.source);
  });
});
