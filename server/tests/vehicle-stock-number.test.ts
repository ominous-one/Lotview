import { describe, expect, it } from "@jest/globals";
import {
  findActiveStockNumberConflict,
  isActiveVehicleStockIdentity,
  normalizeStockNumber,
  vehicleNormalizedStockNumber,
  withNormalizedStockNumber,
} from "../services/vehicle-stock-number";

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

  it("reads normalized stock identity from stored vehicles", () => {
    expect(vehicleNormalizedStockNumber({ stockNumber: " st-123 a " })).toBe("ST123A");
    expect(vehicleNormalizedStockNumber({ normalizedStockNumber: "hyu_0042", stockNumber: "ignored" })).toBe("HYU0042");
  });

  it("ignores inactive vehicle records when checking stock conflicts", () => {
    expect(isActiveVehicleStockIdentity({ id: 1, stockNumber: "A123" })).toBe(true);
    expect(isActiveVehicleStockIdentity({ id: 1, stockNumber: "A123", deletedAt: new Date() })).toBe(false);
    expect(isActiveVehicleStockIdentity({ id: 1, stockNumber: "A123", status: "sold" })).toBe(false);
    expect(isActiveVehicleStockIdentity({ id: 1, stockNumber: "A123", lifecycleStatus: "DELETED" })).toBe(false);
  });

  it("finds active same-dealership stock conflicts and supports update exclusions", () => {
    const vehicles = [
      { id: 1, stockNumber: "ST-123-A", status: "sold" },
      { id: 2, normalizedStockNumber: "ST123A", stockNumber: "ST-123-A" },
      { id: 3, stockNumber: "B456" },
    ];

    expect(findActiveStockNumberConflict(vehicles, " st 123 a ")?.id).toBe(2);
    expect(findActiveStockNumberConflict(vehicles, " st 123 a ", { excludeVehicleId: 2 })).toBeUndefined();
    expect(findActiveStockNumberConflict(vehicles, "unknown")).toBeUndefined();
  });
});
