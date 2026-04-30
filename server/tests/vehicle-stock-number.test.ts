import { describe, expect, it } from "@jest/globals";
import { normalizeStockNumber, withNormalizedStockNumber } from "../services/vehicle-stock-number";

describe("vehicle stock number normalization", () => {
  it("normalizes stock numbers into a stable alphanumeric identity", () => {
    expect(normalizeStockNumber(" st-123 a ")).toBe("ST123A");
    expect(normalizeStockNumber("hyu_0042")).toBe("HYU0042");
    expect(normalizeStockNumber(12345)).toBe("12345");
  });

  it("returns null for empty or non-identity stock values", () => {
    expect(normalizeStockNumber("")).toBeNull();
    expect(normalizeStockNumber(" - _ ")).toBeNull();
    expect(normalizeStockNumber(null)).toBeNull();
    expect(normalizeStockNumber(undefined)).toBeNull();
  });

  it("derives normalized stock numbers only when stockNumber is present", () => {
    expect(withNormalizedStockNumber({ stockNumber: " st-123 a ", price: 24995 })).toEqual({
      stockNumber: " st-123 a ",
      normalizedStockNumber: "ST123A",
      price: 24995,
    });

    expect(withNormalizedStockNumber({ price: 24995 })).toEqual({ price: 24995 });
  });
});
