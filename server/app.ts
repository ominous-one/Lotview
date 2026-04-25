import { type Server } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";

import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { registerModularRoutes } from "./routes/index";
import { tenantMiddleware } from "./tenant-middleware";
import { storage } from "./storage";
import { validateEnvironment } from "./env-validation";
import { getRedisClient, checkRedisHealth } from "./services/redis";
import { closeDatabasePool } from "./db";

// Validate environment variables before any other initialization
validateEnvironment();

const isProduction = process.env.NODE_ENV === "production";
const useJsonLogs = isProduction || process.env.LOG_FORMAT === "json";

const ASYNC_HANDLER_METHODS = ["use", "all", "get", "post", "put", "patch", "delete", "options", "head"] as const;
const LOCALHOST_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
const DEFAULT_ALLOWED_HEADERS = ["Content-Type", "Authorization", "X-Requested-With", "X-Request-Id"];
const DEFAULT_ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

function serializeLog(payload: Record<string, unknown>) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

export function log(message: string, source = "express", details?: Record<string, unknown>) {
  if (useJsonLogs) {
    console.log(serializeLog({
      level: "info",
      source,
      message,
      ...details,
    }));
    return;
  }

  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

function wrapAsyncHandler<T extends Function>(handler: T): T {
  if (typeof handler !== "function") {
    return handler;
  }

  if ((handler as Function).length === 4) {
    return ((err: unknown, req: Request, res: Response, next: NextFunction) => {
      try {
        const result = (handler as unknown as (err: unknown, req: Request, res: Response, next: NextFunction) => unknown)(err, req, res, next);
        Promise.resolve(result).catch(next);
      } catch (wrappedError) {
        next(wrappedError);
      }
    }) as unknown as T;
  }

  return ((req: Request, res: Response, next: NextFunction) => {
    try {
      const result = (handler as unknown as (req: Request, res: Response, next: NextFunction) => unknown)(req, res, next);
      Promise.resolve(result).catch(next);
    } catch (wrappedError) {
      next(wrappedError);
    }
  }) as unknown as T;
}

function wrapAsyncHandlers(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (Array.isArray(arg)) {
      return wrapAsyncHandlers(arg);
    }

    return typeof arg === "function"
      ? wrapAsyncHandler(arg)
      : arg;
  });
}

function patchAsyncErrorHandling(target: Express) {
  for (const method of ASYNC_HANDLER_METHODS) {
    const original = target[method].bind(target) as (...args: unknown[]) => unknown;
    target[method] = ((...args: unknown[]) => original(...wrapAsyncHandlers(args))) as Express[typeof method];
  }
}

function parseConfiguredCorsOrigins() {
  return (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isSameOriginRequest(req: Request, origin: string) {
  const host = req.get("host");
  if (!host) {
    return false;
  }

  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol;

  return origin === `${protocol}://${host}`;
}

function isCorsOriginAllowed(req: Request, origin: string) {
  if (!origin) {
    return true;
  }

  if (!isProduction) {
    return LOCALHOST_ORIGIN_PATTERN.test(origin);
  }

  const configuredOrigins = parseConfiguredCorsOrigins();
  if (configuredOrigins.length > 0) {
    return configuredOrigins.includes(origin);
  }

  return isSameOriginRequest(req, origin);
}

function getAllowedRequestHeaders(req: Request) {
  const requestHeaders = req.get("access-control-request-headers");
  return requestHeaders || DEFAULT_ALLOWED_HEADERS.join(", ");
}

function getSafeErrorMessage(status: number, error: unknown) {
  if (status >= 500 && isProduction) {
    return "Internal Server Error";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return status >= 500 ? "Internal Server Error" : "Request failed";
}

// Trust proxy when behind reverse proxy / load balancer
if (isProduction) {
  app.set("trust proxy", 1);
}

patchAsyncErrorHandling(app);

const SENSITIVE_RESPONSE_KEYS = new Set([
  'token',
  'rawToken',
  'accessToken',
  'refreshToken',
  'impersonationToken',
  'password',
  'passwordHash',
  'tokenHash',
  'authorization',
  'cookie',
  'set-cookie',
  'email',
  'phone',
  'customerEmail',
  'customerPhone',
  'supportEmail',
  'salesEmail',
]);

function redactForLogs(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactForLogs);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => {
        if (SENSITIVE_RESPONSE_KEYS.has(key)) {
          return [key, '[REDACTED]'];
        }
        return [key, redactForLogs(nestedValue)];
      }),
    );
  }

  return value;
}

function shouldLogResponseBody(path: string): boolean {
  return !(
    path.startsWith('/api/auth/') ||
    path.startsWith('/api/extension/login') ||
    path.startsWith('/api/super-admin/impersonate') ||
    path.startsWith('/api/external-api-tokens')
  );
}

