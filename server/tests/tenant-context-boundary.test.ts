import jwt from "jsonwebtoken";
import { jest } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";
import {
  dealershipOwnerOrMaster,
  requireDealership,
  tenantMiddleware,
} from "../tenant-middleware";
import { resolveDealershipIdStrict } from "../tenant-utils";

const TEST_JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.SESSION_SECRET ||
  "olympic-auto-jwt-dev-secret-DO-NOT-USE-IN-PRODUCTION";

function signTenantToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, TEST_JWT_SECRET);
}

function createRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    hostname: "localhost",
    method: "GET",
    protocol: "http",
    originalUrl: "/",
    url: "/",
    params: {},
    query: {},
    ...overrides,
  } as Request;
}

function createResponse(): Response & {
  status: jest.Mock;
  json: jest.Mock;
  redirect: jest.Mock;
} {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
  };

  return response as unknown as Response & {
    status: jest.Mock;
    json: jest.Mock;
    redirect: jest.Mock;
  };
}

function createStorageMock() {
  return {
    getDealership: jest.fn(async (id: number) => ({
      id,
      name: `Dealer ${id}`,
      slug: `dealer-${id}`,
    })),
    getDealershipByHostname: jest.fn(async () => null),
    getTenantDomainByHostname: jest.fn(async () => null),
    getDealershipBySubdomain: jest.fn(async () => null),
    getPrimaryTenantDomainForDealership: jest.fn(async () => null),
  };
}

describe("tenant context boundary", () => {
  it("resolves strict dealership context without falling back to a default tenant", () => {
    expect(resolveDealershipIdStrict({})).toBeNull();
    expect(resolveDealershipIdStrict({ user: { id: 7, dealershipId: null } })).toBeNull();
    expect(resolveDealershipIdStrict({ user: { id: 7, dealershipId: 12 } })).toBe(12);
    expect(
      resolveDealershipIdStrict({
        dealershipId: 34,
        user: { id: 7, dealershipId: 12 },
      })
    ).toBe(34);
  });

  it("does not trust X-Dealership-Id without authentication", async () => {
    const storage = createStorageMock();
    const req = createRequest({
      headers: { "x-dealership-id": "2" },
    });
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await tenantMiddleware(storage)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.dealershipId).toBeUndefined();
    expect(storage.getDealership).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("treats app.lotview.ai as a system host instead of a dealership subdomain", async () => {
    const storage = createStorageMock();
    const req = createRequest({
      hostname: "app.lotview.ai",
      headers: { accept: "text/html" },
    });
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await tenantMiddleware(storage)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.dealershipId).toBeUndefined();
    expect(req.tenantSource).toBeUndefined();
    expect(storage.getDealershipByHostname).toHaveBeenCalledWith("app.lotview.ai");
    expect(storage.getDealershipBySubdomain).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("keeps regular users pinned to their JWT dealership when a different header is supplied", async () => {
    const storage = createStorageMock();
    const token = signTenantToken({
      id: 10,
      email: "manager@dealer-a.test",
      role: "manager",
      name: "Dealer A Manager",
      dealershipId: 1,
    });
    const req = createRequest({
      headers: {
        authorization: `Bearer ${token}`,
        "x-dealership-id": "2",
      },
    });
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await tenantMiddleware(storage)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.dealershipId).toBe(1);
    expect(req.tenantSource).toBe("jwt");
    expect(storage.getDealership).toHaveBeenCalledWith(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows explicit super admin tenant selection through X-Dealership-Id", async () => {
    const storage = createStorageMock();
    const token = signTenantToken({
      id: 1,
      email: "super@lotview.test",
      role: "super_admin",
      name: "Super Admin",
    });
    const req = createRequest({
      headers: {
        authorization: `Bearer ${token}`,
        "x-dealership-id": "2",
      },
    });
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await tenantMiddleware(storage)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      id: 1,
      role: "super_admin",
      dealershipId: null,
    });
    expect(req.dealershipId).toBe(2);
    expect(req.tenantSource).toBe("header");
    expect(storage.getDealership).toHaveBeenCalledWith(2);
  });

  it("rejects malformed super admin tenant selection headers before tenant lookup", async () => {
    const storage = createStorageMock();
    const token = signTenantToken({
      id: 1,
      email: "super@lotview.test",
      role: "super_admin",
      name: "Super Admin",
    });
    const req = createRequest({
      headers: {
        authorization: `Bearer ${token}`,
        "x-dealership-id": "2abc",
      },
    });
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await tenantMiddleware(storage)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(req.dealershipId).toBeUndefined();
    expect(storage.getDealership).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "X-Dealership-Id must be a positive integer",
    });
  });

  it("rejects zero-valued super admin tenant selection headers", async () => {
    const storage = createStorageMock();
    const token = signTenantToken({
      id: 1,
      email: "super@lotview.test",
      role: "super_admin",
      name: "Super Admin",
    });
    const req = createRequest({
      headers: {
        authorization: `Bearer ${token}`,
        "x-dealership-id": "0",
      },
    });
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await tenantMiddleware(storage)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(req.dealershipId).toBeUndefined();
    expect(storage.getDealership).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "X-Dealership-Id must be a positive integer",
    });
  });

  it("rejects regular legacy tokens that do not include dealership context", async () => {
    const storage = createStorageMock();
    const token = signTenantToken({
      id: 10,
      email: "manager@dealer-a.test",
      role: "manager",
      name: "Dealer A Manager",
    });
    const req = createRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    await tenantMiddleware(storage)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Session expired. Please log in again.",
      code: "LEGACY_TOKEN_REJECTED",
    });
  });

  it("requires dealership context before dealership-scoped handlers run", () => {
    const req = createRequest();
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    requireDealership(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "No dealership context found. Please specify via subdomain or authentication.",
    });
  });

  it("blocks regular users from accessing a different dealership through route params", () => {
    const req = createRequest({
      dealershipId: 2,
      params: { dealershipId: "2" },
      user: {
        id: 10,
        email: "manager@dealer-a.test",
        role: "manager",
        name: "Dealer A Manager",
        dealershipId: 1,
      },
    } as Partial<Request>);
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    dealershipOwnerOrMaster(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "Access denied. You can only access your own dealership data.",
    });
  });

  it("rejects malformed owner-guard route tenant ids instead of partially parsing them", () => {
    const req = createRequest({
      params: { dealershipId: "2abc" },
      user: {
        id: 10,
        email: "manager@dealer-b.test",
        role: "manager",
        name: "Dealer B Manager",
        dealershipId: 2,
      },
    } as Partial<Request>);
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    dealershipOwnerOrMaster(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "dealershipId must be a positive integer",
    });
  });

  it("rejects malformed owner-guard query tenant ids instead of partially parsing them", () => {
    const req = createRequest({
      query: { dealershipId: "2abc" },
      user: {
        id: 10,
        email: "manager@dealer-b.test",
        role: "manager",
        name: "Dealer B Manager",
        dealershipId: 2,
      },
    } as Partial<Request>);
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    dealershipOwnerOrMaster(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "dealershipId must be a positive integer",
    });
  });

  it("allows super admins through the dealership owner guard", () => {
    const req = createRequest({
      dealershipId: 2,
      params: { dealershipId: "2" },
      user: {
        id: 1,
        email: "super@lotview.test",
        role: "super_admin",
        name: "Super Admin",
        dealershipId: null,
      },
    } as Partial<Request>);
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    dealershipOwnerOrMaster(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
