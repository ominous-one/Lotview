/**
 * Tenant Utilities for Multi-Tenant Support
 * 
 * IMPORTANT: This module provides utilities for dealership ID resolution.
 * 
 * Current mode: STRICT_MULTI_TENANT_MODE
 * - Dealership resolution must fail closed when no dealership context exists
 * - `resolveDealershipIdStrict()` returns null if no dealership context exists
 * - Routes protected by `requireDealership` middleware are already safe
 * 
 * For routes/features: use `resolveDealershipIdStrict()` or `requireDealership` middleware
 * to ensure proper tenant isolation.
 */

export interface TenantContext {
  user?: {
    id?: number;
    dealershipId?: number | null;
  };
  dealershipId?: number;
}

/**
 * Resolves dealership ID without any default fallback.
 * 
 * Returns null when dealership context is missing.
 * Keep callsites explicit so tenant ambiguity fails closed.
 */
export function resolveDealershipId(req: TenantContext): number | null {
  if (req.dealershipId && typeof req.dealershipId === 'number') {
    return req.dealershipId;
  }
  
  if (req.user?.dealershipId && typeof req.user.dealershipId === 'number') {
    return req.user.dealershipId;
  }
  
  return null;
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

export function parsePositiveIntegerId(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function getDealershipIdFromParams(
  params: { dealershipId?: number | string | null }
): number | null {
  if (params.dealershipId !== undefined && params.dealershipId !== null) {
    const id = typeof params.dealershipId === 'string' 
      ? parseInt(params.dealershipId, 10) 
      : params.dealershipId;
    
    if (!isNaN(id) && id > 0) {
      return id;
    }
  }
  
  return null;
}

export function isValidDealershipId(id: unknown): id is number {
  return typeof id === 'number' && !isNaN(id) && id > 0;
}

export const SINGLE_DEALERSHIP_MODE = false;
