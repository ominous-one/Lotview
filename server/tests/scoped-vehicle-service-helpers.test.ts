import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const storageMock = {
  getVehicleById: jest.fn() as any,
  updateVehicle: jest.fn() as any,
};

const redisMock = {
  get: jest.fn() as any,
};

let photoGuard: typeof import("../services/photo-guard");
let aiPostingOptimizer: typeof import("../services/ai-posting-optimizer");

beforeAll(async () => {
  await (jest as any).unstable_mockModule("../storage", () => ({
    storage: storageMock,
  }));

  await (jest as any).unstable_mockModule("../services/redis", () => ({
    getRedisClient: () => redisMock,
  }));

  photoGuard = await import("../services/photo-guard");
  aiPostingOptimizer = await import("../services/ai-posting-optimizer");
});

beforeEach(() => {
  jest.clearAllMocks();
  redisMock.get.mockResolvedValue(null);
  storageMock.updateVehicle.mockResolvedValue({});
});

describe("scoped vehicle service helpers", () => {
  it("keeps storage vehicle aliases scoped by dealership", () => {
    const storageSource = readFileSync("server/storage.ts", "utf8");

    expect(storageSource).toContain("getVehiclesByDealership(dealershipId: number): Promise<Vehicle[]>");
    expect(storageSource).toContain("async getVehiclesByDealership(dealershipId: number): Promise<Vehicle[]>");
    expect(storageSource).toContain("eq(vehicles.dealershipId, dealershipId)");
    expect(storageSource).toContain("getVehicleByVinAndDealership(vin: string, dealershipId: number)");
    expect(storageSource).not.toContain("async getVehicle(id: number)");
  });

  it("loads posting optimizer vehicles through dealership-scoped storage", async () => {
    storageMock.getVehicleById.mockResolvedValue({
      id: 42,
      dealershipId: 7,
      year: 2023,
      make: "Hyundai",
      model: "Santa Fe",
      price: 24995,
      photos: ["front.jpg", "rear.jpg"],
    });

    const recommendation = await aiPostingOptimizer.getOptimizedPosting(7, 42);

    expect(storageMock.getVehicleById).toHaveBeenCalledWith(42, 7);
    expect(recommendation).toMatchObject({
      vehicleId: 42,
      recommendedPrice: 24995,
      title: expect.stringContaining("Hyundai"),
    });
  });

  it("fails closed when the posting optimizer cannot load a vehicle inside the dealership", async () => {
    storageMock.getVehicleById.mockResolvedValue(undefined);

    const recommendation = await aiPostingOptimizer.getOptimizedPosting(7, 42);

    expect(storageMock.getVehicleById).toHaveBeenCalledWith(42, 7);
    expect(recommendation).toBeNull();
  });

  it("adds manual photos through dealership-scoped vehicle reads and writes", async () => {
    storageMock.getVehicleById.mockResolvedValue({
      id: 42,
      dealershipId: 7,
      photos: ["existing.jpg"],
    });

    await photoGuard.addManualPhoto(7, 42, "manual-upload.jpg", 99);

    expect(storageMock.getVehicleById).toHaveBeenCalledWith(42, 7);
    expect(storageMock.updateVehicle).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        photos: ["existing.jpg", "manual:manual-upload.jpg"],
        updatedAt: expect.any(Date),
      }),
      7
    );
  });

  it("enriches scraped photos only after a dealership-scoped vehicle read", async () => {
    storageMock.getVehicleById.mockResolvedValue({
      id: 42,
      dealershipId: 7,
      photos: ["manual:https://cdn.example.com/front.jpg", "https://cdn.example.com/side.jpg"],
    });

    const result = await photoGuard.enrichPhotosSafely(7, 42, [
      "https://cdn.example.com/front.jpg",
      "https://cdn.example.com/rear.jpg",
    ]);

    expect(storageMock.getVehicleById).toHaveBeenCalledWith(42, 7);
    expect(storageMock.updateVehicle).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        photos: [
          "manual:https://cdn.example.com/front.jpg",
          "https://cdn.example.com/side.jpg",
          "https://cdn.example.com/rear.jpg",
        ],
        updatedAt: expect.any(Date),
      }),
      7
    );
    expect(result).toMatchObject({ added: 1, preserved: 1, skipped: 1 });
  });

  it("does not update photos when the vehicle is outside the dealership scope", async () => {
    storageMock.getVehicleById.mockResolvedValue(undefined);

    const result = await photoGuard.enrichPhotosSafely(7, 42, ["rear.jpg"]);

    expect(storageMock.getVehicleById).toHaveBeenCalledWith(42, 7);
    expect(storageMock.updateVehicle).not.toHaveBeenCalled();
    expect(result).toEqual({ added: 0, preserved: 0, skipped: 0, enrichedPhotos: [] });
  });
});
