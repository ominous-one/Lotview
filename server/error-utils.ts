import { Response } from 'express';
import crypto from 'crypto';

export interface ApiError {
  error: string;
  code?: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

export interface ErrorContext {
  userId?: number;
  dealershipId?: number;
  endpoint?: string;
  method?: string;
  additionalContext?: Record<string, unknown>;
}

type LogLevel = 'error' | 'warn' | 'info';

function generateCorrelationId(): string {
  return crypto.randomBytes(8).toString('hex');
}

function formatLogMessage(
  level: LogLevel,
  message: string,
  correlationId: string,
  context?: ErrorContext,
  error?: unknown
): void {
  const timestamp = new Date().toISOString();
  const errorStr = error instanceof Error ? error.stack || error.message : String(error);
  
  const logEntry: Record<string, unknown> = {
    timestamp,
    level,
    correlationId,
    message,
  };
  
  if (context) {
    logEntry.context = context;
  }
  
  if (error) {
    logEntry.error = errorStr;
  }

  if (level === 'error') {
    console.error(JSON.stringify(logEntry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
}

export function sendErrorResponse(
  res: Response,
  statusCode: number,
  message: string,
  options?: {
    code?: string;
    context?: ErrorContext;
    error?: unknown;
    includeCorrelationId?: boolean;
    details?: Record<string, unknown>;
  }
): void {
  const correlationId = generateCorrelationId();
  const { code, context, error, includeCorrelationId = true, details } = options || {};

  const level: LogLevel = statusCode >= 500 ? 'error' : 'warn';
  formatLogMessage(level, message, correlationId, context, error);

  const response: ApiError = {
    error: message,
    ...(code && { code }),
    ...(includeCorrelationId && statusCode >= 500 && { correlationId }),
    ...(details && { details }),
  };

  res.status(statusCode).json(response);
}

export function handleInternalError(
  res: Response,
  error: unknown,
  context?: ErrorContext
): void {
  sendErrorResponse(res, 500, 'Internal server error', {
    context,
    error,
    includeCorrelationId: true,
  });
}

export function handleBadRequest(
  res: Response,
  message: string,
  details?: Record<string, unknown>
): void {
  sendErrorResponse(res, 400, message, {
    code: 'BAD_REQUEST',
    details,
    includeCorrelationId: false,
  });
}

export function handleUnauthorized(
  res: Response,
  message: string = 'Unauthorized'
): void {
  sendErrorResponse(res, 401, message, {
    code: 'UNAUTHORIZED',
    includeCorrelationId: false,
  });
}

export function handleForbidden(
  res: Response,
  message: string = 'Forbidden'
): void {
  sendErrorResponse(res, 403, message, {
    code: 'FORBIDDEN',
    includeCorrelationId: false,
  });
}

export function handleNotFound(
  res: Response,
  resource: string = 'Resource'
): void {
  sendErrorResponse(res, 404, `${resource} not found`, {
    code: 'NOT_FOUND',
    includeCorrelationId: false,
  });
}

export function handleConflict(
  res: Response,
  message: string
): void {
  sendErrorResponse(res, 409, message, {
    code: 'CONFLICT',
    includeCorrelationId: false,
  });
}

export function handleValidationError(
  res: Response,
  message: string,
  errors?: Record<string, string[]>
): void {
  sendErrorResponse(res, 422, message, {
    code: 'VALIDATION_ERROR',
    details: errors ? { validationErrors: errors } : undefined,
    includeCorrelationId: false,
  });
}

export function handleTooManyRequests(
  res: Response,
  message: string = 'Too many requests'
): void {
  sendErrorResponse(res, 429, message, {
    code: 'RATE_LIMITED',
    includeCorrelationId: false,
  });
}

export function handleServiceUnavailable(
  res: Response,
  message: string = 'Service temporarily unavailable'
): void {
  sendErrorResponse(res, 503, message, {
    code: 'SERVICE_UNAVAILABLE',
    includeCorrelationId: true,
  });
}

export function logInfo(message: string, context?: Record<string, unknown>): void {
  const correlationId = generateCorrelationId();
  formatLogMessage('info', message, correlationId, context as ErrorContext);
}

export function logWarn(message: string, context?: Record<string, unknown>): void {
  const correlationId = generateCorrelationId();
  formatLogMessage('warn', message, correlationId, context as ErrorContext);
}

export function logError(message: string, error?: unknown, context?: Record<string, unknown>): void {
  const correlationId = generateCorrelationId();
  formatLogMessage('error', message, correlationId, context as ErrorContext, error);
}
