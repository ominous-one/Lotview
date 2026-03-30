export interface OnboardingValidationInput {
  dealership?: {
    name?: string;
    slug?: string;
    subdomain?: string;
  };
  masterAdmin?: {
    email?: string;
    name?: string;
    password?: string;
  };
  additionalStaff?: Array<{
    email: string;
    name: string;
    role: 'manager' | 'salesperson';
  }>;
}

export function validateOnboardingInput(input: Partial<OnboardingValidationInput>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.dealership?.name) errors.push('Dealership name is required');
  if (!input.dealership?.slug) errors.push('Dealership slug is required');
  if (!input.dealership?.subdomain) errors.push('Dealership subdomain is required');
  if (!input.masterAdmin?.email) errors.push('Master admin email is required');
  if (!input.masterAdmin?.name) errors.push('Master admin name is required');
  if (!input.masterAdmin?.password) errors.push('Master admin password is required');
  if (input.masterAdmin?.password && input.masterAdmin.password.length < 12) {
    errors.push('Password must be at least 12 characters');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const normalizedMasterEmail = input.masterAdmin?.email?.trim().toLowerCase();
  if (normalizedMasterEmail && !emailRegex.test(normalizedMasterEmail)) {
    errors.push('Invalid master admin email format');
  }

  const slugRegex = /^[a-z0-9-]+$/;
  if (input.dealership?.slug && !slugRegex.test(input.dealership.slug)) {
    errors.push('Slug must be lowercase letters, numbers, and hyphens only');
  }

  if (input.dealership?.subdomain && !slugRegex.test(input.dealership.subdomain)) {
    errors.push('Subdomain must be lowercase letters, numbers, and hyphens only');
  }

  const seenStaffEmails = new Set<string>();
  const allowedStaffRoles = new Set<NonNullable<OnboardingValidationInput['additionalStaff']>[number]['role']>(['manager', 'salesperson']);

  if (input.additionalStaff) {
    for (const staff of input.additionalStaff) {
      const normalizedStaffEmail = staff.email?.trim().toLowerCase();
      if (!normalizedStaffEmail || !emailRegex.test(normalizedStaffEmail)) {
        errors.push(`Invalid email format for staff member: ${staff.name}`);
      }

      if (!allowedStaffRoles.has(staff.role)) {
        errors.push(`Invalid role for staff member: ${staff.name}`);
      }

      if (normalizedStaffEmail) {
        if (normalizedStaffEmail === normalizedMasterEmail) {
          errors.push(`Staff member ${staff.name} duplicates the master admin email`);
        }

        if (seenStaffEmails.has(normalizedStaffEmail)) {
          errors.push(`Duplicate staff email: ${staff.email}`);
        }
        seenStaffEmails.add(normalizedStaffEmail);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
