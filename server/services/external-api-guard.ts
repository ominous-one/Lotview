/**
 * External API Guard
 * Rate limiting, authentication, and abuse prevention for external API endpoints.
 * Protects n8n, Zapier, and third-party integration endpoints.
 */

import { getRedisClient } from "./redis";
import { logInfo, logWarn, logError } from "../error-utils";
import { storage } from "../storage";
import type { Request, Response, NextFunction } from "express";

// ---- Rate Limit Configuration ----

const RATE_LIMITS = {
  // Per API key per window
  import_vehicles: { max: 100, windowMs: 3600000 },    // 100/hour
  webhook_ghl: { max: 1000, windowMs: 3600000 },        // 1000/hour
  webhook_n8n: { max: 100, windowMs: 3600000 },         // 100/hour
  webhook_zapier: { max: 100, windowMs: 3600000 },      // 100/hour
  webhook_browserless: { max: 500, windowMs: 3600000 }, // 500/hour
  default: { max: 60, windowMs: 60000 },                // 60/minute
};

// ---- Core Functions ----

/**
 * Check if a request is within rate limit.
 */
export async function checkExternalApiRateLimit(
  apiKey: string,
  endpoint: string
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redis = getRedisClient();
  const config = RATE_LIMITS[endpoint as keyof typeof RATE_LIMITS] || RATE_LIMITS.default;

  const windowStart = Math.floor(Date.now() / config.windowMs);
  const key = `ext_api:${apiKey}:${endpoint}:${windowStart}`;

  const current = await redis.incr(key);
  if (current === 1) {
    await redis.pexpire(key, config.windowMs);
  }

  const allowed = current <= config.max;
  const remaining = Math.max(0, config.max - current);
  const ttl = await redis.pttl(key);
  const resetAt = Date.now() + (ttl > 0 ? ttl : config.windowMs);

  return { allowed, remaining, resetAt };
}

/**
 * Validate an external API token from the Authorization header.
 */
export async function validateApiToken(
  authHeader: string | undefined
): Promise<{
  valid: boolean;
  dealershipId?: number;
  permissions?: string[];
  error?: string;
}> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { valid: false, error: "Missing or invalid Authorization header" };
  }

  const token = authHeader.slice(7);
  if (!token || token.length < 16) {
    return { valid: false, error: "Invalid token format" };
  }

  // Look up token by prefix (first 8 chars)
  const prefix = token.substring(0, 8);
  const tokens = await storage.getExternalApiTokensByPrefix?.(prefix);

  if (!tokens || tokens.length === 0) {
    return { valid: false, error: "Unknown API key" };
  }

  // Compare hash using timing-safe comparison
  const crypto = await import("crypto");
  let matchedToken = null;
  for (const t of tokens) {
    // bcrypt compare
    const bcrypt = await import("bcryptjs");
    if (await bcrypt.compare(token, t.tokenHash)) {
      matchedToken = t;
      break;
    }
  }

  if (!matchedToken) {
    return { valid: false, error: "Invalid API key" };
  }

  // Check expiration
  if (matchedToken.expiresAt && new Date() > matchedToken.expiresAt) {
    return { valid: false, error: "API key expired" };
  }

  // Update last used
  await storage.updateExternalApiTokenLastUsed?.(matchedToken.id);

  return {
    valid: true,
    dealershipId: matchedToken.dealershipId,
    permissions: matchedToken.permissions,
  };
}

/**
 * Check if a token has a specific permission.
 */
export function hasPermission(
  permissions: string[],
  required: string
): boolean {
  return permissions.includes(required) || permissions.includes("admin:*") || permissions.includes("*");
}

// ---- Middleware ----

/**
 * Express middleware for external API authentication + rate limiting.
 */
