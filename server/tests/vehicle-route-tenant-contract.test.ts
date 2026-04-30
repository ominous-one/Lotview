import express, { type Express, type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { hasPermission, type Permission } from "../../shared/authz";

const storageMock = {
  getPublicInventoryVehicles: jest.fn() as any,
  getVehicles: jest.fn() as any,
  getVehiclesByDealership: jest.fn() as any,
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

const completeVehiclePayload = {
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
};

function applyTestUserFromHeader(req: Request): void {
  const role = req.headers["x-test-role"];
  if (typeof role !== "string") return;

  req.user = {
    id: 10,
    email: `${role}@lotview.test`,
    role,
    name: role,
    dealershipId: req.dealershipId ?? 1,
  };
}

function buildApp(router: express.Router, dealershipId?: number): Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (dealershipId !== undefined) {
      req.dealershipId = dealershipId;
    }
    applyTestUserFromHeader(req);
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
    authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
      applyTestUserFromHeader(req);
      return next();
    },
    requirePermission: (permission: Permission) => (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!hasPermission(req.user.role, permission)) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
      return next();
    },
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

  it("returns 404 when view tracking misses the dealership-scoped vehicle", async () => {
    storageMock.trackVehicleView.mockResolvedValue(undefined);

    await request(appWithDealerOne)
      .post("/api/vehicles/42/view")
      .send({ sessionId: "session-a" })
      .expect(404)
      .expect({ error: "Vehicle not found" });

    expect(storageMock.trackVehicleView).toHaveBeenCalledWith({
      vehicleId: 42,
      sessionId: "session-a",
      dealershipId: 1,
    });
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

  it("keeps full inventory view behind authenticated inventory read permission", async () => {
    await request(appWithDealerOne)
      .get("/api/vehicles?view=full")
      .expect(401)
      .expect({ error: "Authentication required for full inventory view" });

    expect(storageMock.getVehicles).not.toHaveBeenCalled();
    expect(storageMock.getPublicInventoryVehicles).not.toHaveBeenCalled();
  });

  it("blocks unknown roles from full inventory view", async () => {
    await request(appWithDealerOne)
      .get("/api/vehicles?view=full")
      .set("x-test-role", "unknown_role")
      .expect(403)
      .expect({ error: "Insufficient permissions" });

    expect(storageMock.getVehicles).not.toHaveBeenCalled();
    expect(storageMock.getPublicInventoryVehicles).not.toHaveBeenCalled();
  });

  it("allows inventory readers to access full inventory view", async () => {
    storageMock.getVehicles.mockResolvedValue({
      vehicles: [{ id: 42, localImages: ["local.jpg"], images: ["remote.jpg"] }],
      total: 1,
    });
    storageMock.getVehicleViews.mockResolvedValue(3);

    await request(appWithDealerOne)
      .get("/api/vehicles?view=full")
      .set("x-test-role", "read_only")
      .expect(200)
      .expect({
        data: [{ id: 42, localImages: ["local.jpg"], images: ["local.jpg"], views: 3 }],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      });

    expect(storageMock.getVehicles).toHaveBeenCalledWith(1, 100, 0);
    expect(storageMock.getPublicInventoryVehicles).not.toHaveBeenCalled();
  });

  it("blocks read-only users from creating inventory", async () => {
    await request(appWithDealerOne)
      .post("/api/vehicles")
      .set("x-test-role", "read_only")
      .send({ vin: "1HGCM82633A004352" })
      .expect(403)
      .expect({ error: "Insufficient permissions" });

    expect(storageMock.createVehicle).not.toHaveBeenCalled();
  });

  it("rejects invalid VINs on inventory create before duplicate checks or storage writes", async () => {
    await request(appWithDealerOne)
      .post("/api/vehicles")
      .set("x-test-role", "dealer_manager")
      .send({ ...completeVehiclePayload, vin: "1HGCM82643A004352" })
      .expect(400)
      .expect({
        error: "VIN check digit is invalid",
        errorCode: "INVALID_VIN_CHECK_DIGIT",
        vin: "1HGCM82643A004352",
        expectedCheckDigit: "3",
        actualCheckDigit: "4",
      });

    expect(storageMock.getVehicles).not.toHaveBeenCalled();
    expect(storageMock.getVehiclesByDealership).not.toHaveBeenCalled();
    expect(storageMock.createVehicle).not.toHaveBeenCalled();
  });

  it("creates inventory with the resolved dealership context instead of a client-supplied dealership id", async () => {
    storageMock.getVehiclesByDealership.mockResolvedValue([]);
    storageMock.createVehicle.mockImplementation(async (vehicle: any) => ({ id: 42, ...vehicle }));

    await request(appWithDealerOne)
      .post("/api/vehicles")
      .set("x-test-role", "dealer_manager")
      .send({
        ...completeVehiclePayload,
        vin: " 1hgcm82633a004352 ",
        stockNumber: " st-123 a ",
        dealershipId: 999,
        normalizedStockNumber: "SPOOFED",
      })
      .expect(201)
      .expect((res) => {
        expect(res.body).toMatchObject({
          id: 42,
          dealershipId: 1,
          vin: "1HGCM82633A004352",
          stockNumber: " st-123 a ",
          normalizedStockNumber: "ST123A",
        });
      });

    expect(storageMock.getVehiclesByDealership).toHaveBeenCalledWith(1);
    expect(storageMock.createVehicle).toHaveBeenCalledWith(
      expect.objectContaining({
        dealershipId: 1,
        vin: "1HGCM82633A004352",
        stockNumber: " st-123 a ",
        normalizedStockNumber: "ST123A",
      }),
    );
  });

  it("rejects same-dealership active stock number conflicts on create", async () => {
    storageMock.getVehiclesByDealership.mockResolvedValue([
      {
        id: 77,
        year: 2024,
        make: "Hyundai",
        model: "Tucson",
        vin: "KM8JF3A41RU123456",
        stockNumber: "ST-123-A",
        normalizedStockNumber: "ST123A",
        lifecycleStatus: "ACTIVE",
      },
    ]);

    await request(appWithDealerOne)
      .post("/api/vehicles")
      .set("x-test-role", "dealer_manager")
      .send({
        ...completeVehiclePayload,
        vin: "1HGCM82633A004352",
        stockNumber: " st 123 a ",
      })
      .expect(409)
      .expect((res) => {
        expect(res.body).toMatchObject({
          error: "Vehicle with this stock number already exists",
          existingVehicleId: 77,
        });
      });

    expect(storageMock.createVehicle).not.toHaveBeenCalled();
  });

  it("blocks sales reps from updating inventory", async () => {
    await request(appWithDealerOne)
      .patch("/api/vehicles/42")
      .set("x-test-role", "sales_rep")
      .send({ price: "25000" })
      .expect(403)
      .expect({ error: "Insufficient permissions" });

    expect(storageMock.updateVehicle).not.toHaveBeenCalled();
  });

  it("rejects same-dealership active stock number conflicts on update", async () => {
    storageMock.getVehiclesByDealership.mockResolvedValue([
      {
        id: 77,
        year: 2024,
        make: "Hyundai",
        model: "Tucson",
        stockNumber: "ST-123-A",
        normalizedStockNumber: "ST123A",
        lifecycleStatus: "ACTIVE",
      },
      {
        id: 42,
        year: 2003,
        make: "Honda",
        model: "Accord",
        stockNumber: "A-001",
        normalizedStockNumber: "A001",
        lifecycleStatus: "ACTIVE",
      },
    ]);

    await request(appWithDealerOne)
      .patch("/api/vehicles/42")
      .set("x-test-role", "dealer_manager")
      .send({ stockNumber: " st 123 a " })
      .expect(409)
      .expect((res) => {
        expect(res.body).toMatchObject({
          error: "Vehicle with this stock number already exists",
          existingVehicleId: 77,
        });
      });

    expect(storageMock.updateVehicle).not.toHaveBeenCalled();
  });

  it("rejects invalid VINs on inventory update before storage writes", async () => {
    await request(appWithDealerOne)
      .patch("/api/vehicles/42")
      .set("x-test-role", "dealer_manager")
      .send({ vin: "1HGCM82643A004352" })
      .expect(400)
      .expect({
        error: "VIN check digit is invalid",
        errorCode: "INVALID_VIN_CHECK_DIGIT",
        vin: "1HGCM82643A004352",
        expectedCheckDigit: "3",
        actualCheckDigit: "4",
      });

    expect(storageMock.updateVehicle).not.toHaveBeenCalled();
  });

  it("blocks read-only users from deleting inventory", async () => {
    await request(appWithDealerOne)
      .delete("/api/vehicles/42")
      .set("x-test-role", "read_only")
      .expect(403)
      .expect({ error: "Insufficient permissions" });

    expect(storageMock.deleteVehicle).not.toHaveBeenCalled();
  });

  it("does not report success when a dealership-scoped delete finds no matching vehicle", async () => {
    storageMock.deleteVehicle.mockResolvedValue(false);

    await request(appWithDealerOne)
      .delete("/api/vehicles/42")
      .set("x-test-role", "dealer_manager")
      .expect(404)
      .expect({ error: "Vehicle not found" });

    expect(storageMock.deleteVehicle).toHaveBeenCalledWith(42, 1);
  });

  it("blocks read-only users from AI inventory description writes before storage access", async () => {
    await request(appWithDealerOne)
      .post("/api/vehicles/42/generate-description")
      .set("x-test-role", "read_only")
      .expect(403)
      .expect({ error: "Insufficient permissions" });

    expect(storageMock.getVehicleById).not.toHaveBeenCalled();
    expect(storageMock.updateVehicle).not.toHaveBeenCalled();
  });

  it("blocks dealer managers from external rescrape triggers without integrations write permission", async () => {
    await request(appWithDealerOne)
      .post("/api/vehicles/42/force-rescrape")
      .set("x-test-role", "dealer_manager")
      .expect(403)
      .expect({ error: "Insufficient permissions" });

    expect(storageMock.getVehicleById).not.toHaveBeenCalled();
  });

  it("lets dealer managers reach inventory write handlers through explicit permission", async () => {
    storageMock.updateVehicle.mockResolvedValue(undefined);

    await request(appWithDealerOne)
      .patch("/api/vehicles/42")
      .set("x-test-role", "dealer_manager")
      .send({ price: 25000 })
      .expect(404)
      .expect({ error: "Vehicle not found" });

    expect(storageMock.updateVehicle).toHaveBeenCalledWith(42, expect.objectContaining({ price: 25000 }), 1);
  });
});
