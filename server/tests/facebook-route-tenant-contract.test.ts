import express, { type Express, type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { hasPermission, type Permission } from "../../shared/authz";

const storageMock = {
  getFacebookPages: jest.fn() as any,
  createFacebookPage: jest.fn() as any,
  updateFacebookPage: jest.fn() as any,
};

let appWithoutTenant: Express;
let appWithDealerOne: Express;

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
  app.use("/api/facebook", router);
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

  await (jest as any).unstable_mockModule("../services/fb-ban-recovery", () => ({
    checkAccountHealth: jest.fn(),
    getCurrentPostingLimit: jest.fn(),
    recordPostAttempt: jest.fn(),
  }));

  await (jest as any).unstable_mockModule("../services/ai-posting-optimizer", () => ({
    getOptimizedPosting: jest.fn(),
  }));

  await (jest as any).unstable_mockModule("../services/feature-flags", () => ({
    isEnabled: jest.fn(),
  }));

  await (jest as any).unstable_mockModule("../facebook-service", () => ({
    facebookService: {
      postToMarketplace: jest.fn(),
    },
  }));

  const { default: facebookRouter } = await import("../routes/facebook");
  appWithoutTenant = buildApp(facebookRouter);
  appWithDealerOne = buildApp(facebookRouter, 1);
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Facebook Pages route tenant and RBAC contracts", () => {
  it("requires authenticated integration read permission before listing pages", async () => {
    await request(appWithDealerOne)
      .get("/api/facebook/pages")
      .expect(401)
      .expect({ error: "Not authenticated" });

    expect(storageMock.getFacebookPages).not.toHaveBeenCalled();
  });

  it("lets integration readers list only the current dealership pages", async () => {
    storageMock.getFacebookPages.mockResolvedValue([{ id: 7, dealershipId: 1, pageName: "Dealer Page" }]);

    await request(appWithDealerOne)
      .get("/api/facebook/pages")
      .set("x-test-role", "read_only")
      .expect(200)
      .expect([{ id: 7, dealershipId: 1, pageName: "Dealer Page" }]);

    expect(storageMock.getFacebookPages).toHaveBeenCalledWith(1);
  });

  it("blocks roles without integration write permission from creating pages", async () => {
    await request(appWithDealerOne)
      .post("/api/facebook/pages")
      .set("x-test-role", "sales_rep")
      .send({ pageName: "Dealer Page", pageId: "fb-page-1" })
      .expect(403)
      .expect({ error: "Insufficient permissions" });

    expect(storageMock.createFacebookPage).not.toHaveBeenCalled();
  });

  it("creates pages in the resolved dealership even when the body spoofs a tenant", async () => {
    storageMock.createFacebookPage.mockResolvedValue({ id: 9, dealershipId: 1, pageName: "Dealer Page" });

    await request(appWithDealerOne)
      .post("/api/facebook/pages")
      .set("x-test-role", "dealer_owner")
      .send({ pageName: "Dealer Page", pageId: "fb-page-1", dealershipId: 99 })
      .expect(201)
      .expect({ id: 9, dealershipId: 1, pageName: "Dealer Page" });

    expect(storageMock.createFacebookPage).toHaveBeenCalledWith({
      pageName: "Dealer Page",
      pageId: "fb-page-1",
      dealershipId: 1,
    });
  });

  it("requires dealership context before updating a page", async () => {
    await request(appWithoutTenant)
      .patch("/api/facebook/pages/9")
      .set("x-test-role", "dealer_owner")
      .send({ pageName: "Updated Page" })
      .expect(400)
      .expect({ error: "No dealership context found. Please specify via subdomain or authentication." });

    expect(storageMock.updateFacebookPage).not.toHaveBeenCalled();
  });

  it("rejects malformed page ids before storage access", async () => {
    await request(appWithDealerOne)
      .patch("/api/facebook/pages/not-a-number")
      .set("x-test-role", "dealer_owner")
      .send({ pageName: "Updated Page" })
      .expect(400)
      .expect({ error: "Invalid page id" });

    expect(storageMock.updateFacebookPage).not.toHaveBeenCalled();
  });

  it("blocks roles without integration write permission from updating pages", async () => {
    await request(appWithDealerOne)
      .patch("/api/facebook/pages/9")
      .set("x-test-role", "read_only")
      .send({ pageName: "Updated Page" })
      .expect(403)
      .expect({ error: "Insufficient permissions" });

    expect(storageMock.updateFacebookPage).not.toHaveBeenCalled();
  });

  it("scopes page updates to the resolved dealership and strips spoofed tenant changes", async () => {
    storageMock.updateFacebookPage.mockResolvedValue({ id: 9, dealershipId: 1, pageName: "Updated Page" });

    await request(appWithDealerOne)
      .patch("/api/facebook/pages/9")
      .set("x-test-role", "dealer_owner")
      .send({ pageName: "Updated Page", dealershipId: 99 })
      .expect(200)
      .expect({ id: 9, dealershipId: 1, pageName: "Updated Page" });

    expect(storageMock.updateFacebookPage).toHaveBeenCalledWith(9, { pageName: "Updated Page" }, 1);
  });

  it("returns 404 when the page is not in the resolved dealership scope", async () => {
    storageMock.updateFacebookPage.mockResolvedValue(undefined);

    await request(appWithDealerOne)
      .patch("/api/facebook/pages/9")
      .set("x-test-role", "dealer_owner")
      .send({ pageName: "Updated Page" })
      .expect(404)
      .expect({ error: "Page not found" });

    expect(storageMock.updateFacebookPage).toHaveBeenCalledWith(9, { pageName: "Updated Page" }, 1);
  });
});
