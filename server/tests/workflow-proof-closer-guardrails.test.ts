jest.mock('../e2e-test-mode', () => ({
  isSafeE2ERequest: jest.fn(() => false),
  seedE2E: jest.fn(),
}));

jest.mock('../e2e-test-mode', () => ({
  isSafeE2ERequest: jest.fn(() => false),
  seedE2E: jest.fn(),
}));

import jwt from 'jsonwebtoken';
import { getDefaultRouteForRole, hasCapability, hasRole, normalizeRole } from '@shared/authz';
import { tenantMiddleware } from '../tenant-middleware';
import { validateOnboardingInput } from '../onboarding-validation';

const JWT_SECRET = 'olympic-auto-jwt-dev-secret-DO-NOT-USE-IN-PRODUCTION';

describe('workflow trust guardrails', () => {
  describe('role and capability boundaries', () => {
    test('canonicalizes supported role aliases into the intended guardrail roles', () => {
      expect(normalizeRole('admin')).toBe('master');
      expect(normalizeRole('general_manager')).toBe('master');
      expect(normalizeRole('gm')).toBe('master');
      expect(normalizeRole('sales_manager')).toBe('manager');
      expect(normalizeRole(' salesperson ')).toBe('salesperson');
      expect(normalizeRole('unknown')).toBeNull();
    });

    test('salesperson cannot inherit operator or tenant-management capabilities', () => {
      expect(hasCapability('salesperson', 'sales.work')).toBe(true);
      expect(hasCapability('salesperson', 'autopost.manage')).toBe(false);
      expect(hasCapability('salesperson', 'users.manage')).toBe(false);
      expect(hasCapability('salesperson', 'tenant.manage')).toBe(false);
      expect(hasCapability('salesperson', 'super_admin')).toBe(false);
    });

    test('manager can run operator workflows without inheriting tenant admin powers', () => {
      expect(hasCapability('manager', 'autopost.manage')).toBe(true);
      expect(hasCapability('manager', 'notifications.manage')).toBe(true);
      expect(hasCapability('manager', 'conversations.view_all')).toBe(true);
      expect(hasCapability('manager', 'users.manage')).toBe(false);
      expect(hasCapability('manager', 'tenant.manage')).toBe(false);
      expect(hasCapability('manager', 'super_admin')).toBe(false);
    });

    test('master and super-admin preserve strict hierarchy boundaries', () => {
      expect(hasRole('master', 'manager')).toBe(true);
      expect(hasRole('manager', 'master')).toBe(false);
      expect(hasRole('super_admin', 'master')).toBe(true);
      expect(hasRole('salesperson', 'manager')).toBe(false);
      expect(getDefaultRouteForRole('super_admin')).toBe('/super-admin');
      expect(getDefaultRouteForRole('master')).toBe('/dashboard');
      expect(getDefaultRouteForRole('manager')).toBe('/manager');
      expect(getDefaultRouteForRole('salesperson')).toBe('/sales');
    });
  });

  describe('onboarding validation guardrails', () => {
    test('rejects unsafe onboarding payloads that would blur role or identity boundaries', () => {
      const result = validateOnboardingInput({
        dealership: {
          name: 'Trust Motors',
          slug: 'Trust Motors',
          subdomain: 'Trust_Motors',
        },
        masterAdmin: {
          email: 'GM@trust.example',
          name: 'GM',
          password: 'short-pass',
        },
        additionalStaff: [
          { email: 'gm@trust.example', name: 'Duplicate GM', role: 'manager' },
          { email: 'sales@trust.example', name: 'Sales One', role: 'salesperson' },
          { email: 'sales@trust.example', name: 'Sales Two', role: 'salesperson' },
          { email: 'bad-email', name: 'Broken Email', role: 'manager' },
          { email: 'ops@trust.example', name: 'Escalated Ops', role: 'master' as any },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        'Password must be at least 12 characters',
        'Slug must be lowercase letters, numbers, and hyphens only',
        'Subdomain must be lowercase letters, numbers, and hyphens only',
        'Staff member Duplicate GM duplicates the master admin email',
        'Duplicate staff email: sales@trust.example',
        'Invalid email format for staff member: Broken Email',
        'Invalid role for staff member: Escalated Ops',
      ]));
    });
  });

  describe('tenant workflow safety', () => {
    function makeRes() {
      return {
        statusCode: 200,
        body: undefined as any,
        redirectCode: undefined as number | undefined,
        redirectUrl: undefined as string | undefined,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: any) {
          this.body = payload;
          return this;
        },
        redirect(code: number, url: string) {
          this.redirectCode = code;
          this.redirectUrl = url;
          return this;
        },
      };
    }

    test('legacy tenantless salesperson token is rejected instead of falling through', async () => {
      const storage = {
        getDealership: jest.fn(),
      };
      const middleware = tenantMiddleware(storage);
      const req: any = {
        method: 'GET',
        headers: {
          authorization: `Bearer ${jwt.sign({
            id: 77,
            email: 'sales@test.com',
            role: 'salesperson',
            name: 'Sales Only',
          }, JWT_SECRET)}`,
        },
        hostname: 'app.lotview.ai',
      };
      const res = makeRes();
      const next = jest.fn();

      await middleware(req, res as any, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual(expect.objectContaining({ code: 'LEGACY_TOKEN_REJECTED' }));
    });

    test('manager cannot spoof dealership context with X-Dealership-Id header', async () => {
      const storage = {
        getDealership: jest.fn(),
        getTenantDomainByHostname: jest.fn().mockResolvedValue(undefined),
        getDealershipByHostname: jest.fn().mockResolvedValue(undefined),
        getDealershipBySubdomain: jest.fn().mockResolvedValue(undefined),
      };
      const middleware = tenantMiddleware(storage);
      const req: any = {
        method: 'GET',
        headers: {
          authorization: `Bearer ${jwt.sign({
            id: 10,
            email: 'manager@test.com',
            role: 'manager',
            name: 'Manager',
            dealershipId: 12,
          }, JWT_SECRET)}`,
          'x-dealership-id': '99',
        },
        hostname: 'app.lotview.ai',
      };
      const res = makeRes();
      const next = jest.fn();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(req.dealershipId).toBe(12);
      expect(req.tenantSource).toBe('jwt');
    });

    test('super-admin may explicitly switch tenant context through authenticated header selection', async () => {
      const storage = {
        getDealership: jest.fn().mockResolvedValue({ id: 42, name: 'Dealer 42', slug: 'dealer-42' }),
        getTenantDomainByHostname: jest.fn().mockResolvedValue(undefined),
        getDealershipByHostname: jest.fn().mockResolvedValue(undefined),
        getDealershipBySubdomain: jest.fn().mockResolvedValue(undefined),
      };
      const middleware = tenantMiddleware(storage);
      const req: any = {
        method: 'GET',
        headers: {
          authorization: `Bearer ${jwt.sign({
            id: 1,
            email: 'root@test.com',
            role: 'super_admin',
            name: 'Root',
          }, JWT_SECRET)}`,
          'x-dealership-id': '42',
        },
        hostname: 'localhost:5000',
      };
      const res = makeRes();
      const next = jest.fn();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(req.dealershipId).toBe(42);
      expect(req.tenantSource).toBe('header');
      expect(storage.getDealership).toHaveBeenCalledWith(42);
    });

    test('preview and localhost hosts do not silently fall back to dealership 1', async () => {
      const storage = {
        getDealership: jest.fn(),
        getTenantDomainByHostname: jest.fn().mockResolvedValue(undefined),
        getDealershipByHostname: jest.fn().mockResolvedValue(undefined),
        getDealershipBySubdomain: jest.fn().mockResolvedValue(undefined),
      };
      const middleware = tenantMiddleware(storage);
      const req: any = {
        method: 'GET',
        headers: {},
        hostname: 'localhost:5000',
      };
      const res = makeRes();
      const next = jest.fn();

      await middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(req.dealershipId).toBeUndefined();
      expect(req.tenantSource).toBeUndefined();
      expect(storage.getDealership).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });
  });
});
