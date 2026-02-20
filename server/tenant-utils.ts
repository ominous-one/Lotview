/**
 * Tenant Utilities for Multi-Tenant Support
 * 
 * IMPORTANT: This module provides utilities for dealership ID resolution.
 * 
 * Current mode: SINGLE_DEALERSHIP_MODE
 * - In single-dealership mode, some functions fall back to dealershipId=1 for backward compatibility
 * - For multi-tenant isolation, always use `resolveDealershipIdStrict()` which returns null if no dealership context
 * - Routes protected by `requireDealership` middleware are already safe
 * 
 * For new routes/features: ALWAYS use `resolveDealershipIdStrict()` or `requireDealership` middleware
 * to ensure proper tenant isolation.
 */

export interface TenantContext {
  user?: {
    id?: number;
    dealershipId?: number | null;
  };
  dealershipId?: number;
}

const DEFAULT_DEALERSHIP_ID = 1;

/**
 * Resolves dealership ID with fallback to default (dealershipId=1).
 * 
 * WARNING: Only use this for backward-compatible endpoints that need to support
 * single-dealership mode. For new features, use `resolveDealershipIdStrict()`.
 */
export function resolveDealershipId(req: TenantContext): number {
  if (req.dealershipId && typeof req.dealershipId === 'number') {
    return req.dealershipId;
  }
  
  if (req.user?.dealershipId && typeof req.user.dealershipId === 'number') {
    return req.user.dealershipId;
  }
  
  return DEFAULT_DEALERSHIP_ID;
}

/**
 * Resolves dealership ID WITHOUT fallback - returns null if no dealership context.
 * 
 * RECOMMENDED: Use this for all new features to ensure proper multi-tenant isolation.
 * Returns null when no dealership can be determined, allowing the caller to handle appropriately.
 */
export function resolveDealershipIdStrict(req: TenantContext): number | null {
  if (req.dealershipId && typeof req.dealershipId === 'number') {
    return req.dealershipId;
  }
  
  if (req.user?.dealershipId && typeof req.user.dealershipId === 'number') {
    return req.user.dealershipId;
  }
  
  return null;
}

export function getDealershipIdFromParams(
  params: { dealershipId?: number | string | null },
  fallbackToDefault: boolean = true
): number | null {
  if (params.dealershipId !== undefined && params.dealershipId !== null) {
    const id = typeof params.dealershipId === 'string' 
      ? parseInt(params.dealershipId, 10) 
      : params.dealershipId;
    
    if (!isNaN(id) && id > 0) {
      return id;
    }
  }
  
  return fallbackToDefault ? DEFAULT_DEALERSHIP_ID : null;
}

export function isValidDealershipId(id: unknown): id is number {
  return typeof id === 'number' && !isNaN(id) && id > 0;
}

export const SINGLE_DEALERSHIP_MODE = true;
