import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Static imports — safe because crash-causing throws have been removed
import { db, pool } from "./db";
import * as auth from "./auth";
import { storage } from "./storage";
import { requireAuth } from "./tenant-middleware";
import { logError, logInfo, logWarn } from "./error-utils";

const app = express();

export default async function runApp(_serveStatic?: any, _processType?: string): Promise<any> {
  const server = http.createServer(app);

  // Phase 1: Basic middleware
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // Phase 2: Health endpoint (always available)
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      time: new Date().toISOString(),
      uptime: process.uptime(),
      database: db ? "connected" : "not configured",
    });
  });

  // Phase 3: Mount routes (with error isolation)
  try {
    const routes = await import("./routes");
    if (routes.default) {
      routes.default(app);
      console.log("[Startup] Routes mounted");
    }
  } catch (e) {
    console.error("[Startup] Routes failed:", e instanceof Error ? e.message : String(e));
    app.use("/api", (req, res) => {
      res.status(503).json({ error: "API routes unavailable", path: req.path });
    });
  }

  // Phase 4: Static files (production only)
  if (process.env.NODE_ENV === "production") {
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
    }
  }

  // Phase 5: Error handler
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error("[Express Error]", err);
    res.status(500).json({ error: "Internal error" });
  });

  // Phase 6: Start server
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(port, "0.0.0.0", () => {
    console.log(`[Server] Running on port ${port}`);
  });

  return server;
}

export function log(message: string, source = "app") {
  console.log(`[${source}] ${message}`);
}
