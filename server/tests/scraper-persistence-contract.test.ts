import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { resolve } from "path";

const deduplicateAndStoreMock = jest.fn() as any;

let scraper: typeof import("../scraper");

beforeAll(async () => {
  await (jest as any).unstable_mockModule("../services/vehicle-dedup", () => ({
    deduplicateAndStore: deduplicateAndStoreMock,
  }));

  scraper = await import("../scraper");
});

beforeEach(() => {
  jest.clearAllMocks();
});

const vehicle = {
  dealershipId: 7,
  vin: "1HGCM82633A004352",
  year: 2003,
  make: "Honda",
  model: "Accord",
  trim: "EX-L",
  type: "Sedan",
  price: 24995,
  odometer: 88000,
  images: ["https://cdn.example.com/front.jpg"],
  badges: ["One Owner"],
  location: "Vancouver",
  dealership: "Dealer One",
  stockNumber: "A123",
  dealerVdpUrl: "https://example.com/vdp",
};

describe("generic scraper persistence contract", () => {
  it("fails closed for unconfigured generic scrape entrypoints", async () => {
    await expect(scraper.scrapeInventory(7)).rejects.toMatchObject({
      code: "scraper_not_configured",
      status: "fail_closed",
    });
    await expect(scraper.scrapeVehicle("1HGCM82633A004352")).rejects.toMatchObject({
      code: "scraper_not_configured",
      status: "fail_closed",
    });

    await expect(scraper.scrapeAllDealerships()).resolves.toMatchObject({
      success: false,
      error: "scraper_not_configured",
      status: "fail_closed",
    });
  });

  it("stores browserless vehicles through the deduplication service", async () => {
    deduplicateAndStoreMock.mockResolvedValue({
      inserted: 1,
      merged: 0,
      skipped: 0,
      errors: 0,
      vehicleId: 42,
      action: "created",
      details: [{ vin: vehicle.vin, action: "insert" }],
    });

    const result = await scraper.upsertVehicleByVin(vehicle);

    expect(result).toMatchObject({
      action: "inserted",
      vehicle: { id: 42 },
    });
    expect(deduplicateAndStoreMock).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        vin: vehicle.vin,
        price: 24995,
        year: 2003,
        make: "Honda",
        model: "Accord",
        mileage: 88000,
        odometer: 88000,
        images: ["https://cdn.example.com/front.jpg"],
        photos: ["https://cdn.example.com/front.jpg"],
        stockNumber: "A123",
        sourceUrl: "https://example.com/vdp",
        sourceType: "browserless_scraper",
        sourceId: `browserless_${vehicle.vin}`,
        data: expect.objectContaining({
          dealershipId: 7,
          vin: vehicle.vin,
        }),
      })
    );
  });

  it("does not call deduplication when tenant identity is missing", async () => {
    const result = await scraper.upsertVehicleByVin({
      ...vehicle,
      dealershipId: undefined,
    });

    expect(result).toEqual({
      action: "skipped",
      vehicle: null,
      reason: "missing_dealership_id",
    });
    expect(deduplicateAndStoreMock).not.toHaveBeenCalled();
  });

  it("maps deduplication skips to skipped persistence, not updates", async () => {
    deduplicateAndStoreMock.mockResolvedValue({
      inserted: 0,
      merged: 0,
      skipped: 1,
      errors: 0,
      action: "skip",
      details: [{ vin: vehicle.vin, action: "skip", reason: "INVALID_VIN_CHECK_DIGIT" }],
    });

    const result = await scraper.upsertVehicleByVin(vehicle);

    expect(result).toMatchObject({
      action: "skipped",
      vehicle: null,
      reason: "INVALID_VIN_CHECK_DIGIT",
    });
  });

  it("keeps Browserless skipped persistence out of updated counts", () => {
    const source = readFileSync(resolve(process.cwd(), "server/browserless-robust-scraper.ts"), "utf8");

    expect(source).toContain("dealershipId: source.dealershipId");
    expect(source).toContain("} else if (saved.action === 'updated') {");
    expect(source).toContain("Skipped vehicle persistence");
    expect(source).not.toContain("if (saved.action === 'inserted') {\n                totalInserted++;\n              } else {\n                totalUpdated++;");
  });
});
