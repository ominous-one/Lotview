import express, { type Express, type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const storageMock = {
  getPublicInventoryVehicles: jest.fn() as any,
  getVehicles: jest.fn() as any,
  getVehicleById: jest.fn() as any,
  getVehicleViews: jest.fn() as any,
  getCarfaxReport: jest.fn() as any,
  trackVehicleView: jest.fn() as any,
  createVehicle: jest.fn() as any,
  updateVehicle: jest.fn() as any,
  deleteVehicle: jest.fn() as any,
  softDeleteVehicle: jest.fn() as any,
};

let appWithoutTenant: Express;
let appWithDealerOne: Express;

function buildApp(router: express.Router, dealershipId?: number): Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (dealershipId !== undefined) {
      req.dealershipId = dealershipId;
    }
    next();
  });
  app.use("/api/vehicles", router);
  return app;
}

beforeAll(async () => {
  await (jest as any).unstable_mockModule("../storage", () => ({
    storage: storageMock,
  }));

  await (jest as any).unstable_mockModule("../auth", () => ({
    authMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
    requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  }));

  await (jest as any).unstable_mockModule("../tenant-middleware", () => ({
    requireDealership: (req: Request, res: Response, next: NextFunction) => {
      if (!req.dealershipId) {
        return res.status(400).json({
          error: "No dealership context found. Please specify via subdomain or authentication.",
        });
      }
      return next();
    },
  }));

  await (jest as any).unstable_mockModule("../services/feature-flags", () => ({
    initializeFlagsFromEnv: jest.fn(),
    isEnabled: (jest.fn() as any).mockResolvedValue(false),
  }));

  await (jest as any).unstable_mockModule("../services/vehicle-dedup", () => ({
    deduplicateAndStore: jest.fn(),
  }));

  await (jest as any).unstable_mockModule("../services/photo-guard", () => ({
    enrichPhotosSafely: jest.fn(),
  }));

  await (jest as any).unstable_mockModule("../services/carfax-browserless", () => ({
    scrapeCarfaxReportCloud: jest.fn(),
  }));

  const { default: vehiclesRouter } = await import("../routes/vehicles");
  appWithoutTenant = buildApp(vehiclesRouter);
  appWithDealerOne = buildApp(vehiclesRouter, 1);
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("vehicle route tenant contracts", () => {
  it("requires tenant context before public Carfax report lookup", async () => {
    await request(appWithoutTenant)
      .get("/api/vehicles/42/carfax")
      .expect(400)
      .expect({ error: "Dealership context required" });

    expect(storageMock.getVehicleById).not.toHaveBeenCalled();
    expect(storageMock.getCarfaxReport).not.toHaveBeenCalled();
  });

  it("requires tenant context before public Carfax summary lookup", async () => {
    await request(appWithoutTenant)
      .get("/api/vehicles/42/carfax/summary")
      .expect(400)
      .expect({ error: "Dealership context required" });

    expect(storageMock.getVehicleById).not.toHaveBeenCalled();
    expect(storageMock.getCarfaxReport).not.toHaveBeenCalled();
  });

  it("requires tenant context before public vehicle view tracking", async () => {
    await request(appWithoutTenant)
      .post("/api/vehicles/42/view")
      .send({ sessionId: "session-a" })
      .expect(400)
      .expect({ error: "Dealership context required" });

    expect(storageMock.trackVehicleView).not.toHaveBeenCalled();
  });

  it("requires tenant context before public vehicle view analytics lookup", async () => {
    await request(appWithoutTenant)
      .get("/api/vehicles/42/views")
      .expect(400)
      .expect({ error: "Dealership context required" });

    expect(storageMock.getVehicleViews).not.toHaveBeenCalled();
  });

  it("passes the resolved dealership context into vehicle detail storage lookups", async () => {
    storageMock.getVehicleById.mockResolvedValue(undefined);

    await request(appWithDealerOne)
      .get("/api/vehicles/42")
      .expect(404)
      .expect({ error: "Vehicle not found" });

    expect(storageMock.getVehicleById).toHaveBeenCalledWith(42, 1);
    expect(storageMock.getVehicleViews).not.toHaveBeenCalled();
  });
});
