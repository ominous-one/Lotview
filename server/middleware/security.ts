/**
 * CSRF Protection + Audit Logging Middleware
 * 
 * CSRF: Validates Origin/Referer headers for state-changing requests
 * Audit: Logs all data-modifying operations with user context
 */

import type { Request, Response, NextFunction } from "express";
import { logger } from "../services/logger";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);
const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ORIGIN || "http://localhost:3000,http://localhost:5000")
    .split(",")
    .map(o => o.trim())
);

/**
 * CSRF protection middleware.
 * Validates that state-changing requests come from allowed origins.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip for safe methods
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Skip for API key authentication (machine-to-machine)
  if (req.headers["x-api-key"] || req.headers["authorization"]?.startsWith("Bearer ")) {
    return next();
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  // If no origin/referer, reject (browser should always send one)
  if (!origin && !referer) {
    logger.warn("CSRF blocked: missing origin and referer", {
      route: req.path, method: req.method, ip: req.ip,
    });
    res.status(403).json({
      success: false,
      error: "CSRF validation failed: missing origin",
      code: "CSRF_MISSING_ORIGIN",
    });
    return;
  }

  // Validate origin against allowlist
  const requestOrigin = origin || (referer ? new URL(referer).origin : null);
  if (requestOrigin && !ALLOWED_ORIGINS.has(requestOrigin)) {
    logger.warn("CSRF blocked: invalid origin", {
      route: req.path, method: req.method, origin: requestOrigin, ip: req.ip,
    });
    res.status(403).json({
      success: false,
      error: "CSRF validation failed: invalid origin",
      code: "CSRF_INVALID_ORIGIN",
    });
    return;
  }

  next();
}

/**
 * Audit logging middleware.
 * Records all data-modifying operations with full context.
 */
export function auditLogger(req: Request, res: Response, next: NextFunction): void {
  // Only log state-changing operations
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const startTime = Date.now();
  const userId = (req as any).user?.id;
  const dealershipId = (req as any).dealershipId;
  const requestId = (req as any).requestId || "unknown";

  // Capture response data
  const originalJson = res.json.bind(res);
  res.json = function(body: any) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Log successful data modifications
    if (statusCode >= 200 && statusCode < 300 && userId) {
      logger.info("Audit: data modification", {
        requestId,
        userId,
        dealershipId,
        method: req.method,
        route: req.path,
        statusCode,
        duration,
        // Redact sensitive fields from body
        bodyKeys: body && typeof body === "object" ? Object.keys(body) : undefined,
      });
    }

    // Log failed modifications
    if (statusCode >= 400 && userId) {
      logger.warn("Audit: failed modification", {
        requestId,
        userId,
        dealershipId,
        method: req.method,
        route: req.path,
        statusCode,
        duration,
        error: body?.error || body?.message,
      });
    }

    return originalJson(body);
  };

  next();
}

/**
 * Request ID middleware.
 * Attaches a unique ID to every request for tracing.
 */
export function requestId(req: Request, _res: Response, next: NextFunction): void {
  (req as any).requestId = req.headers["x-request-id"] || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  next();
}
