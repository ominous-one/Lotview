import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Core modules — these are safe at load time (fixes already applied)
import { db, pool } from "./db";
import * as auth from "./auth";
import { storage } from "./storage";
import { logError, logInfo, logWarn } from "./error-utils";

const app = express();

export default async function runApp(_serveStatic?: any, _processType?: string): Promise<any> {
  const server = http.createServer(app);
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

  // Phase 1: Basic middleware
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  logStep("Body parsing");

  // Phase 2: Health endpoint
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      time: new Date().toISOString(),
      uptime: process.uptime(),
      database: db ? "connected" : "not configured",
      startupLog,
      startupErrors,
      featuresLoaded: startupLog.length,
      featuresFailed: startupErrors.length,
    });
  });

  // Phase 3: Load minimal safe routes
  try {
    const routesModule = await import("./routes-minimal");
    if (routesModule.default && typeof routesModule.default === "function") {
      await routesModule.default(app);
      logStep("Routes mounted");
    } else {
      logStep("Routes mounted", "routes.default is not a function");
      setupFallbackRoutes(app, startupErrors);
    }
  } catch (e) {
    logStep("Routes mounted", e instanceof Error ? e.message : String(e));
    console.error("[Routes Error]", e);
    setupFallbackRoutes(app, startupErrors);
  }

  // Phase 4: Static files (production)
  if (process.env.NODE_ENV === "production") {
    try {
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
          const idxPath = path.resolve(servePath, "index.html");
          if (fs.existsSync(idxPath)) {
            res.sendFile(idxPath);
          } else {
            res.status(404).json({ error: "Frontend not built. API operational." });
          }
        });
        logStep("Static files");
      } else {
        logStep("Static files", "No build directory");
      }
    } catch (e) {
      logStep("Static files", e instanceof Error ? e.message : String(e));
    }
  }

  // Phase 5: Global error handler
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error("[Express Error]", err);
    res.status(500).json({ error: "Internal error", requestId: Date.now() });
  });

  // Phase 6: Start server
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

function setupFallbackRoutes(app: express.Express, startupErrors: string[]) {
  app.get("/api", (_req, res) => {
    res.json({
      message: "Lotview API — routes loading in progress",
      status: "degraded",
      available: ["/api/health"],
      errors: startupErrors,
    });
  });

  app.use("/api/*", (req, res) => {
    res.status(503).json({
      error: "API routes temporarily unavailable",
      path: req.path,
      retry: true,
      errors: startupErrors,
    });
  });
}

export function log(message: string, source = "app") {
  console.log(`[${source}] ${message}`);
}
