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
