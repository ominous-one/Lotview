import { validateOnboardingInput } from '../onboarding-validation';
import { getDefaultRouteForRole, hasCapability, hasRole, normalizeRole } from '../../shared/authz';

describe('onboarding-validation', () => {
  test('rejects duplicate staff emails and master collisions', () => {
    const result = validateOnboardingInput({
      dealership: { name: 'Test Dealer', slug: 'test-dealer', subdomain: 'testdealer' },
      masterAdmin: { email: 'gm@test.com', name: 'GM', password: 'long-enough-password' },
      additionalStaff: [
        { email: 'GM@test.com', name: 'Dup GM', role: 'manager' },
        { email: 'sales@test.com', name: 'Sales One', role: 'salesperson' },
        { email: 'sales@test.com', name: 'Sales Two', role: 'salesperson' },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('duplicates the master admin email'))).toBe(true);
    expect(result.errors.some((error) => error.includes('Duplicate staff email'))).toBe(true);
  });

  test('enforces stronger master password minimum', () => {
    const result = validateOnboardingInput({
      dealership: { name: 'Test Dealer', slug: 'test-dealer', subdomain: 'testdealer' },
      masterAdmin: { email: 'gm@test.com', name: 'GM', password: 'shortpwd' },
      additionalStaff: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be at least 12 characters');
  });

  test('role aliases preserve GM and sales-manager boundaries', () => {
    expect(normalizeRole('gm')).toBe('master');
    expect(normalizeRole('sales_manager')).toBe('manager');
    expect(hasRole('gm', 'master')).toBe(true);
    expect(hasCapability('sales_manager', 'autopost.manage')).toBe(true);
    expect(hasCapability('salesperson', 'autopost.manage')).toBe(false);
    expect(hasCapability('salesperson', 'tenant.manage')).toBe(false);
    expect(getDefaultRouteForRole('salesperson')).toBe('/sales');
  });

  test('higher-trust roles inherit lower-trust route access while salesperson remains bounded', () => {
    expect(hasRole('master', 'manager')).toBe(true);
    expect(hasRole('super_admin', 'manager')).toBe(true);
    expect(hasRole('manager', 'salesperson')).toBe(true);
    expect(hasRole('salesperson', 'manager')).toBe(false);
    expect(hasRole('salesperson', 'master')).toBe(false);
  });
});
