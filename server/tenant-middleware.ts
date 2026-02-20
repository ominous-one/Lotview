/**
 * Multi-Tenant Middleware
 * 
 * Extracts dealership context from:
 * 1. JWT token (if present in Authorization header)
 * 2. Subdomain (e.g., olympic.yourdomain.com)
 * 3. Custom header (X-Dealership-Id) for API integrations
 * 
 * Sets req.dealershipId for use in controllers and storage methods
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// JWT_SECRET must be set in production for security
const JWT_SECRET_ENV = process.env.JWT_SECRET;
if (!JWT_SECRET_ENV && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET environment variable is required in production");
}
// Development fallback (same as auth.ts)
const JWT_SECRET = JWT_SECRET_ENV || "olympic-auto-jwt-dev-secret-DO-NOT-USE-IN-PRODUCTION";

// Tenant resolution sources for tracking and debugging
type TenantResolutionSource = 'jwt' | 'subdomain' | 'header' | 'default' | 'none';

// Extend Express Request type to include dealership context and user
declare global {
  namespace Express {
    interface Request {
      dealershipId?: number;
      tenantSource?: TenantResolutionSource;
      dealership?: {
        id: number;
        name: string;
        slug: string;
        subdomain?: string;
      };
      user?: {
        id: number;
        email: string;
        role: string;
        name: string;
        dealershipId?: number | null;
      };
    }
  }
}

/**
 * Check if hostname is a development/preview URL that should be treated as apex domain
 * Examples: 
 *   - da9535b8-529c-4a3a-8ed9-dac5a0bad0d9-00-10p9gymfpdovg.picard.replit.dev
 *   - anything.replit.dev
 *   - anything.repl.co
 *   - localhost
 */
function isDevOrPreviewHost(hostname: string): boolean {
  const host = hostname.split(':')[0].toLowerCase();
  
  // Replit dev/preview URLs
  if (host.endsWith('.replit.dev') || host.endsWith('.repl.co') || host.endsWith('.replit.app')) {
    // Check if it looks like a Replit auto-generated subdomain (UUID-like pattern)
    const parts = host.split('.');
    if (parts.length >= 3) {
      const subdomain = parts[0];
      // Replit auto-generated subdomains contain hyphens and are long UUIDs
      if (subdomain.length > 20 && subdomain.includes('-')) {
        return true;
      }
    }
    return false;
  }
  
  // Local development
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
    return true;
  }
  
  return false;
}

/**
 * Extract dealership ID from subdomain
 * Example: olympic.lotview.ai -> looks up dealership by subdomain "olympic"
 * Ignores dev/preview URLs from Replit
 */
function extractDealershipFromSubdomain(hostname: string): string | null {
  // Skip dev/preview URLs - these should be treated as apex domain
  if (isDevOrPreviewHost(hostname)) {
    return null;
  }
  
  // Remove port if present
  const host = hostname.split(':')[0];
  
  // Check if this is a subdomain format
  const parts = host.split('.');
  
  // If we have at least 3 parts (subdomain.domain.tld), extract subdomain
  if (parts.length >= 3 && parts[0] !== 'www') {
    return parts[0];
  }
  
  return null;
}

/**
 * Tenant context middleware - extracts and sets dealership ID
 */