// Security headers with helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      // unsafe-inline required for GTM inline snippet in index.html
      scriptSrc: ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
      // http: required for dealer inventory photos served over plain HTTP
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      connectSrc: ["'self'", "https:", "wss:", "https://www.googletagmanager.com"],
      frameSrc: ["'self'", "https://www.facebook.com", "https://www.googletagmanager.com"],
      workerSrc: ["'self'", "blob:"],
      manifestSrc: ["'self'"],
      upgradeInsecureRequests: isProduction ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: "no-referrer" },
  noSniff: true,
}));

app.use((req, res, next) => {
  const origin = req.get("origin");

  if (!origin) {
    return next();
  }

  if (!isCorsOriginAllowed(req, origin)) {
    if (req.method === "OPTIONS") {
      return res.status(403).json({ error: "CORS origin denied" });
    }

    return next();
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", DEFAULT_ALLOWED_METHODS.join(", "));
  res.setHeader("Access-Control-Allow-Headers", getAllowedRequestHeaders(req));
  res.setHeader("Access-Control-Expose-Headers", "X-Request-Id");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// Global rate limiter - 1000 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  skip: (req) => {
    // Skip rate limiting for static assets
    return !req.path.startsWith('/api');
  }
});
app.use(globalLimiter);

// Strict rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again after 15 minutes" },
  // Use default IP-based key generator (handles IPv6 properly)
});

// Strict rate limiter for sensitive operations (password reset, etc.)
export const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 attempts per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests for this sensitive operation, please try again later" },
});

app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

// Request body parsing with size limits to prevent DoS
app.use(express.json({
  limit: "1mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// Serve static files from public directory (logos, uploads, etc.)
app.use(express.static(path.join(process.cwd(), 'public')));

// Tenant context middleware - extract dealership from user/subdomain/header
// MUST run before routes to ensure req.dealershipId is available
app.use(tenantMiddleware(storage));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      const redactedResponse = capturedJsonResponse && shouldLogResponseBody(reqPath)
        ? redactForLogs(capturedJsonResponse)
        : undefined;

      if (useJsonLogs) {
        console.log(serializeLog({
          level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
          source: "http",
          method: req.method,
          path: reqPath,
          status: res.statusCode,
          duration_ms: duration,
          ip: req.ip,
          user_agent: req.get("user-agent"),
          request_id: req.requestId,
          response: redactedResponse,
        }));
      } else {
        let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms [${req.requestId}]`;
        if (redactedResponse) {
          logLine += ` :: ${JSON.stringify(redactedResponse)}`;
        }
        if (logLine.length > 240) {
          logLine = logLine.slice(0, 239) + "…";
        }
        log(logLine);
      }
    }
  });

  next();
});

export default async function runApp(
  setup: (app: Express, server: Server) => Promise<void>,
  processType: string = "web",
) {
  // Register modular routes first (extracted from monolithic routes.ts)
  registerModularRoutes(app);

  // Register legacy routes (remaining routes not yet extracted)
  const server = await registerRoutes(app);

  // importantly run the final setup after setting up all the other routes so
  // the catch-all route doesn't interfere with the other routes
  await setup(app, server);

  // Graceful shutdown — drain connections before exiting
  const gracefulShutdown = async (signal: string) => {
    log(`Received ${signal}, shutting down gracefully...`);

    server.close(async () => {
      log("HTTP server closed, draining connections...");
      try {
        await closeDatabasePool();
        log("Database pool closed");
      } catch (err) {
        logError("Error closing database pool:", err instanceof Error ? err : new Error(String(err)));
      }
      process.exit(0);
    });

    // Force exit after 30 seconds if graceful shutdown hangs
    setTimeout(() => {
      logError("Forced shutdown after 30 second timeout", new Error("Shutdown timeout"));
      process.exit(1);
    }, 30000);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  // Global error handler - must be last middleware registered
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const status = typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: number }).status) || 500
      : typeof err === "object" && err !== null && "statusCode" in err
        ? Number((err as { statusCode?: number }).statusCode) || 500
        : 500;

    const safeMessage = getSafeErrorMessage(status, err);

    if (status >= 500) {
      const errorPayload: Record<string, unknown> = {
        level: "error",
        source: "express-error",
        message: err instanceof Error ? err.message : "Unhandled error",
        status,
        method: req.method,
        path: req.originalUrl,
        request_id: req.requestId,
        ip: req.ip,
      };

      if (err instanceof Error && !isProduction) {
        errorPayload.stack = err.stack;
      }

      console.error(serializeLog(errorPayload));
    }

    if (res.headersSent) {
      return;
    }

    const body: Record<string, unknown> = {
      message: safeMessage,
      requestId: req.requestId,
    };

    if (!isProduction && err instanceof Error && err.stack) {
      body.stack = err.stack;
    }

    res.status(status).json(body);
  });

  const port = parseInt(process.env.PORT || '5000', 10);
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("error", onError);
      reject(error);
    };

    server.once("error", onError);
    server.listen({
      port,
      host: "0.0.0.0",
    }, () => {
      server.off("error", onError);
      log(`serving on port ${port}`);
      resolve();
    });
  });

  return server;
}
