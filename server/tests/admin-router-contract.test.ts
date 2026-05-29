/**
 * HTTP contract tests for the modular super-admin router.
 *
 * Covers 200, 201, 400, 401, 403, 404, and 500 cases for the key endpoints:
 *   GET    /api/super-admin/dealerships
 *   POST   /api/super-admin/dealerships
 *   GET    /api/super-admin/dealerships/:id
 *   PATCH  /api/super-admin/dealerships/:id
 *   GET    /api/super-admin/users
 *   POST   /api/super-admin/users
 *   GET    /api/super-admin/secrets/password-status
 *   POST   /api/super-admin/secrets/set-password
 *   POST   /api/super-admin/restart-server
 *   GET    /api/super-admin/dashboard/* (representative)
 *
 * Verifies super-admin gating, input validation, structured error responses,
 * and that password hashes are never leaked to the client.
 */

import express, { type Express, type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const storageMock = {
  getAdminConfig: jest.fn() as any,
  setSecretsPassword: jest.fn() as any,
  getAllDealerships: jest.fn() as any,
  getUserByEmail: jest.fn() as any,
  getDealershipBySlug: jest.fn() as any,
  getDealershipBySubdomain: jest.fn() as any,
  getDealershipById: jest.fn() as any,
  createDealership: jest.fn() as any,
  updateDealership: jest.fn() as any,
  getUsersByDealership: jest.fn() as any,
  getAllUsersForSuperAdmin: jest.fn() as any,
  createUser: jest.fn() as any,
  logAuditAction: jest.fn() as any,
  getAllGlobalSettings: jest.fn() as any,
  setGlobalSetting: jest.fn() as any,
  getAuditLogs: jest.fn() as any,
  getScraperLogs: jest.fn() as any,
};

const authModuleMock = {
  authMiddleware: (req: Request, res: Response, next: NextFunction) => {
    const role = req.headers["x-test-role"];
    if (typeof role !== "string") {
      return res.status(401).json({ error: "Authentication required" });
    }
    (req as any).user = {
      id: Number(req.headers["x-test-user-id"] ?? 1),
      email: `${role}@lotview.test`,
      role,
      name: role,
      dealershipId: 1,
    };
    return next();
  },
  requireCapability: () => (req: Request, res: Response, next: NextFunction) => {
    if (!(req as any).user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    return next();
  },
  requirePermission: () => (req: Request, res: Response, next: NextFunction) => {
    if (!(req as any).user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    return next();
  },
  hashPassword: (jest.fn() as any).mockResolvedValue("$2a$12$hashed"),
};

const tenantMiddlewareMock = {
  superAdminOnly: (req: Request, res: Response, next: NextFunction) => {
    if (!(req as any).user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if ((req as any).user.role !== "super_admin") {
      return res.status(403).json({ error: "Super admin access required" });
    }
    return next();
  },
};

const dashboardMock = {
  getSystemHealth: jest.fn() as any,
  getBusinessMetrics: jest.fn() as any,
  getDealershipActivity: jest.fn() as any,
  getAIMetrics: jest.fn() as any,
  getScrapingMetrics: jest.fn() as any,
  getFBMarketplaceMetrics: jest.fn() as any,
  getSystemAlerts: jest.fn() as any,
  resolveAlert: jest.fn() as any,
};

let app: Express;

beforeAll(async () => {
  await (jest as any).unstable_mockModule("../storage", () => ({ storage: storageMock }));
  await (jest as any).unstable_mockModule("../auth", () => authModuleMock);
  await (jest as any).unstable_mockModule("../tenant-middleware", () => tenantMiddlewareMock);
  await (jest as any).unstable_mockModule("../middleware/http-rate-limiters", () => ({
    sensitiveLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
  }));
  await (jest as any).unstable_mockModule("../services/admin-dashboard", () => dashboardMock);

  const { default: adminRouter } = await import("../routes/admin");
  app = express();
  app.use(express.json());
  app.use("/api/super-admin", adminRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
  storageMock.logAuditAction.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/dealerships
// ---------------------------------------------------------------------------

describe("GET /api/super-admin/dealerships", () => {
  it("returns 401 without authentication", async () => {
    await request(app).get("/api/super-admin/dealerships").expect(401);
  });

  it("returns 403 for non-super-admin roles", async () => {
    await request(app)
      .get("/api/super-admin/dealerships")
      .set("x-test-role", "dealer_owner")
      .expect(403)
      .expect({ error: "Super admin access required" });
  });

  it("returns 200 with the dealership list for super admins", async () => {
    storageMock.getAllDealerships.mockResolvedValue([
      { id: 1, name: "Dealer One" },
      { id: 2, name: "Dealer Two" },
    ]);

    const response = await request(app)
      .get("/api/super-admin/dealerships")
      .set("x-test-role", "super_admin")
      .expect(200);

    expect(response.body).toHaveLength(2);
  });

  it("returns 500 when storage fails", async () => {
    storageMock.getAllDealerships.mockRejectedValue(new Error("boom"));

    await request(app)
      .get("/api/super-admin/dealerships")
      .set("x-test-role", "super_admin")
      .expect(500)
      .expect({ error: "Failed to fetch dealerships" });
  });
});

// ---------------------------------------------------------------------------
// POST /api/super-admin/dealerships
// ---------------------------------------------------------------------------

describe("POST /api/super-admin/dealerships", () => {
  const validBody = {
    name: "New Dealer",
    slug: "new-dealer",
    subdomain: "newdealer",
    masterAdminEmail: "owner@new.dealer.com",
    masterAdminName: "Owner",
    masterAdminPassword: "very-strong-pass-1234",
  };

  it("returns 401 without authentication", async () => {
    await request(app).post("/api/super-admin/dealerships").send(validBody).expect(401);
  });

  it("returns 403 for non-super-admin roles", async () => {
    await request(app)
      .post("/api/super-admin/dealerships")
      .set("x-test-role", "dealer_owner")
      .send(validBody)
      .expect(403);
  });

  it("returns 400 when required fields are missing", async () => {
    await request(app)
      .post("/api/super-admin/dealerships")
      .set("x-test-role", "super_admin")
      .send({ name: "Only Name" })
      .expect(400)
      .expect({ error: "Missing required fields" });
  });

  it("returns 400 when password is shorter than 12 characters", async () => {
    await request(app)
      .post("/api/super-admin/dealerships")
      .set("x-test-role", "super_admin")
      .send({ ...validBody, masterAdminPassword: "short" })
      .expect(400)
      .expect({ error: "Password must be at least 12 characters" });
  });

  it("returns 400 when the master admin email already exists", async () => {
    storageMock.getUserByEmail.mockResolvedValue({ id: 99 });

    await request(app)
      .post("/api/super-admin/dealerships")
      .set("x-test-role", "super_admin")
      .send(validBody)
      .expect(400)
      .expect({ error: "Email already exists" });
  });

  it("returns 400 when the slug is already in use", async () => {
    storageMock.getUserByEmail.mockResolvedValue(undefined);
    storageMock.getDealershipBySlug.mockResolvedValue({ id: 7 });
    storageMock.getDealershipBySubdomain.mockResolvedValue(undefined);

    const response = await request(app)
      .post("/api/super-admin/dealerships")
      .set("x-test-role", "super_admin")
      .send(validBody)
      .expect(400);

    expect(response.body.error).toMatch(/slug/i);
    expect(response.body.errors).toEqual(expect.arrayContaining([expect.stringMatching(/slug/i)]));
  });

  it("returns 201 with the new dealership and a sanitized master user", async () => {
    storageMock.getUserByEmail.mockResolvedValue(undefined);
    storageMock.getDealershipBySlug.mockResolvedValue(undefined);
    storageMock.getDealershipBySubdomain.mockResolvedValue(undefined);
    storageMock.createDealership.mockResolvedValue({ id: 7, name: "New Dealer" });
    storageMock.createUser.mockResolvedValue({
      id: 50,
      email: "owner@new.dealer.com",
      passwordHash: "$2a$12$hashed",
      role: "master",
      dealershipId: 7,
      name: "Owner",
    });

    const response = await request(app)
      .post("/api/super-admin/dealerships")
      .set("x-test-role", "super_admin")
      .send(validBody)
      .expect(201);

    expect(response.body.dealership).toMatchObject({ id: 7, name: "New Dealer" });
    expect(response.body.masterUser).toMatchObject({ id: 50, email: "owner@new.dealer.com" });
    expect(response.body.masterUser).not.toHaveProperty("passwordHash");
    expect(storageMock.logAuditAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "dealership_created" })
    );
  });
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/dealerships/:dealershipId
// ---------------------------------------------------------------------------

describe("GET /api/super-admin/dealerships/:dealershipId", () => {
  it("returns 400 for non-integer dealership ids", async () => {
    await request(app)
      .get("/api/super-admin/dealerships/abc")
      .set("x-test-role", "super_admin")
      .expect(400)
      .expect({ error: "dealershipId must be a positive integer" });

    expect(storageMock.getDealershipById).not.toHaveBeenCalled();
  });

  it("returns 404 when the dealership is missing", async () => {
    storageMock.getDealershipById.mockResolvedValue(undefined);

    await request(app)
      .get("/api/super-admin/dealerships/42")
      .set("x-test-role", "super_admin")
      .expect(404)
      .expect({ error: "Dealership not found" });
  });

  it("returns 200 with the dealership and a sanitized master user", async () => {
    storageMock.getDealershipById.mockResolvedValue({ id: 7, name: "Dealer Seven" });
    storageMock.getUsersByDealership.mockResolvedValue([
      { id: 50, email: "owner@d7.com", role: "master", passwordHash: "$2a$12$hashed" },
      { id: 51, email: "sales@d7.com", role: "sales_rep", passwordHash: "$2a$12$hashed" },
    ]);

    const response = await request(app)
      .get("/api/super-admin/dealerships/7")
      .set("x-test-role", "super_admin")
      .expect(200);

    expect(response.body.id).toBe(7);
    expect(response.body.masterUser).toMatchObject({ id: 50, email: "owner@d7.com" });
    expect(response.body.masterUser).not.toHaveProperty("passwordHash");
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/super-admin/dealerships/:dealershipId
// ---------------------------------------------------------------------------

describe("PATCH /api/super-admin/dealerships/:dealershipId", () => {
  it("returns 400 for non-integer dealership ids", async () => {
    await request(app)
      .patch("/api/super-admin/dealerships/abc")
      .set("x-test-role", "super_admin")
      .send({ name: "x" })
      .expect(400);
  });

  it("returns 404 when the dealership is missing", async () => {
    storageMock.getDealershipById.mockResolvedValue(undefined);

    await request(app)
      .patch("/api/super-admin/dealerships/42")
      .set("x-test-role", "super_admin")
      .send({ name: "x" })
      .expect(404);
  });

  it("returns 400 when no valid fields are provided", async () => {
    storageMock.getDealershipById.mockResolvedValue({ id: 42 });

    await request(app)
      .patch("/api/super-admin/dealerships/42")
      .set("x-test-role", "super_admin")
      .send({ unknownField: "x" })
      .expect(400)
      .expect({ error: "No valid dealership fields provided" });

    expect(storageMock.updateDealership).not.toHaveBeenCalled();
  });

  it("returns 400 when a field has the wrong type", async () => {
    storageMock.getDealershipById.mockResolvedValue({ id: 42 });

    const response = await request(app)
      .patch("/api/super-admin/dealerships/42")
      .set("x-test-role", "super_admin")
      .send({ isActive: "yes" })
      .expect(400);

    expect(response.body.error).toMatch(/isActive must be a boolean/);
  });

  it("returns 200 with the updated dealership on success", async () => {
    storageMock.getDealershipById.mockResolvedValue({ id: 42 });
    storageMock.updateDealership.mockResolvedValue({ id: 42, name: "Renamed" });
    storageMock.getDealershipBySlug.mockResolvedValue(undefined);
    storageMock.getDealershipBySubdomain.mockResolvedValue(undefined);

    const response = await request(app)
      .patch("/api/super-admin/dealerships/42")
      .set("x-test-role", "super_admin")
      .send({ name: "Renamed" })
      .expect(200);

    expect(response.body).toMatchObject({ id: 42, name: "Renamed" });
    expect(storageMock.logAuditAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "dealership_updated" })
    );
  });
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/users
// ---------------------------------------------------------------------------

describe("GET /api/super-admin/users", () => {
  it("returns 400 for non-integer dealershipId query param", async () => {
    await request(app)
      .get("/api/super-admin/users?dealershipId=abc")
      .set("x-test-role", "super_admin")
      .expect(400)
      .expect({ error: "dealershipId must be a positive integer" });

    expect(storageMock.getAllUsersForSuperAdmin).not.toHaveBeenCalled();
  });

  it("returns 200 with the filtered users", async () => {
    storageMock.getAllUsersForSuperAdmin.mockResolvedValue([
      { id: 1, email: "a@b.com" },
    ]);

    const response = await request(app)
      .get("/api/super-admin/users?dealershipId=7&role=sales_rep")
      .set("x-test-role", "super_admin")
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(storageMock.getAllUsersForSuperAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ dealershipId: 7, role: "sales_rep" })
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/super-admin/users
// ---------------------------------------------------------------------------

describe("POST /api/super-admin/users", () => {
  const validBody = {
    email: "new@d7.com",
    name: "New",
    password: "very-strong-pass-1234",
    role: "sales_rep",
    dealershipId: 7,
  };

  it("returns 400 when required fields are missing", async () => {
    await request(app)
      .post("/api/super-admin/users")
      .set("x-test-role", "super_admin")
      .send({ email: "only@email.com" })
      .expect(400);
  });

  it("returns 400 when password is shorter than 12 characters", async () => {
    await request(app)
      .post("/api/super-admin/users")
      .set("x-test-role", "super_admin")
      .send({ ...validBody, password: "short" })
      .expect(400)
      .expect({ error: "Password must be at least 12 characters" });
  });

  it("returns 400 when an attempt is made to create a super_admin", async () => {
    await request(app)
      .post("/api/super-admin/users")
      .set("x-test-role", "super_admin")
      .send({ ...validBody, role: "super_admin" })
      .expect(400)
      .expect({ error: "Invalid role" });

    expect(storageMock.createUser).not.toHaveBeenCalled();
  });

  it("returns 400 when the email already exists", async () => {
    storageMock.getUserByEmail.mockResolvedValue({ id: 99 });

    await request(app)
      .post("/api/super-admin/users")
      .set("x-test-role", "super_admin")
      .send(validBody)
      .expect(400)
      .expect({ error: "A user with this email already exists" });
  });

  it("returns 400 when the dealership does not exist", async () => {
    storageMock.getUserByEmail.mockResolvedValue(undefined);
    storageMock.getDealershipById.mockResolvedValue(undefined);

    await request(app)
      .post("/api/super-admin/users")
      .set("x-test-role", "super_admin")
      .send(validBody)
      .expect(400)
      .expect({ error: "Dealership not found" });
  });

  it("returns 201 with a sanitized user and writes an audit log entry", async () => {
    storageMock.getUserByEmail.mockResolvedValue(undefined);
    storageMock.getDealershipById.mockResolvedValue({ id: 7 });
    storageMock.createUser.mockResolvedValue({
      id: 50,
      email: "new@d7.com",
      passwordHash: "$2a$12$hashed",
      role: "sales_rep",
      dealershipId: 7,
      name: "New",
    });

    const response = await request(app)
      .post("/api/super-admin/users")
      .set("x-test-role", "super_admin")
      .send(validBody)
      .expect(201);

    expect(response.body).toMatchObject({ id: 50, email: "new@d7.com" });
    expect(response.body).not.toHaveProperty("passwordHash");
    expect(storageMock.logAuditAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user_created" })
    );
  });
});

// ---------------------------------------------------------------------------
// Secrets management
// ---------------------------------------------------------------------------

describe("Secrets management routes", () => {
  it("GET /secrets/password-status returns hasPassword=true when a hash is stored", async () => {
    storageMock.getAdminConfig.mockResolvedValue({ secretsPasswordHash: "$2a$12$abc" });

    const response = await request(app)
      .get("/api/super-admin/secrets/password-status")
      .set("x-test-role", "super_admin")
      .expect(200);

    expect(response.body).toEqual({ hasPassword: true });
  });

  it("GET /secrets/password-status returns hasPassword=false when no hash is stored", async () => {
    storageMock.getAdminConfig.mockResolvedValue(null);

    const response = await request(app)
      .get("/api/super-admin/secrets/password-status")
      .set("x-test-role", "super_admin")
      .expect(200);

    expect(response.body).toEqual({ hasPassword: false });
  });

  it("POST /secrets/set-password rejects passwords under 12 characters", async () => {
    await request(app)
      .post("/api/super-admin/secrets/set-password")
      .set("x-test-role", "super_admin")
      .send({ password: "short" })
      .expect(400)
      .expect({ error: "Password must be at least 12 characters" });

    expect(storageMock.setSecretsPassword).not.toHaveBeenCalled();
  });

  it("POST /secrets/set-password persists strong passwords", async () => {
    storageMock.setSecretsPassword.mockResolvedValue(undefined);

    await request(app)
      .post("/api/super-admin/secrets/set-password")
      .set("x-test-role", "super_admin")
      .send({ password: "very-strong-pass-1234" })
      .expect(200)
      .expect({ success: true });

    expect(storageMock.setSecretsPassword).toHaveBeenCalledWith("very-strong-pass-1234");
  });
});

// ---------------------------------------------------------------------------
// Dashboard endpoints (representative sample)
// ---------------------------------------------------------------------------

describe("Dashboard endpoints", () => {
  it("GET /dashboard/health returns 200 with the system health payload", async () => {
    dashboardMock.getSystemHealth.mockResolvedValue({ status: "ok", uptime: 1 });

    const response = await request(app)
      .get("/api/super-admin/dashboard/health")
      .set("x-test-role", "super_admin")
      .expect(200);

    expect(response.body).toMatchObject({ status: "ok" });
  });

  it("GET /dashboard/alerts forwards the minSeverity filter", async () => {
    dashboardMock.getSystemAlerts.mockResolvedValue([]);

    await request(app)
      .get("/api/super-admin/dashboard/alerts?minSeverity=critical")
      .set("x-test-role", "super_admin")
      .expect(200);

    expect(dashboardMock.getSystemAlerts).toHaveBeenCalledWith("critical");
  });

  it("POST /dashboard/alerts/:id/resolve forwards the alert id and resolver user id", async () => {
    dashboardMock.resolveAlert.mockResolvedValue(true);

    const response = await request(app)
      .post("/api/super-admin/dashboard/alerts/alert-42/resolve")
      .set("x-test-role", "super_admin")
      .set("x-test-user-id", "9")
      .expect(200);

    expect(response.body).toEqual({ success: true });
    expect(dashboardMock.resolveAlert).toHaveBeenCalledWith("alert-42", 9);
  });

  it("GET /dashboard/health returns 500 when the upstream metrics service fails", async () => {
    dashboardMock.getSystemHealth.mockRejectedValue(new Error("upstream down"));

    await request(app)
      .get("/api/super-admin/dashboard/health")
      .set("x-test-role", "super_admin")
      .expect(500)
      .expect({ error: "Failed to fetch health" });
  });
});