export function tenantMiddleware(storage: any) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      let dealershipId: number | undefined;
      let source: TenantResolutionSource = 'none';
      
      // Strategy 1: Extract dealership from JWT token (if present)
      const authHeader = req.headers.authorization;
      let tokenInvalid = false;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        try {
          const decoded = jwt.verify(token, JWT_SECRET) as any;
          
          // Super admin handling: set user context but DON'T return early
          // Allow the middleware to continue to Strategy 3 (header-based selection)
          if (decoded && decoded.role === 'super_admin') {
            req.user = {
              id: decoded.id,
              email: decoded.email,
              role: decoded.role,
              name: decoded.name,
              dealershipId: null
            };
            // Don't set dealershipId yet - let Strategy 3 handle X-Dealership-Id header
            // Don't return early - continue through middleware
          }
          
          if (decoded && decoded.dealershipId) {
            dealershipId = decoded.dealershipId;
            source = 'jwt';
            
            // Set req.user for convenience (will be overwritten by authMiddleware later)
            req.user = {
              id: decoded.id,
              email: decoded.email,
              role: decoded.role,
              name: decoded.name,
              dealershipId: decoded.dealershipId
            };
          } else if (decoded && !decoded.dealershipId) {
            // Valid token but missing dealershipId (legacy token)
            // SECURITY: Reject legacy tokens without dealershipId - they must re-authenticate
            // Exception: Allow super_admin and master roles to proceed (they select dealership via header)
            if (decoded.role !== 'super_admin' && decoded.role !== 'master') {
              return res.status(401).json({ 
                error: 'Session expired. Please log in again.',
                code: 'LEGACY_TOKEN_REJECTED'
              });
            }
            // For super_admin/master, set user but leave dealershipId undefined (will use header later)
            req.user = {
              id: decoded.id,
              email: decoded.email,
              role: decoded.role,
              name: decoded.name,
              dealershipId: null
            };
          }
        } catch (error) {
          // Invalid/expired token - mark for later handling
          // authMiddleware will return proper 401 error
          tokenInvalid = true;
        }
      }
      
      // Strategy 2: Extract from subdomain (if not already set)
      if (!dealershipId) {
        const subdomain = extractDealershipFromSubdomain(req.hostname);
        
        if (subdomain) {
          try {
            // Look up dealership by subdomain
            console.log(`[Tenant] Looking up dealership by subdomain: ${subdomain}`);
            const dealership = await storage.getDealershipBySubdomain(subdomain);
            if (dealership) {
              dealershipId = dealership.id;
              source = 'subdomain';
              req.dealership = dealership;
              console.log(`[Tenant] Resolved dealership ${dealership.id} (${dealership.name}) from subdomain ${subdomain}`);
            } else {
              // SECURITY: Fail closed for unknown subdomains (prevents cross-tenant exposure)
              // This applies to both authenticated and public requests
              console.warn(`[Tenant] No dealership found for subdomain: ${subdomain}`);
              return res.status(404).json({ error: `Dealership not found for subdomain: ${subdomain}` });
            }
          } catch (error: any) {
            // Subdomain lookup failed - fail closed
            console.error('[Tenant] Subdomain lookup error:', error?.message || error, 'Stack:', error?.stack);
            return res.status(500).json({ 
              error: 'Failed to resolve dealership from subdomain',
              subdomain,
              details: error?.message || 'Unknown error'
            });
          }
        }
      }
      
      // Strategy 3: Check for custom header (for authenticated API integrations only)
      // SECURITY: Only honor X-Dealership-Id header when authenticated to prevent header spoofing
      if (!dealershipId && req.headers['x-dealership-id'] && authHeader) {
        const headerDealershipId = parseInt(req.headers['x-dealership-id'] as string);
        if (!isNaN(headerDealershipId)) {
          // Only allow super_admin or master users to switch dealership context via header
          const user = req.user;
          if (user && (user.role === 'super_admin' || user.role === 'master')) {
            dealershipId = headerDealershipId;
            source = 'header';
          }
        }
      }
      
      // Strategy 4: Handle missing dealership context
      if (!dealershipId) {
        if (tokenInvalid) {
          // Invalid/expired token - fail closed with 401
          return res.status(401).json({ error: 'Invalid or expired token' });
        } else if (authHeader) {
          // Auth header present but dealershipId couldn't be resolved
          // Exception: super_admin and master users can proceed without dealership context
          // (they select dealership in their dashboard UI or via explicit header)
          const user = req.user;
          if (user && (user.role === 'super_admin' || user.role === 'master')) {
            // Allow super_admin/master to proceed - dealershipId stays undefined
            // Routes that need dealership context should handle this appropriately
            source = 'none';
          } else {
            // Regular authenticated user without dealership context - fail closed
            return res.status(400).json({ error: 'Could not determine dealership context from authentication' });
          }
        } else if (isDevOrPreviewHost(req.hostname)) {
          // Development/preview environment - default to dealershipId=1 for testing
          // This allows the marketing site and inventory to work in Replit dev mode
          dealershipId = 1;
          source = 'default';
        }
        // Public request without subdomain on production - leave dealershipId undefined
        // Routes that need dealership context will return 400
        // This allows marketing site pages (landing, login) to work without dealership context
        if (!dealershipId) {
          source = 'none';
        }
      }
      
      // Set dealership ID and source in request context
      if (dealershipId) {
        req.dealershipId = dealershipId;
        req.tenantSource = source;
        
        // Load dealership details if not already loaded
        if (!req.dealership) {
          try {
            const dealership = await storage.getDealership(dealershipId);
            if (dealership) {
              req.dealership = dealership;
            }
          } catch (error) {
            console.error('Failed to load dealership details:', error);
            // Don't fail the request - continue without dealership details
          }
        }
      }
      
      next();
    } catch (error) {
      console.error('Tenant middleware error:', error);
      // SECURITY: Always fail closed on errors (no silent fallback to dealership 1)
      return res.status(500).json({ error: 'Tenant resolution failed' });
    }
  };
}

/**
 * Require dealership context - fails if no dealership can be determined
 * Use this for routes that absolutely need dealership context
 */
export function requireDealership(req: Request, res: Response, next: NextFunction) {
  if (!req.dealershipId) {
    return res.status(400).json({
      error: 'No dealership context found. Please specify via subdomain or authentication.'
    });
  }
  next();
}

/**
 * Super admin only middleware - requires authenticated super_admin user
 */
export function superAdminOnly(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const user = req.user as any;
  if (user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  
  next();
}

/**
 * Master user only middleware - requires authenticated master user
 */
export function masterOnly(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const user = req.user as any;
  if (user.role !== 'master') {
    return res.status(403).json({ error: 'Master user access required' });
  }
  
  next();
}

/**
 * Dealership owner or master middleware - allows access to dealership data
 * by dealership owners or master users
 */
export function dealershipOwnerOrMaster(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const user = req.user as any;
  const targetDealershipId = req.dealershipId || parseInt(req.params.dealershipId) || parseInt(req.query.dealershipId as string);
  
  // Super admins and master users can access all dealerships
  if (user.role === 'super_admin' || user.role === 'master') {
    return next();
  }
  
  // Non-master users can only access their own dealership
  if (user.dealershipId === targetDealershipId) {
    return next();
  }
  
  return res.status(403).json({ error: 'Access denied. You can only access your own dealership data.' });
}