export function createExternalApiMiddleware(endpoint: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Authenticate
      const authResult = await validateApiToken(req.headers.authorization);
      if (!authResult.valid) {
        logWarn(`[ExtAPI] Auth failed: ${authResult.error}`, {
          ip: req.ip,
          endpoint,
          path: req.path,
        });
        return res.status(401).json({ error: authResult.error });
      }

      // 2. Check permissions
      const requiredPermission = `import:${endpoint}`;
      if (!hasPermission(authResult.permissions || [], requiredPermission)) {
        return res.status(403).json({ error: `Missing permission: ${requiredPermission}` });
      }

      // 3. Rate limit
      const apiKey = req.headers.authorization!.slice(7);
      const rateResult = await checkExternalApiRateLimit(apiKey, endpoint);

      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", RATE_LIMITS[endpoint as keyof typeof RATE_LIMITS]?.max || RATE_LIMITS.default.max);
      res.setHeader("X-RateLimit-Remaining", rateResult.remaining);
      res.setHeader("X-RateLimit-Reset", Math.ceil(rateResult.resetAt / 1000));

      if (!rateResult.allowed) {
        logWarn(`[ExtAPI] Rate limit exceeded for ${endpoint}`, {
          dealershipId: authResult.dealershipId,
          ip: req.ip,
        });
        return res.status(429).json({
          error: "Rate limit exceeded",
          retryAfter: Math.ceil((rateResult.resetAt - Date.now()) / 1000),
        });
      }

      // 4. Attach dealership context
      (req as any).dealershipId = authResult.dealershipId;
      (req as any).apiPermissions = authResult.permissions;

      next();
    } catch (error) {
      logError(`[ExtAPI] Middleware error: ${error}`, error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

/**
 * Express middleware specifically for webhook endpoints.
 * Uses webhook secret (not API key) and has separate rate limits.
 */
export function createWebhookMiddleware(provider: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiKey = req.headers.authorization;
      if (!apiKey) {
        return res.status(401).json({ error: "Missing Authorization header" });
      }

      const token = apiKey.startsWith("Bearer ") ? apiKey.slice(7) : apiKey;
      const rateResult = await checkExternalApiRateLimit(token, `webhook_${provider}`);

      res.setHeader("X-RateLimit-Limit", RATE_LIMITS[`webhook_${provider}` as keyof typeof RATE_LIMITS]?.max || RATE_LIMITS.default.max);
      res.setHeader("X-RateLimit-Remaining", rateResult.remaining);

      if (!rateResult.allowed) {
        return res.status(429).json({ error: "Rate limit exceeded" });
      }

      next();
    } catch (error) {
      logError(`[Webhook] Middleware error: ${error}`, error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

// ---- IP Allowlisting ----

const ALLOWED_IPS = new Set<string>();

/**
 * Add an IP to the allowlist.
 */
export async function allowlistIp(ip: string, description: string): Promise<void> {
  const redis = getRedisClient();
  await redis.hset("ext_api:allowlist", ip, description);
  ALLOWED_IPS.add(ip);
}

/**
 * Check if an IP is allowlisted.
 */
export async function isAllowlisted(ip: string): Promise<boolean> {
  if (ALLOWED_IPS.has(ip)) return true;
  const redis = getRedisClient();
  const exists = await redis.hexists("ext_api:allowlist", ip);
  if (exists) ALLOWED_IPS.add(ip);
  return exists === 1;
}

// ---- Abuse Detection ----

/**
 * Detect and block abusive patterns:
 * - Rapid-fire requests from same IP
 * - Unusual request patterns
 * - Known bad actor IPs
 */
export async function detectAbuse(
  ip: string,
  apiKey: string,
  endpoint: string
): Promise<{ isAbusive: boolean; reason?: string }> {
  const redis = getRedisClient();

  // Check rapid-fire: > 10 requests in 1 second
  const rapidKey = `abuse:rapid:${ip}:${Math.floor(Date.now() / 1000)}`;
  const rapidCount = await redis.incr(rapidKey);
  if (rapidCount === 1) await redis.expire(rapidKey, 2);
  if (rapidCount > 10) {
    // Block for 1 hour
    await redis.setex(`abuse:blocked:${ip}`, 3600, "rapid_fire");
    return { isAbusive: true, reason: "Rapid-fire requests detected" };
  }

  // Check if already blocked
  const blocked = await redis.get(`abuse:blocked:${ip}`);
  if (blocked) {
    return { isAbusive: true, reason: `IP blocked: ${blocked}` };
  }

  return { isAbusive: false };
}
