/**
 * Unified Error Handling Middleware
 * Centralizes all Express error handling with proper status codes,
 * structured logging, and safe error messages for production.
 */

import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../services/logger";
// Custom application errors with HTTP status codes
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(400, message, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super(401, message, "AUTHENTICATION_ERROR");
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(403, message, "AUTHORIZATION_ERROR");
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(404, `${resource} not found`, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict detected") {
    super(409, message, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests", public retryAfter?: number) {
    super(429, message, "RATE_LIMIT_EXCEEDED");
    this.name = "RateLimitError";
  }
}

// Map of known error codes to HTTP status codes
const ERROR_STATUS_MAP: Record<string, number> = {
  P2002: 409, // Unique constraint violation (Prisma/Drizzle)
  P2025: 404, // Record not found
  "23505": 409, // PostgreSQL unique violation
  "23503": 409, // Foreign key violation
  "22P02": 400, // Invalid text representation
  "42703": 400, // Undefined column
};

// Determine if error is from a known database library
function getErrorStatusCode(err: any): number {
  // Check for AppError (our custom errors)
  if (err instanceof AppError) return err.statusCode;

  // Check for database error codes
  if (err?.code && ERROR_STATUS_MAP[err.code]) {
    return ERROR_STATUS_MAP[err.code];
  }

  // Check for specific error types
  if (err?.name === "SyntaxError" || err?.name === "PayloadTooLargeError") return 400;
  if (err?.name === "UnauthorizedError") return 401;
  if (err?.name === "ForbiddenError") return 403;
  if (err?.name === "NotFoundError") return 404;
  if (err?.name === "ConflictError") return 409;
  if (err?.type === "entity.parse.failed") return 400;
  if (err?.message?.includes("timeout")) return 504;
  if (err?.message?.includes("ECONNREFUSED")) return 503;

  // Default to 500 for unknown errors
  return 500;
}

// Safe error message for production (never leaks internal details)
function getSafeMessage(err: any, statusCode: number): string {
  // In production, only return detailed messages for 4xx errors
  const isProduction = process.env.NODE_ENV === "production";

  if (statusCode < 500) {
    return err.message || "Request failed";
  }

  // For 5xx errors in production, return generic message
  if (isProduction) {
    return "Internal server error. The team has been notified.";
  }

  // In development, return full error message
  return err.message || "Internal server error";
}

// Main error handling middleware
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = getErrorStatusCode(err);
  const message = getSafeMessage(err, statusCode);
  const requestId = (req as any).requestId || randomUUID();
  const isProduction = process.env.NODE_ENV === "production";

  // Log the error with full context
  logger.error("Request failed", err, {
    requestId,
    route: req.path,
    method: req.method,
    statusCode,
    dealershipId: (req as any).dealershipId,
    userId: (req as any).user?.id,
    code: err?.code,
    // Only include stack traces in non-production
    ...(isProduction ? {} : { stack: err?.stack }),
  });

  // Send response
  const response: any = {
    success: false,
    error: message,
    code: err instanceof AppError ? err.code : "INTERNAL_ERROR",
    requestId,
  };

  // Include details for validation errors (safe to expose)
  if (err instanceof ValidationError && err.details) {
    response.details = err.details;
  }

  // Include retry-after for rate limits
  if (err instanceof RateLimitError && err.retryAfter) {
    res.setHeader("Retry-After", String(err.retryAfter));
  }

  // Include stack trace in development only
  if (!isProduction && err?.stack) {
    response.stack = err.stack.split("\n");
  }

  res.status(statusCode).json(response);
}

// Async handler wrapper — eliminates need for try/catch in every route
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// 404 handler for unmatched routes
export function notFoundHandler(req: Request, res: Response): void {
  const requestId = (req as any).requestId || "unknown";
  logger.warn(`Route not found: ${req.method} ${req.path}`, { requestId, route: req.path });
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
    code: "ROUTE_NOT_FOUND",
    requestId,
  });
}