export const ROLE_ALIASES = {
  admin: "master",
  general_manager: "master",
  gm: "master",
  sales_manager: "manager",
} as const;

export type CanonicalRole = "super_admin" | "master" | "manager" | "salesperson";
export type SupportedRole = CanonicalRole | keyof typeof ROLE_ALIASES;
export type Capability =
  | "tenant.manage"
  | "tenant.settings.write"
  | "users.manage"
  | "conversations.manage"
  | "conversations.view_all"
  | "appointments.manage_all"
  | "notifications.manage"
  | "autopost.manage"
  | "sales.work"
  | "super_admin";

const ROLE_CAPABILITIES: Record<CanonicalRole, readonly Capability[]> = {
  super_admin: [
    "super_admin",
    "tenant.manage",
    "tenant.settings.write",
    "users.manage",
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
    "users.manage",
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
  salesperson: ["sales.work"],
};

export function normalizeRole(role: string | null | undefined): CanonicalRole | null {
  if (!role) return null;
  if (role in ROLE_ALIASES) {
    return ROLE_ALIASES[role as keyof typeof ROLE_ALIASES];
  }
  if (role in ROLE_CAPABILITIES) {
    return role as CanonicalRole;
  }
  return null;
}

export function isKnownRole(role: string | null | undefined): role is SupportedRole {
  return normalizeRole(role) !== null;
}

export function hasRole(role: string | null | undefined, ...allowedRoles: SupportedRole[]): boolean {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return false;
  return allowedRoles.some((allowedRole) => normalizeRole(allowedRole) === normalizedRole);
}

export function hasCapability(role: string | null | undefined, capability: Capability): boolean {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return false;
  return ROLE_CAPABILITIES[normalizedRole].includes(capability);
}

export function getDefaultRouteForRole(role: string | null | undefined): string {
  const normalizedRole = normalizeRole(role);
  switch (normalizedRole) {
    case "super_admin":
      return "/super-admin";
    case "master":
      return "/dashboard";
    case "manager":
      return "/manager";
    case "salesperson":
      return "/sales";
    default:
      return "/";
  }
}
