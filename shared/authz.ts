export const ROLE_ALIASES = {
  admin: "master",
  general_manager: "master",
  gm: "master",
  sales_manager: "sales_manager",
  sales_rep: "sales_rep",
  salesperson: "salesperson",
} as const;

export type LegacyRole = "master" | "manager" | "salesperson";
export type SaaSRole =
  | "super_admin"
  | "dealer_owner"
  | "dealer_manager"
  | "sales_manager"
  | "sales_rep"
  | "bdc_agent"
  | "service_manager"
  | "read_only";
export type CanonicalRole = SaaSRole | LegacyRole;
export type SupportedRole = CanonicalRole | keyof typeof ROLE_ALIASES;

export type Permission =
  | "inventory.read"
  | "inventory.write"
  | "leads.read"
  | "leads.write"
  | "messages.read"
  | "messages.write"
  | "ai.use"
  | "ai.configure"
  | "integrations.read"
  | "integrations.write"
  | "billing.read"
  | "billing.write"
  | "users.invite"
  | "users.manage"
  | "admin.audit"
  | "admin.impersonate";

export type LegacyCapability =
  | "tenant.manage"
  | "tenant.settings.write"
  | "conversations.manage"
  | "conversations.view_all"
  | "appointments.manage_all"
  | "notifications.manage"
  | "autopost.manage"
  | "sales.work"
  | "super_admin";

export type Capability = Permission | LegacyCapability;

const ALL_PERMISSIONS: readonly Permission[] = [
  "inventory.read",
  "inventory.write",
  "leads.read",
  "leads.write",
  "messages.read",
  "messages.write",
  "ai.use",
  "ai.configure",
  "integrations.read",
  "integrations.write",
  "billing.read",
  "billing.write",
  "users.invite",
  "users.manage",
  "admin.audit",
  "admin.impersonate",
] as const;

const ROLE_PERMISSIONS: Record<CanonicalRole, readonly Permission[]> = {
  super_admin: ALL_PERMISSIONS,
  dealer_owner: [
    "inventory.read",
    "inventory.write",
    "leads.read",
    "leads.write",
    "messages.read",
    "messages.write",
    "ai.use",
    "ai.configure",
    "integrations.read",
    "integrations.write",
    "billing.read",
    "billing.write",
    "users.invite",
    "users.manage",
    "admin.audit",
  ],
  master: [
    "inventory.read",
    "inventory.write",
    "leads.read",
    "leads.write",
    "messages.read",
    "messages.write",
    "ai.use",
    "ai.configure",
    "integrations.read",
    "integrations.write",
    "billing.read",
    "billing.write",
    "users.invite",
    "users.manage",
    "admin.audit",
  ],
  dealer_manager: [
    "inventory.read",
    "inventory.write",
    "leads.read",
    "leads.write",
    "messages.read",
    "messages.write",
    "ai.use",
    "ai.configure",
    "integrations.read",
    "users.invite",
    "billing.read",
  ],
  manager: [
    "inventory.read",
    "inventory.write",
    "leads.read",
    "leads.write",
    "messages.read",
    "messages.write",
    "ai.use",
    "ai.configure",
    "integrations.read",
    "users.invite",
    "billing.read",
  ],
  sales_manager: [
    "inventory.read",
    "inventory.write",
    "leads.read",
    "leads.write",
    "messages.read",
    "messages.write",
    "ai.use",
    "integrations.read",
  ],
  sales_rep: [
    "inventory.read",
    "leads.read",
    "leads.write",
    "messages.read",
    "messages.write",
    "ai.use",
  ],
  salesperson: [
    "inventory.read",
    "leads.read",
    "leads.write",
    "messages.read",
    "messages.write",
    "ai.use",
  ],
  bdc_agent: ["inventory.read", "leads.read", "leads.write", "messages.read", "messages.write", "ai.use"],
  service_manager: ["inventory.read", "leads.read", "messages.read"],
  read_only: ["inventory.read", "leads.read", "messages.read", "integrations.read", "billing.read"],
};

