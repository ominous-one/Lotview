/**
 * Structured Logger Service
 * Replaces all console.log with production-grade structured logging.
 * Supports JSON (production) and pretty (development) formats.
 * Includes log levels, redaction, and correlation IDs.
 */

import { randomUUID } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface LogContext {
  requestId?: string;
  dealershipId?: number;
  userId?: number;
  route?: string;
  [key: string]: any;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  source: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const CURRENT_LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || "info";
const IS_JSON = process.env.LOG_FORMAT === "json" || process.env.NODE_ENV === "production";

const SENSITIVE_KEYS = new Set([
  "password", "passwordHash", "token", "accessToken", "refreshToken",
  "apiKey", "secret", "jwt", "authorization", "cookie",
  "creditCard", "ssn", "sin",
]);

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[CURRENT_LOG_LEVEL];
}

function redact(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => {
      if (SENSITIVE_KEYS.has(key)) return [key, "[REDACTED]"];
      if (typeof value === "object" && value !== null) return [key, redact(value)];
      return [key, value];
    })
  );
}

function formatPretty(entry: LogEntry): string {
  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const color = {
    debug: "\x1b[36m",
    info: "\x1b[32m",
    warn: "\x1b[33m",
    error: "\x1b[31m",
    fatal: "\x1b[35m",
  }[entry.level];
  const reset = "\x1b[0m";
  let msg = `${color}[${time}] ${entry.level.toUpperCase().padEnd(5)} ${reset}[${entry.source}] ${entry.message}`;
  if (entry.context && Object.keys(entry.context).length > 0) {
    msg += ` \x1b[90m${JSON.stringify(redact(entry.context))}\x1b[0m`;
  }
  if (entry.error) {
    msg += `\n  ${color}→ ${entry.error.name}: ${entry.error.message}\x1b[0m`;
  }
  return msg;
}

function write(entry: LogEntry): void {
  if (!shouldLog(entry.level)) return;
  if (IS_JSON) {
    console.log(JSON.stringify({ ...entry, context: redact(entry.context) }));
  } else {
    console.log(formatPretty(entry));
  }
}

export function createLogger(source: string) {
  return {
    debug: (message: string, context?: LogContext) =>
      write({ timestamp: new Date().toISOString(), level: "debug", message, source, context }),
    info: (message: string, context?: LogContext) =>
      write({ timestamp: new Date().toISOString(), level: "info", message, source, context }),
    warn: (message: string, context?: LogContext) =>
      write({ timestamp: new Date().toISOString(), level: "warn", message, source, context }),
    error: (message: string, error?: Error, context?: LogContext) =>
      write({
        timestamp: new Date().toISOString(),
        level: "error",
        message,
        source,
        context,
        error: error ? { name: error.name, message: error.message, stack: error.stack } : undefined,
      }),
    fatal: (message: string, error?: Error, context?: LogContext) =>
      write({
        timestamp: new Date().toISOString(),
        level: "fatal",
        message,
        source,
        context,
        error: error ? { name: error.name, message: error.message, stack: error.stack } : undefined,
      }),
  };
}

// Default app logger
export const logger = createLogger("lotview");

// Convenience exports for backward compatibility
export const logDebug = (msg: string, ctx?: LogContext) => logger.debug(msg, ctx);
export const logInfo = (msg: string, ctx?: LogContext) => logger.info(msg, ctx);
export const logWarn = (msg: string, ctx?: LogContext) => logger.warn(msg, ctx);
export const logError = (msg: string, err?: Error, ctx?: LogContext) => logger.error(msg, err, ctx);
