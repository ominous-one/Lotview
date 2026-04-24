import express from "express";

const app = express();

export default async function runApp(_serveStatic?: any, _processType?: string): Promise<any> {
  const server = require("node:http").createServer(app);
  const startupLog: string[] = [];
  const startupErrors: string[] = [];

  function logStep(step: string, error?: Error | string) {
    if (error) {
      const msg = typeof error === "string" ? error : error.message;
      startupErrors.push(`${step}: ${msg}`);
      console.error(`[Startup] ${step} FAILED: ${msg}`);
    } else {
      startupLog.push(`${step}: OK`);
      console.log(`[Startup] ${step} OK`);
    }
  }

  // Phase 1: Basic middleware (using only express builtins)
  try {
    app.use(express.json({ limit: "1mb" }));
    app.use(express.urlencoded({ extended: true, limit: "1mb" }));
    logStep("Body parsing");
  } catch (e) {
    logStep("Body parsing", e as Error);
  }

  // Phase 2: Try to load helmet, cors, rate-limit dynamically
  try {
    const helmet = await import("helmet");
    app.use(helmet.default());
    logStep("Helmet");
  } catch (e) {
    logStep("Helmet", "Not installed or failed to load");
  }

  try {
    const cors = await import("cors");
    app.use(cors.default({ origin: true, credentials: true }));
    logStep("CORS");
  } catch (e) {
    logStep("CORS", "Not installed or failed to load");
  }

  try {
    const { rateLimit } = await import("express-rate-limit");
    app.use("/api/", rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
    logStep("Rate limiting");
  } catch (e) {
    logStep("Rate limiting", "Not installed or failed to load");
  }

  // Phase 3: Health endpoint
  app.get("/api/health", (_req, res) => {
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

  // Phase 4: Dynamically load all server modules
  const moduleList = [
    { name: "Database", path: "./db" },
    { name: "Auth", path: "./auth" },
    { name: "Storage", path: "./storage" },
    { name: "Routes", path: "./routes" },
    { name: "Tenant Middleware", path: "./tenant-middleware" },
    { name: "Error Utils", path: "./error-utils" },
    { name: "Crypto Utils", path: "./utils/crypto" },
  ];

  const loaded: Record<string, any> = {};

  for (const mod of moduleList) {
    try {
      const m = await import(mod.path);
      loaded[mod.name] = m;
      logStep(mod.name);
    } catch (e) {
      logStep(mod.name, e as Error);
    }
  }

  // Phase 5: Mount routes if loaded successfully
  if (loaded["Routes"] && loaded["Routes"].default) {
    try {
      loaded["Routes"].default(app);
      logStep("Routes mounted");
    } catch (e) {
      logStep("Routes mounted", e as Error);
    }
  } else {
    app.use("/api", (req, res) => {
      res.status(503).json({
        error: "API routes temporarily unavailable",
        path: req.path,
        startupErrors,
      });
    });
    logStep("Routes mounted (fallback)");
  }

  // Phase 6: Try to load services
  const services = [
    "redis", "queue", "feature-flags", "ghl-notifications",
    "ai-cost-tracker", "fb-ban-recovery", "scrape-validator",
    "vehicle-dedup", "webhook-verifier", "external-api-guard",
    "admin-dashboard", "calendar-sync", "ab-testing", "photo-guard",
    "ai-posting-optimizer", "scheduler-integration",
  ];

  for (const svc of services) {
    try {
      await import(`./services/${svc}`);
      logStep(`Service: ${svc}`);
    } catch (e) {
      logStep(`Service: ${svc}`, "Not loaded");
    }
  }

  // Phase 7: Static files (production only)
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
        app.use("*", (_req, res) => {
          const indexPath = path.resolve(servePath, "index.html");
          if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
          } else {
            res.status(404).json({ error: "Frontend not built. API operational." });
          }
        });
        logStep("Static files");
      } else {
        logStep("Static files", "No build directory found");
      }
    } catch (e) {
      logStep("Static files", e as Error);
    }
  }

  // Phase 8: Global error handler
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error("[Express Error]", err);
    res.status(500).json({ error: "Internal error", requestId: Date.now() });
  });

  // Phase 9: Start server
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(port, "0.0.0.0", () => {
    console.log(`[Server] Port ${port}`);
    console.log(`[Server] Loaded: ${startupLog.length}, Failed: ${startupErrors.length}`);
    if (startupErrors.length > 0) {
      console.log(`[Server] Errors: ${startupErrors.join("; ")}`);
    }
  });

  return server;
}

export function log(message: string, source = "app") {
  console.log(`[${source}] ${message}`);
}
