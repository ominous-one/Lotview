import express, { type Request, type Response, type NextFunction } from "express";
import { json, urlencoded } from "express";
import { createServer } from "node:http";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";

// These are safe — they don't throw at load time
const app = express();

export default async function runApp(_serveStatic?: any, processType: string = "web"): Promise<ReturnType<typeof createServer>> {
  const server = createServer(app);
  const startupLog: string[] = [];
  const startupErrors: string[] = [];

  function logStep(step: string, error?: Error | string) {
    if (error) {
      const msg = typeof error === "string" ? error : error.message;
      startupErrors.push(`[${step}] ${msg}`);
      console.error(`[Startup] ${step} FAILED: ${msg}`);
    } else {
      startupLog.push(`[${step}] OK`);
      console.log(`[Startup] ${step} OK`);
    }
  }

  // ===== PHASE 1: BASIC MIDDLEWARE (never fails) =====
  try {
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));
    app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
    app.use(json({ limit: "1mb" }));
    app.use(urlencoded({ extended: true, limit: "1mb" }));
    logStep("Basic middleware");
  } catch (e) {
    logStep("Basic middleware", e as Error);
  }

  // ===== PHASE 2: RATE LIMITING =====
  try {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use("/api/", limiter);
    logStep("Rate limiting");
  } catch (e) {
    logStep("Rate limiting", e as Error);
  }

  // ===== PHASE 3: HEALTH ENDPOINT (always available) =====
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      time: new Date().toISOString(),
      uptime: process.uptime(),
      startupLog,
      startupErrors,
      featuresLoaded: startupLog.length,
      featuresFailed: startupErrors.length,
    });
  });

  // ===== PHASE 4: LAZY-LOAD ALL MODULES =====
  // Each module is loaded dynamically with its own try-catch
  // If one fails, the others still load

  const modules: Record<string, any> = {};

  // 4a: Database
  try {
    const dbMod = await import("./db");
    modules.db = dbMod;
    logStep("Database module");
  } catch (e) {
    logStep("Database module", e as Error);
  }

  // 4b: Auth (needed for protected routes)
  try {
    const authMod = await import("./auth");
    modules.auth = authMod;
    logStep("Auth module");
  } catch (e) {
    logStep("Auth module", e as Error);
  }

  // 4c: Storage (needed for data access)
  try {
    const storageMod = await import("./storage");
    modules.storage = storageMod;
    logStep("Storage module");
  } catch (e) {
    logStep("Storage module", e as Error);
  }

  // 4d: Tenant middleware
  try {
    const tenantMod = await import("./tenant-middleware");
    modules.tenant = tenantMod;
    logStep("Tenant middleware");
  } catch (e) {
    logStep("Tenant middleware", e as Error);
  }

  // 4e: Error utils
  try {
    const errorMod = await import("./error-utils");
    modules.errorUtils = errorMod;
    logStep("Error utils");
  } catch (e) {
    logStep("Error utils", e as Error);
  }

  // 4f: Routes (THE BIG ONE — all API routes)
  try {
    const routesMod = await import("./routes");
    modules.routes = routesMod;
    logStep("Routes module");
  } catch (e) {
    logStep("Routes module", e as Error);
    // If routes fail, add a fallback
    app.use("/api", (req: Request, res: Response) => {
      res.status(503).json({
        error: "API routes temporarily unavailable",
        path: req.path,
        retry: true,
      });
    });
  }

  // 4g: Services (loaded individually so one failure doesn't kill all)
  const serviceNames = [
    "redis", "queue", "feature-flags", "ghl-notifications",
    "ai-cost-tracker", "fb-ban-recovery", "scrape-validator",
    "vehicle-dedup", "webhook-verifier", "external-api-guard",
    "admin-dashboard", "calendar-sync", "ab-testing", "photo-guard",
    "ai-posting-optimizer", "scheduler-integration",
  ];

  for (const svc of serviceNames) {
    try {
      const svcMod = await import(`./services/${svc}`);
      modules[`svc_${svc}`] = svcMod;
      logStep(`Service: ${svc}`);
    } catch (e) {
      logStep(`Service: ${svc}`, e as Error);
    }
  }

  // 4h: Schedulers (only if enabled)
  if (process.env.LOTVIEW_ENABLE_SCHEDULERS !== "false") {
    const schedulers = [
      "./scheduler", "./scheduler.notifications", "./posting-scheduler",
      "./fb-marketplace-service",
    ];
    for (const sch of schedulers) {
      try {
        const schMod = await import(sch);
        logStep(`Scheduler: ${sch}`);
      } catch (e) {
        logStep(`Scheduler: ${sch}`, e as Error);
      }
    }
  }

  // 4i: Setup module (for first-run auto-setup)
  try {
    const setupMod = await import("./setup");
    modules.setup = setupMod;
    logStep("Setup module");
  } catch (e) {
    logStep("Setup module", e as Error);
  }

  // 4j: Runtime readiness (just logs, never throws)
  try {
    const readyMod = await import("./runtime-readiness");
    if (readyMod.logRuntimeReadinessSummary) {
      readyMod.logRuntimeReadinessSummary();
    }
    logStep("Runtime readiness");
  } catch (e) {
    logStep("Runtime readiness", e as Error);
  }

  // ===== PHASE 5: MOUNT ROUTES IF LOADED =====
  if (modules.routes && modules.routes.default) {
    try {
      modules.routes.default(app);
      logStep("Routes mounted");
    } catch (e) {
      logStep("Routes mounted", e as Error);
    }
  } else {
    // Fallback routes when routes.ts fails to load
    app.get("/api", (_req: Request, res: Response) => {
      res.json({
        message: "Lotview API — routes loading in progress",
        status: "degraded",
        available: ["/api/health"],
        errors: startupErrors,
      });
    });
    logStep("Routes mounted (fallback mode)");
  }

  // ===== PHASE 6: STATIC FILES (production) =====
  if (process.env.NODE_ENV === "production") {
    try {
      const path = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      const fs = await import("node:fs");
      const distDir = path.dirname(fileURLToPath(import.meta.url));
      const distPath = path.resolve(distDir, "public");
      const altPath = path.resolve(distDir);

      let servePath = distPath;
      if (!fs.existsSync(servePath) && fs.existsSync(altPath)) {
        servePath = altPath;
      }

      if (fs.existsSync(servePath)) {
        app.use(express.static(servePath));
        app.use("*", (_req: Request, res: Response) => {
          const indexPath = path.resolve(servePath, "index.html");
          if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
          } else {
            res.status(404).json({ error: "Frontend build not found. API is operational." });
          }
        });
        logStep("Static files");
      } else {
        logStep("Static files", "No client build found");
      }
    } catch (e) {
      logStep("Static files", e as Error);
    }
  }

  // ===== PHASE 7: GLOBAL ERROR HANDLERS =====
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[Express Error]", err);
    res.status(500).json({ error: "Internal server error", requestId: Date.now() });
  });

  // ===== PHASE 8: START SERVER =====
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(port, "0.0.0.0", () => {
    console.log(`[Server] Running on port ${port}`);
    console.log(`[Server] Features loaded: ${startupLog.length}`);
    console.log(`[Server] Features failed: ${startupErrors.length}`);
    if (startupErrors.length > 0) {
      console.log(`[Server] Errors: ${startupErrors.join("; ")}`);
    }
  });

  return server;
}

export function log(message: string, source = "app") {
  console.log(`[${source}] ${message}`);
}
