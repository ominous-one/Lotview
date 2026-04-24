import express from "express";
import http from "http";

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
      startupLog,
      startupErrors,
      featuresLoaded: startupLog.length,
      featuresFailed: startupErrors.length,
    });
  });

  // Phase 3: Dynamically load modules one by one
  const modules = [
    "./db",
    "./auth",
    "./storage",
    "./routes",
    "./tenant-middleware",
    "./error-utils",
    "./utils/crypto",
  ];

  const loaded: Record<string, any> = {};
  for (const modPath of modules) {
    try {
      const modName = modPath.replace("./", "").replace("/", "_");
      const m = await import(modPath);
      loaded[modName] = m;
      logStep(modName);
    } catch (e) {
      logStep(modPath.replace("./", ""), (e as Error).message);
    }
  }

  // Phase 4: Mount routes if available
  if (loaded["routes"] && loaded["routes"].default) {
    try {
      loaded["routes"].default(app);
      logStep("Routes mounted");
    } catch (e) {
      logStep("Routes mounted", (e as Error).message);
    }
  } else {
    app.use("/api", (req, res) => {
      res.status(503).json({
        error: "API routes unavailable",
        path: req.path,
        startupErrors,
      });
    });
    logStep("Routes fallback");
  }

  // Phase 5: Static files
  if (process.env.NODE_ENV === "production") {
    try {
      const path = await import("path");
      const { fileURLToPath } = await import("url");
      const fs = await import("fs");
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
            res.status(404).json({ error: "Frontend not built" });
          }
        });
        logStep("Static files");
      } else {
        logStep("Static files", "No build directory");
      }
    } catch (e) {
      logStep("Static files", (e as Error).message);
    }
  }

  // Phase 6: Error handler
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error("[Error]", err);
    res.status(500).json({ error: "Internal error" });
  });

  // Phase 7: Start server
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
