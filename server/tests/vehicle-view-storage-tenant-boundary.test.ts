import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const selectLimitMock = jest.fn() as any;
const selectWhereMock = jest.fn() as any;
const selectFromMock = jest.fn() as any;
const selectMock = jest.fn() as any;
const insertReturningMock = jest.fn() as any;
const insertValuesMock = jest.fn() as any;
const insertMock = jest.fn() as any;

let DatabaseStorageClass: typeof import("../storage").DatabaseStorage;

function getMethodSource(storageSource: string, start: string, end: string): string {
  const methodStart = storageSource.indexOf(start);
  const methodEnd = storageSource.indexOf(end, methodStart);
  return storageSource.slice(methodStart, methodEnd);
}

beforeAll(async () => {
  selectWhereMock.mockReturnValue({ limit: selectLimitMock });
  selectFromMock.mockReturnValue({ where: selectWhereMock });
  selectMock.mockReturnValue({ from: selectFromMock });
  insertValuesMock.mockReturnValue({ returning: insertReturningMock });
  insertMock.mockReturnValue({ values: insertValuesMock });

  await (jest as any).unstable_mockModule("../db.ts", () => ({
    db: {
      select: selectMock,
      insert: insertMock,
    },
  }));

  const storageModule = await import("../storage");
  DatabaseStorageClass = storageModule.DatabaseStorage;
});

beforeEach(() => {
  jest.clearAllMocks();
  selectWhereMock.mockReturnValue({ limit: selectLimitMock });
  selectFromMock.mockReturnValue({ where: selectWhereMock });
  selectMock.mockReturnValue({ from: selectFromMock });
  insertValuesMock.mockReturnValue({ returning: insertReturningMock });
  insertMock.mockReturnValue({ values: insertValuesMock });
});

describe("vehicle view storage tenant boundary", () => {
  it("requires dealership context before legacy vehicle view routes enter storage", () => {
    const routesSource = readFileSync(join(process.cwd(), "server/routes.ts"), "utf8");

    expect(routesSource).toContain('app.post("/api/vehicles/:id/view", requireDealership, async');
    expect(routesSource).toContain('app.get("/api/vehicles/:id/views", requireDealership, async');
  });

  it("checks both vehicle ownership and view-row dealership scope", () => {
    const storageSource = readFileSync(join(process.cwd(), "server/storage.ts"), "utf8");

    const trackSource = getMethodSource(
      storageSource,
      "async trackVehicleView",
      "async getVehicleViews"
    );
    expect(trackSource).toContain("eq(vehicles.id, view.vehicleId)");
    expect(trackSource).toContain("eq(vehicles.dealershipId, view.dealershipId)");

    const countSource = getMethodSource(
      storageSource,
      "async getVehicleViews",
      "async getAllVehicleViews"
    );
    expect(countSource).toContain("eq(vehicleViews.dealershipId, dealershipId)");
    expect(countSource).toContain("eq(vehicles.dealershipId, dealershipId)");

    const aggregateSource = getMethodSource(
      storageSource,
      "async getAllVehicleViews",
      "// Facebook pages"
    );
    expect(aggregateSource).toContain("eq(vehicleViews.dealershipId, dealershipId)");
    expect(aggregateSource).toContain("eq(vehicles.dealershipId, dealershipId)");
  });

  it("does not insert a view when the vehicle is outside the dealership boundary", async () => {
    selectLimitMock.mockResolvedValue([]);
    const storage = new DatabaseStorageClass();

    const view = await storage.trackVehicleView({
      vehicleId: 42,
      dealershipId: 7,
      sessionId: "session-a",
    });

    expect(view).toBeUndefined();
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("inserts a view when the vehicle belongs to the dealership", async () => {
    selectLimitMock.mockResolvedValue([{ id: 42 }]);
    insertReturningMock.mockResolvedValue([{ id: 10, vehicleId: 42, dealershipId: 7 }]);
    const storage = new DatabaseStorageClass();

    const view = await storage.trackVehicleView({
      vehicleId: 42,
      dealershipId: 7,
      sessionId: "session-a",
    });

    expect(view).toEqual({ id: 10, vehicleId: 42, dealershipId: 7 });
    expect(insertValuesMock).toHaveBeenCalledWith({
      vehicleId: 42,
      dealershipId: 7,
      sessionId: "session-a",
    });
  });
});
