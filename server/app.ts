import { type Server } from "node:http";
import path from "node:path";

import express, { type Express, type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { tenantMiddleware } from "./tenant-middleware";
import { storage } from "./storage";

const isProduction = process.env.NODE_ENV === "production";
const useJsonLogs = isProduction || process.env.LOG_FORMAT === "json";

export function log(message: string, source = "express") {
  if (useJsonLogs) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      source,
      message,
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

// Trust proxy when behind reverse proxy / load balancer
if (isProduction) {
  app.set("trust proxy", 1);
}

// Security headers with helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "https:", "wss:"],
      frameSrc: ["'self'", "https://www.facebook.com"],
      workerSrc: ["'self'", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Required for cross-origin images
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

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

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

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
      if (useJsonLogs) {
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
          source: "http",
          method: req.method,
          path: reqPath,
          status: res.statusCode,
          duration_ms: duration,
          ip: req.ip,
          user_agent: req.get("user-agent"),
        }));
      } else {
        let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }
        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "\u2026";
        }
        log(logLine);
      }
    }
  });

  next();
});

export default async function runApp(
  setup: (app: Express, server: Server) => Promise<void>,
) {
  const server = await registerRoutes(app);

  // Global error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (status >= 500) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        source: "unhandled",
        message,
        stack: err.stack,
      }));
    }

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // importantly run the final setup after setting up all the other routes so
  // the catch-all route doesn't interfere with the other routes
  await setup(app, server);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    log(`${signal} received, shutting down gracefully...`);
    server.close(() => {
      log("HTTP server closed");
      process.exit(0);
    });
    // Force exit after 10s if graceful shutdown fails
    setTimeout(() => {
      console.error("Forceful shutdown after timeout");
      process.exit(1);
    }, 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
