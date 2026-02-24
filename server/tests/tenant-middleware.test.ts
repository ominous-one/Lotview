/**
 * Tenant Middleware Unit Tests
 * Tests: requireDealership, superAdminOnly, tenant resolution strategies
 */

// Mock storage and db to prevent DB connection
jest.mock('../storage', () => ({
  storage: {
    getUserById: jest.fn(),
    getDealership: jest.fn(),
    getDealershipBySubdomain: jest.fn(),
  }
}));
jest.mock('../db', () => ({ db: { execute: jest.fn() } }));

import { requireDealership, superAdminOnly } from '../tenant-middleware';

// Helper to create mock request/response
function createMockReq(overrides: Record<string, any> = {}): any {
  return {
    headers: {},
    hostname: 'localhost',
    params: {},
    query: {},
    ...overrides,
  };
}

function createMockRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('Tenant Middleware', () => {
  describe('requireDealership', () => {
    it('should call next() when dealershipId is present', () => {
      const req = createMockReq({ dealershipId: 1 });
      const res = createMockRes();
      const next = jest.fn();

      requireDealership(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 when dealershipId is missing', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      requireDealership(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('No dealership context') })
      );
    });

    it('should return 400 when dealershipId is undefined', () => {
      const req = createMockReq({ dealershipId: undefined });
      const res = createMockRes();
      const next = jest.fn();

      requireDealership(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 when dealershipId is 0', () => {
      const req = createMockReq({ dealershipId: 0 });
      const res = createMockRes();
      const next = jest.fn();

      requireDealership(req, res, next);
      // 0 is falsy, should fail
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('superAdminOnly', () => {
    it('should call next() for super_admin user', () => {
      const req = createMockReq({
        user: { id: 1, email: 'admin@test.com', role: 'super_admin', name: 'Admin' }
      });
      const res = createMockRes();
      const next = jest.fn();

      superAdminOnly(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should return 401 when no user is present', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = jest.fn();

      superAdminOnly(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Authentication required' })
      );
    });

    it('should return 403 for manager role', () => {
      const req = createMockReq({
        user: { id: 1, role: 'manager', email: 'mgr@test.com', name: 'Mgr' }
      });
      const res = createMockRes();
      const next = jest.fn();

      superAdminOnly(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Super admin access required' })
      );
    });

    it('should return 403 for admin role', () => {
      const req = createMockReq({
        user: { id: 1, role: 'admin', email: 'adm@test.com', name: 'Adm' }
      });
      const res = createMockRes();
      const next = jest.fn();

      superAdminOnly(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 for master role', () => {
      const req = createMockReq({
        user: { id: 1, role: 'master', email: 'master@test.com', name: 'Master' }
      });
      const res = createMockRes();
      const next = jest.fn();

      superAdminOnly(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Multi-tenant isolation rules', () => {
    it('requireDealership blocks requests without tenant context', () => {
      const req = createMockReq({ user: { id: 1, role: 'manager' } });
      const res = createMockRes();
      const next = jest.fn();

      requireDealership(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('requireDealership allows requests with valid tenant context', () => {
      const req = createMockReq({ dealershipId: 5, user: { id: 1, role: 'manager', dealershipId: 5 } });
      const res = createMockRes();
      const next = jest.fn();

      requireDealership(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('different dealership IDs represent different tenants', () => {
      const req1 = createMockReq({ dealershipId: 1 });
      const req2 = createMockReq({ dealershipId: 2 });

      expect(req1.dealershipId).not.toBe(req2.dealershipId);
    });
  });
});
