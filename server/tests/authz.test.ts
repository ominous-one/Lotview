import { getDefaultRouteForRole, hasCapability, hasRole, normalizeRole } from '@shared/authz';

describe('shared authz role normalization', () => {
  test('normalizes GM and sales manager aliases to canonical roles', () => {
    expect(normalizeRole('general_manager')).toBe('master');
    expect(normalizeRole('gm')).toBe('master');
    expect(normalizeRole('sales_manager')).toBe('manager');
  });

  test('treats sales_manager as manager for role checks', () => {
    expect(hasRole('sales_manager', 'manager')).toBe(true);
    expect(hasRole('manager', 'sales_manager')).toBe(true);
    expect(hasRole('gm', 'master')).toBe(true);
  });

  test('allows higher-trust operator roles onto lower-trust workflow surfaces without expanding salesperson access', () => {
    expect(hasRole('master', 'manager')).toBe(true);
    expect(hasRole('super_admin', 'manager')).toBe(true);
    expect(hasRole('manager', 'salesperson')).toBe(true);
    expect(hasRole('salesperson', 'manager')).toBe(false);
    expect(hasRole('salesperson', 'master')).toBe(false);
  });

  test('keeps GM/sales manager/salesperson capability boundaries intact', () => {
    expect(hasCapability('master', 'appointments.manage_all')).toBe(true);
    expect(hasCapability('sales_manager', 'appointments.manage_all')).toBe(true);
    expect(hasCapability('sales_manager', 'notifications.manage')).toBe(true);
    expect(hasCapability('salesperson', 'appointments.manage_all')).toBe(false);
    expect(hasCapability('salesperson', 'autopost.manage')).toBe(false);
  });

  test('routes normalized sales manager to manager dashboard', () => {
    expect(getDefaultRouteForRole('sales_manager')).toBe('/manager');
  });
});
