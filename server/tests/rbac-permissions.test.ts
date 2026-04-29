import { jest } from "@jest/globals";
import type { NextFunction, Response } from "express";
import { requirePermission, type AuthRequest } from "../auth";
import {
  getDefaultRouteForRole,
  getPermissionsForRole,
  hasCapability,
  hasPermission,
  hasRole,
  normalizeRole,
  requiresAudit,
} from "../../shared/authz";

function createRequest(role?: string): AuthRequest {
  return {
    user: role
      ? {
          id: 1,
          email: `${role}@lotview.test`,
          role,
          name: role,
          dealershipId: 10,
        }
      : undefined,
  } as AuthRequest;
}

function createResponse(): Response & { status: jest.Mock; json: jest.Mock } {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  return response as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

describe("RBAC permission matrix", () => {
  it("normalizes legacy role aliases without widening unknown roles", () => {
    expect(normalizeRole("admin")).toBe("master");
    expect(normalizeRole("general_manager")).toBe("master");
    expect(normalizeRole("gm")).toBe("master");
    expect(normalizeRole("sales_manager")).toBe("sales_manager");
    expect(normalizeRole("unknown_role")).toBeNull();
  });

  it("preserves legacy hierarchy checks while supporting SaaS roles", () => {
    expect(hasRole("dealer_owner", "master")).toBe(true);
    expect(hasRole("sales_manager", "manager")).toBe(true);
    expect(hasRole("sales_rep", "manager")).toBe(false);
    expect(hasRole("read_only", "salesperson")).toBe(false);
    expect(hasRole("super_admin", "master")).toBe(true);
  });

  it("denies billing and admin impersonation to non-privileged roles", () => {
    expect(hasPermission("sales_rep", "billing.read")).toBe(false);
    expect(hasPermission("sales_rep", "billing.write")).toBe(false);
    expect(hasPermission("read_only", "inventory.read")).toBe(true);
    expect(hasPermission("read_only", "inventory.write")).toBe(false);
    expect(hasPermission("dealer_manager", "admin.impersonate")).toBe(false);
  });

  it("grants super admins explicit administrative permissions", () => {
    expect(hasPermission("super_admin", "admin.impersonate")).toBe(true);
    expect(hasPermission("super_admin", "billing.write")).toBe(true);
    expect(getPermissionsForRole("super_admin")).toEqual(
      expect.arrayContaining(["admin.audit", "admin.impersonate", "billing.write", "users.manage"])
    );
  });

  it("keeps legacy capabilities available for existing route checks", () => {
    expect(hasCapability("master", "tenant.manage")).toBe(true);
    expect(hasCapability("manager", "appointments.manage_all")).toBe(true);
    expect(hasCapability("sales_rep", "sales.work")).toBe(true);
    expect(hasCapability("read_only", "sales.work")).toBe(false);
  });

  it("marks sensitive permission classes as requiring audit coverage", () => {
    expect(requiresAudit("admin.impersonate")).toBe(true);
    expect(requiresAudit("users.manage")).toBe(true);
    expect(requiresAudit("integrations.write")).toBe(true);
    expect(requiresAudit("inventory.read")).toBe(false);
  });

  it("routes known roles to least-surprising default surfaces", () => {
    expect(getDefaultRouteForRole("super_admin")).toBe("/super-admin");
    expect(getDefaultRouteForRole("dealer_owner")).toBe("/dashboard");
    expect(getDefaultRouteForRole("sales_rep")).toBe("/sales");
    expect(getDefaultRouteForRole("read_only")).toBe("/inventory");
    expect(getDefaultRouteForRole("unknown")).toBe("/");
  });
});

describe("requirePermission", () => {
  it("requires an authenticated user", () => {
    const req = createRequest();
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    requirePermission("inventory.read")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Not authenticated" });
  });

  it("blocks roles that do not have the requested permission", () => {
    const req = createRequest("read_only");
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    requirePermission("inventory.write")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Insufficient permissions" });
  });

  it("allows roles that have the requested permission", () => {
    const req = createRequest("super_admin");
    const res = createResponse();
    const next = jest.fn() as NextFunction;

    requirePermission("admin.impersonate")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
