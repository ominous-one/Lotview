import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const returningMock = jest.fn() as any;
const whereMock = jest.fn() as any;
const setMock = jest.fn() as any;
const updateMock = jest.fn() as any;

let DatabaseStorageClass: typeof import("../storage").DatabaseStorage;

beforeAll(async () => {
  whereMock.mockReturnValue({ returning: returningMock });
  setMock.mockReturnValue({ where: whereMock });
  updateMock.mockReturnValue({ set: setMock });

  await (jest as any).unstable_mockModule("../db.ts", () => ({
    db: {
      update: updateMock,
    },
  }));

  const storageModule = await import("../storage");
  DatabaseStorageClass = storageModule.DatabaseStorage;
});

beforeEach(() => {
  jest.clearAllMocks();
  whereMock.mockReturnValue({ returning: returningMock });
  setMock.mockReturnValue({ where: whereMock });
  updateMock.mockReturnValue({ set: setMock });
});

describe("vehicle storage tenant delete boundary", () => {
  it("returns false when no dealership-scoped vehicle row is updated", async () => {
    returningMock.mockResolvedValue([]);
    const storage = new DatabaseStorageClass();

    const deleted = await storage.deleteVehicle(42, 7);

    expect(deleted).toBe(false);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
      deletedReason: "MANUAL_DELETE",
      lifecycleStatus: "DELETED",
    }));
  });

  it("returns true when the dealership-scoped vehicle row is updated", async () => {
    returningMock.mockResolvedValue([{ id: 42 }]);
    const storage = new DatabaseStorageClass();

    const deleted = await storage.deleteVehicle(42, 7);

    expect(deleted).toBe(true);
  });
});

describe("vehicle storage update boundary", () => {
  it("strips immutable vehicle ownership fields before dealership-scoped updates", async () => {
    returningMock.mockResolvedValue([{ id: 42, price: 26000 }]);
    const storage = new DatabaseStorageClass();

    const updated = await storage.updateVehicle(42, {
      id: 999,
      dealershipId: 999,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      price: 26000,
    } as any, 7);

    expect(updated).toEqual({ id: 42, price: 26000 });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith({ price: 26000 });
  });

  it("does not issue a database update when only immutable fields are supplied", async () => {
    const storage = new DatabaseStorageClass();

    const updated = await storage.updateVehicle(42, {
      id: 999,
      dealershipId: 999,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    } as any, 7);

    expect(updated).toBeUndefined();
    expect(updateMock).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
  });
});
