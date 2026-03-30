import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOnboardingInput } from './onboarding-validation.ts';
import { getDefaultRouteForRole, hasCapability, hasRole, normalizeRole } from '../shared/authz.ts';

test('onboarding validation rejects duplicate staff emails and master collisions', () => {
  const result = validateOnboardingInput({
    dealership: { name: 'Test Dealer', slug: 'test-dealer', subdomain: 'testdealer' },
    masterAdmin: { email: 'gm@test.com', name: 'GM', password: 'long-enough-password' },
    additionalStaff: [
      { email: 'GM@test.com', name: 'Dup GM', role: 'manager' },
      { email: 'sales@test.com', name: 'Sales One', role: 'salesperson' },
      { email: 'sales@test.com', name: 'Sales Two', role: 'salesperson' },
    ],
  });

  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.includes('duplicates the master admin email')));
  assert(result.errors.some((error) => error.includes('Duplicate staff email')));
});

test('onboarding validation enforces stronger master password minimum', () => {
  const result = validateOnboardingInput({
    dealership: { name: 'Test Dealer', slug: 'test-dealer', subdomain: 'testdealer' },
    masterAdmin: { email: 'gm@test.com', name: 'GM', password: 'shortpwd' },
    additionalStaff: [],
  });

  assert.equal(result.valid, false);
  assert(result.errors.includes('Password must be at least 12 characters'));
});

test('role aliases preserve GM and sales-manager boundaries', () => {
  assert.equal(normalizeRole('gm'), 'master');
  assert.equal(normalizeRole('sales_manager'), 'manager');
  assert.equal(hasRole('gm', 'master'), true);
  assert.equal(hasCapability('sales_manager', 'autopost.manage'), true);
  assert.equal(hasCapability('salesperson', 'autopost.manage'), false);
  assert.equal(hasCapability('salesperson', 'tenant.manage'), false);
  assert.equal(getDefaultRouteForRole('salesperson'), '/sales');
});


test('higher-trust roles inherit lower-trust route access while salesperson remains bounded', () => {
  assert.equal(hasRole('master', 'manager'), true);
  assert.equal(hasRole('super_admin', 'manager'), true);
  assert.equal(hasRole('manager', 'salesperson'), true);
  assert.equal(hasRole('salesperson', 'manager'), false);
  assert.equal(hasRole('salesperson', 'master'), false);
});
