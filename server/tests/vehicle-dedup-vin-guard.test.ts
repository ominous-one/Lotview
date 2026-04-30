import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const VALID_VIN = "1HGCM82633A004352";
const INVALID_CHECK_DIGIT_VIN = "1HGCM82643A004352";

const storageMock = {
  getVehiclesByDealership: jest.fn() as any,
  createVehicle: jest.fn() as any,
  updateVehicle: jest.fn() as any,
  deleteVehicle: jest.fn() as any,
};

let vehicleDedup: typeof import("../services/vehicle-dedup");

beforeAll(async () => {
  await (jest as any).unstable_mockModule("../storage", () => ({
    storage: storageMock,
  }));

  vehicleDedup = await import("../services/vehicle-dedup");
});

beforeEach(() => {
  jest.clearAllMocks();
  storageMock.getVehiclesByDealership.mockResolvedValue([]);
  storageMock.createVehicle.mockResolvedValue({});
  storageMock.updateVehicle.mockResolvedValue({});
  storageMock.deleteVehicle.mockResolvedValue(true);
});

describe("vehicle dedup VIN storage guard", () => {
  it("does not insert scraped vehicles with invalid VIN check digits", async () => {
    const result = await vehicleDedup.deduplicateAndStore(7, {
      vin: INVALID_CHECK_DIGIT_VIN,
      price: 24995,
      year: 2003,
      make: "Honda",
      model: "Accord",
    });

    expect(result).toMatchObject({
      inserted: 0,
      merged: 0,
      skipped: 1,
      errors: 0,
      details: [
        {
          vin: INVALID_CHECK_DIGIT_VIN,
          action: "skip",
          reason: "INVALID_VIN_CHECK_DIGIT",
        },
      ],
    });
    expect(storageMock.createVehicle).not.toHaveBeenCalled();
    expect(storageMock.updateVehicle).not.toHaveBeenCalled();
  });

  it("normalizes valid scraped VINs before creating inventory records", async () => {
    const result = await vehicleDedup.deduplicateAndStore(7, {
      vin: ` ${VALID_VIN.toLowerCase()} `,
      price: 24995,
      year: 2003,
      make: "Honda",
      model: "Accord",
    });

    expect(result).toMatchObject({
      inserted: 1,
      merged: 0,
      skipped: 0,
      errors: 0,
      details: [{ vin: VALID_VIN, action: "insert" }],
    });
    expect(storageMock.createVehicle).toHaveBeenCalledWith(
      expect.objectContaining({
        dealershipId: 7,
        vin: VALID_VIN,
        price: 24995,
        year: 2003,
        make: "Honda",
        model: "Accord",
      })
    );
  });

  it("does not merge invalid scraped VINs into existing inventory", async () => {
    storageMock.getVehiclesByDealership.mockResolvedValue([
      {
        id: 42,
        vin: INVALID_CHECK_DIGIT_VIN,
        price: 21000,
        status: "available",
        photos: [],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const result = await vehicleDedup.deduplicateAndStore(7, {
      vin: INVALID_CHECK_DIGIT_VIN,
      price: 24995,
      status: "available",
    });

    expect(result).toMatchObject({
      inserted: 0,
      merged: 0,
      skipped: 1,
      errors: 0,
      details: [
        {
          vin: INVALID_CHECK_DIGIT_VIN,
          action: "skip",
          reason: "INVALID_VIN_CHECK_DIGIT",
        },
      ],
    });
    expect(storageMock.updateVehicle).not.toHaveBeenCalled();
    expect(storageMock.createVehicle).not.toHaveBeenCalled();
  });

  it("continues to merge valid VINs with existing dealership inventory", async () => {
    storageMock.getVehiclesByDealership.mockResolvedValue([
      {
        id: 42,
        vin: VALID_VIN,
        price: 21000,
        mileage: 90000,
        status: "available",
        photos: ["existing.jpg"],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const result = await vehicleDedup.deduplicateAndStore(7, {
      vin: VALID_VIN,
      price: 24995,
      mileage: 88000,
      photos: ["existing.jpg", "new.jpg"],
      status: "available",
    });

    expect(result).toMatchObject({
      inserted: 0,
      merged: 1,
      skipped: 0,
      errors: 0,
      details: [{ vin: VALID_VIN, action: "merge" }],
    });
    expect(storageMock.updateVehicle).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        price: 24995,
        mileage: 88000,
        photos: ["existing.jpg", "new.jpg"],
      }),
      7
    );
  });

  it("preserves manual photos and avoids duplicating the same scraped URL", async () => {
    storageMock.getVehiclesByDealership.mockResolvedValue([
      {
        id: 42,
        vin: VALID_VIN,
        price: 21000,
        status: "available",
        photos: ["manual:https://cdn.example.com/front.jpg", "https://cdn.example.com/side.jpg"],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const result = await vehicleDedup.deduplicateAndStore(7, {
      vin: VALID_VIN,
      photos: ["https://cdn.example.com/front.jpg", "https://cdn.example.com/rear.jpg"],
      status: "available",
    });

    expect(result).toMatchObject({
      inserted: 0,
      merged: 1,
      skipped: 0,
      errors: 0,
      details: [{ vin: VALID_VIN, action: "merge" }],
    });
    expect(storageMock.updateVehicle).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        photos: [
          "manual:https://cdn.example.com/front.jpg",
          "https://cdn.example.com/side.jpg",
          "https://cdn.example.com/rear.jpg",
        ],
      }),
      7
    );
  });

  it("scopes duplicate merge updates and removals to the dealership", async () => {
    storageMock.getVehiclesByDealership.mockResolvedValue([
      {
        id: 42,
        vin: VALID_VIN,
        price: 21000,
        mileage: 90000,
        photos: ["keeper.jpg"],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: 43,
        vin: VALID_VIN,
        price: 24995,
        mileage: 88000,
        photos: ["keeper.jpg", "new.jpg"],
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    ]);

    const result = await vehicleDedup.mergeDuplicates(7, VALID_VIN, [42, 43]);

    expect(result).toMatchObject({
      success: true,
      keptId: 42,
      removedIds: [43],
    });
    expect(storageMock.updateVehicle).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        price: 24995,
        mileage: 88000,
        photos: ["keeper.jpg", "new.jpg"],
      }),
      7
    );
    expect(storageMock.deleteVehicle).toHaveBeenCalledWith(43, 7);
  });
});