const LEGACY_CAPABILITIES: Record<CanonicalRole, readonly LegacyCapability[]> = {
  super_admin: [
    "super_admin",
    "tenant.manage",
    "tenant.settings.write",
    "conversations.manage",
    "conversations.view_all",
    "appointments.manage_all",
    "notifications.manage",
    "autopost.manage",
    "sales.work",
  ],
  dealer_owner: [
    "tenant.manage",
    "tenant.settings.write",
    "conversations.manage",
    "conversations.view_all",
    "appointments.manage_all",
    "notifications.manage",
    "autopost.manage",
    "sales.work",
  ],
  master: [
    "tenant.manage",
    "tenant.settings.write",
    "conversations.manage",
    "conversations.view_all",
    "appointments.manage_all",
    "notifications.manage",
    "autopost.manage",
    "sales.work",
  ],
  dealer_manager: [
    "conversations.manage",
    "conversations.view_all",
    "appointments.manage_all",
    "notifications.manage",
    "autopost.manage",
    "sales.work",
  ],
  manager: [
    "conversations.manage",
    "conversations.view_all",
    "appointments.manage_all",
    "notifications.manage",
    "autopost.manage",
    "sales.work",
  ],
  sales_manager: [
    "conversations.manage",
    "conversations.view_all",
    "appointments.manage_all",
    "notifications.manage",
    "autopost.manage",
    "sales.work",
  ],
  sales_rep: ["sales.work"],
  salesperson: ["sales.work"],
  bdc_agent: ["sales.work"],
  service_manager: [],
  read_only: [],
};

const ROLE_LEVELS: Record<CanonicalRole, number> = {
  read_only: 0,
  salesperson: 1,
  sales_rep: 1,
  bdc_agent: 1,
  service_manager: 1,
  manager: 2,
  dealer_manager: 2,
  sales_manager: 2,
  master: 3,
  dealer_owner: 3,
  super_admin: 4,
};

const AUDITED_PERMISSIONS: ReadonlySet<Permission> = new Set([
  "admin.impersonate",
  "billing.write",
  "users.manage",
  "integrations.write",
  "ai.configure",
]);

function isPermission(capability: Capability): capability is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(capability);
}

export function normalizeRole(role: string | null | undefined): CanonicalRole | null {
  if (!role) return null;
  const normalizedInput = role.trim().toLowerCase();
  if (!normalizedInput) return null;
  if (Object.prototype.hasOwnProperty.call(ROLE_ALIASES, normalizedInput)) {
    return ROLE_ALIASES[normalizedInput as keyof typeof ROLE_ALIASES];
  }
  if (Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, normalizedInput)) {
    return normalizedInput as CanonicalRole;
  }
  return null;
}

export function isKnownRole(role: string | null | undefined): role is SupportedRole {
  return normalizeRole(role) !== null;
}

export function hasRole(role: string | null | undefined, ...allowedRoles: SupportedRole[]): boolean {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return false;

  const userLevel = ROLE_LEVELS[normalizedRole];
  const allowedLevels = allowedRoles
    .map((allowedRole) => normalizeRole(allowedRole))
    .filter((allowedRole): allowedRole is CanonicalRole => allowedRole !== null)
    .map((allowedRole) => ROLE_LEVELS[allowedRole]);

  return allowedLevels.some((allowedLevel) => userLevel >= allowedLevel);
}

export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return false;
  return ROLE_PERMISSIONS[normalizedRole].includes(permission);
}

export function hasCapability(role: string | null | undefined, capability: Capability): boolean {
  if (isPermission(capability)) {
    return hasPermission(role, capability);
  }

  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return false;
  return LEGACY_CAPABILITIES[normalizedRole].includes(capability);
}

export function getPermissionsForRole(role: string | null | undefined): Permission[] {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return [];
  return [...ROLE_PERMISSIONS[normalizedRole]];
}

export function requiresAudit(permission: Permission): boolean {
  return AUDITED_PERMISSIONS.has(permission);
}

export function getDefaultRouteForRole(role: string | null | undefined): string {
  const normalizedRole = normalizeRole(role);
  switch (normalizedRole) {
    case "super_admin":
      return "/super-admin";
    case "dealer_owner":
    case "master":
      return "/dashboard";
    case "dealer_manager":
    case "sales_manager":
    case "manager":
      return "/manager";
    case "sales_rep":
    case "bdc_agent":
    case "salesperson":
      return "/sales";
    case "service_manager":
      return "/service";
    case "read_only":
      return "/inventory";
    default:
      return "/";
  }
}
