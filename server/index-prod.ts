import fs from "node:fs";
import { type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express, { type Express } from "express";

import runApp, { log } from "./app";
import { pool } from "./db";
import { createFBMarketplaceScheduler } from "./fb-marketplace-service";
import {
  startInventoryScheduler,
  startMarketAnalysisScheduler,
  startFacebookCatalogScheduler,
  startGhlSyncScheduler,
  startAutomationScheduler,
  startReengagementScheduler,
  startScheduledMessageScheduler,
  startCompetitiveReportScheduler,
} from "./scheduler";
import { startNotificationsScheduler } from "./scheduler.notifications";
import { startPostingScheduler } from "./posting-scheduler";
import { ensureProductionRuntimeRequirements, logRuntimeReadinessSummary } from "./runtime-readiness";

const SHUTDOWN_TIMEOUT_MS = 30_000;

export async function serveStatic(app: Express, server: Server) {
  const distDir = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.resolve(distDir, "public");
  const altPath = path.resolve(distDir); // vite puts files in dist/ directly

  // Try dist/public first, then dist/ directly
  let servePath = distPath;
  if (!fs.existsSync(servePath)) {
    if (fs.existsSync(altPath)) {
      servePath = altPath;
      console.log(`[Static] Using ${servePath} (dist/public not found)`);
    } else {
      console.warn(`[Static] No client build found at ${distPath} or ${altPath}. API will still work, but frontend won't load.`);
      return;
    }
  }

  app.use(express.static(servePath));

  app.use("*", (_req, res) => {
    const indexPath = path.resolve(servePath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: "Client build not found. API is operational, but frontend is not built." });
    }
  });
}

function shouldStartSchedulers() {
  if (process.env.LOTVIEW_ENABLE_SCHEDULERS !== 'false') {
    const schedulerProcess = process.env.LOTVIEW_SCHEDULER_PROCESS || 'worker';
    return schedulerProcess === 'web';
  }

  return false;
}

async function startProductionSchedulers() {
  console.log("[Runtime] Starting production schedulers");
  startInventoryScheduler();
  startPostingScheduler();
  await createFBMarketplaceScheduler();
  startMarketAnalysisScheduler();
  startCompetitiveReportScheduler();
  startFacebookCatalogScheduler();
  startGhlSyncScheduler();
  startAutomationScheduler();
  startReengagementScheduler();
  startScheduledMessageScheduler();
  startNotificationsScheduler();
}

function installGracefulShutdown(server: Server) {
  let shuttingDown = false;
  let shutdownTimer: NodeJS.Timeout | undefined;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      log(`Ignoring ${signal}; shutdown already in progress`, "shutdown");
      return;
    }

    shuttingDown = true;
    log(`Received ${signal}; starting graceful shutdown`, "shutdown");

    shutdownTimer = setTimeout(() => {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        source: "shutdown",
        message: `Graceful shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms`,
      }));
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    shutdownTimer.unref();

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      log("HTTP server closed", "shutdown");

      await pool.end();
      log("Database pool closed", "shutdown");

      if (shutdownTimer) {
        clearTimeout(shutdownTimer);
      }

      log("Graceful shutdown complete", "shutdown");
      process.exit(0);
    } catch (error) {
      if (shutdownTimer) {
        clearTimeout(shutdownTimer);
      }

      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        source: "shutdown",
        message: error instanceof Error ? error.message : "Graceful shutdown failed",
        stack: error instanceof Error ? error.stack : undefined,
      }));
      process.exit(1);
    }
  };

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

// Global error handlers - prevent crashes from any unhandled errors
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Unhandled Rejection] at:", promise, "reason:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[Uncaught Exception]:", error);
});

(async () => {
  try {
    logRuntimeReadinessSummary();
    ensureProductionRuntimeRequirements({ processType: "web" });

    if (shouldStartSchedulers()) {
      await startProductionSchedulers();
    } else {
      console.log("[Runtime] LOTVIEW_ENABLE_SCHEDULERS=false, skipping scheduler startup in this process");
    }

    const server = await runApp(serveStatic, "web");
    installGracefulShutdown(server);

    const port = parseInt(process.env.PORT || "5000", 10);
    console.log(`[Server] Started on port ${port}`);
  } catch (error) {
    console.error("[FATAL] Server startup failed:", error instanceof Error ? error.message : String(error));
    console.error(error instanceof Error ? error.stack : "");
    // Keep process alive so logs are visible, then exit after 5 seconds
    setTimeout(() => process.exit(1), 5000);
  }
})();
