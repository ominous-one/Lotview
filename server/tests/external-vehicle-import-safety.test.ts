import { describe, expect, it, jest } from "@jest/globals";
import {
  EXTERNAL_IMPORT_DEDUP_DISABLED,
  EXTERNAL_IMPORT_DEDUP_FAILED,
  storeExternalVehicleImport,
} from "../services/external-vehicle-import-safety";
import type { DedupResult, ScrapedVehicleData } from "../services/vehicle-dedup";

type DeduplicateFn = (dealershipId: number, vehicle: ScrapedVehicleData) => Promise<DedupResult>;

const vehiclePayload = {
  dealershipId: 7,
  year: 2003,
  make: "Honda",
  model: "Accord",
  trim: "EX",
  type: "Sedan",
  price: 24995,
  odometer: 120000,
  images: [],
  badges: [],
  location: "Vancouver",
  dealership: "Dealer One",
  description: "Clean local unit",
  vin: "1HGCM82633A004352",
};

describe("external vehicle import safety", () => {
  it("fails closed without storage writes when vehicle deduplication is disabled", async () => {
    const deduplicate = jest.fn<DeduplicateFn>();

    const result = await storeExternalVehicleImport({
      dealershipId: 7,
      index: 0,
      normalizedVin: "1HGCM82633A004352",
      vehiclePayload,
      isDedupEnabled: async () => false,
      deduplicate,
    });

    expect(result).toEqual({
      ok: false,
      vin: "1HGCM82633A004352",
      error: "Vehicle deduplication is required for external vehicle imports.",
      errorCode: EXTERNAL_IMPORT_DEDUP_DISABLED,
    });
    expect(deduplicate).not.toHaveBeenCalled();
  });

  it("returns a per-row error instead of falling back when deduplication fails", async () => {
    const deduplicate = jest.fn<DeduplicateFn>().mockRejectedValue(new Error("dedup backend unavailable"));

    const result = await storeExternalVehicleImport({
      dealershipId: 7,
      index: 0,
      normalizedVin: "1HGCM82633A004352",
      vehiclePayload,
      isDedupEnabled: async () => true,
      deduplicate,
    });

    expect(result).toEqual({
      ok: false,
      vin: "1HGCM82633A004352",
      error: "dedup backend unavailable",
      errorCode: EXTERNAL_IMPORT_DEDUP_FAILED,
    });
    expect(deduplicate).toHaveBeenCalledTimes(1);
  });

  it("stores imports through the deduplication service with source metadata", async () => {
    const deduplicate = jest.fn<DeduplicateFn>().mockResolvedValue({
      inserted: 1,
      merged: 0,
      skipped: 0,
      errors: 0,
      vehicleId: 42,
      action: "created",
      confidence: 95,
      details: [],
    });

    const result = await storeExternalVehicleImport({
      dealershipId: 7,
      index: 2,
      normalizedVin: "1HGCM82633A004352",
      vehiclePayload,
      isDedupEnabled: async () => true,
      deduplicate,
      now: () => Date.parse("2026-04-30T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: true,
      id: 42,
      vin: "1HGCM82633A004352",
      action: "created",
      confidence: 95,
    });
    expect(deduplicate).toHaveBeenCalledWith(7, {
      vin: "1HGCM82633A004352",
      sourceId: "import_1777507200000_2",
      sourceType: "external_import",
      scrapedAt: new Date("2026-04-30T00:00:00.000Z"),
      data: vehiclePayload,
    });
  });
});
