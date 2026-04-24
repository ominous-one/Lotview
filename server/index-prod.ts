import fs from "node:fs";
import { type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express, { type Express } from "express";

console.log("[Boot] Step 1: Node modules loaded");

import runApp, { log } from "./app";
console.log("[Boot] Step 2: App module loaded");

import { pool } from "./db";
console.log("[Boot] Step 3: DB module loaded");

import { createFBMarketplaceScheduler } from "./fb-marketplace-service";
console.log("[Boot] Step 4: FB marketplace module loaded");

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
console.log("[Boot] Step 5: Scheduler modules loaded");

import { startNotificationsScheduler } from "./scheduler.notifications";
console.log("[Boot] Step 6: Notification scheduler loaded");

import { startPostingScheduler } from "./posting-scheduler";
console.log("[Boot] Step 7: Posting scheduler loaded");

import { ensureProductionRuntimeRequirements, logRuntimeReadinessSummary } from "./runtime-readiness";
console.log("[Boot] Step 8: Runtime readiness module loaded");

const SHUTDOWN_TIMEOUT_MS = 30_000;

console.log("[Boot] Step 9: Constants defined");

export async function serveStatic(app: Express, server: Server) {
  console.log("[Boot] serveStatic() called");
  const distDir = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.resolve(distDir, "public");
  const altPath = path.resolve(distDir);

  console.log(`[Boot] serveStatic: distDir=${distDir}, distPath=${distPath}, altPath=${altPath}`);

  let servePath = distPath;
  if (!fs.existsSync(servePath)) {
    if (fs.existsSync(altPath)) {
      servePath = altPath;
      console.log(`[Boot] serveStatic: Using ${servePath} (dist/public not found)`);
    } else {
      console.warn(`[Boot] serveStatic: No client build found at ${distPath} or ${altPath}. API will still work.`);
      return;
    }
  } else {
    console.log(`[Boot] serveStatic: Using ${servePath}`);
  }

  app.use(express.static(servePath));

  app.use("*", (_req, res) => {
    const indexPath = path.resolve(servePath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: "Client build not found. API is operational." });
    }
  });
  console.log("[Boot] serveStatic: Static routes registered");
}

function shouldStartSchedulers() {
  console.log("[Boot] shouldStartSchedulers() called");
  if (process.env.LOTVIEW_ENABLE_SCHEDULERS !== 'false') {
    const schedulerProcess = process.env.LOTVIEW_SCHEDULER_PROCESS || 'worker';
    console.log(`[Boot] Scheduler config: LOTVIEW_SCHEDULER_PROCESS=${schedulerProcess}`);
    return schedulerProcess === 'web';
  }
  console.log("[Boot] Schedulers disabled via LOTVIEW_ENABLE_SCHEDULERS=false");
  return false;
}

async function startProductionSchedulers() {
  console.log("[Boot] Starting production schedulers...");
  try {
    startInventoryScheduler();
    console.log("[Boot] Inventory scheduler started");
  } catch (e) { console.error("[Boot] Inventory scheduler failed:", e); }

  try {
    startPostingScheduler();
    console.log("[Boot] Posting scheduler started");
  } catch (e) { console.error("[Boot] Posting scheduler failed:", e); }

  try {
    await createFBMarketplaceScheduler();
    console.log("[Boot] FB marketplace scheduler started");
  } catch (e) { console.error("[Boot] FB marketplace scheduler failed:", e); }

  try {
    startMarketAnalysisScheduler();
    console.log("[Boot] Market analysis scheduler started");
  } catch (e) { console.error("[Boot] Market analysis scheduler failed:", e); }

  try {
    startCompetitiveReportScheduler();
    console.log("[Boot] Competitive report scheduler started");
  } catch (e) { console.error("[Boot] Competitive report scheduler failed:", e); }

  try {
    startFacebookCatalogScheduler();
    console.log("[Boot] FB catalog scheduler started");
  } catch (e) { console.error("[Boot] FB catalog scheduler failed:", e); }

  try {
    startGhlSyncScheduler();
    console.log("[Boot] GHL sync scheduler started");
  } catch (e) { console.error("[Boot] GHL sync scheduler failed:", e); }

  try {
    startAutomationScheduler();
    console.log("[Boot] Automation scheduler started");
  } catch (e) { console.error("[Boot] Automation scheduler failed:", e); }

  try {
    startReengagementScheduler();
    console.log("[Boot] Reengagement scheduler started");
  } catch (e) { console.error("[Boot] Reengagement scheduler failed:", e); }

  try {
    startScheduledMessageScheduler();
    console.log("[Boot] Scheduled message scheduler started");
  } catch (e) { console.error("[Boot] Scheduled message scheduler failed:", e); }

  try {
    startNotificationsScheduler();
    console.log("[Boot] Notifications scheduler started");
  } catch (e) { console.error("[Boot] Notifications scheduler failed:", e); }

  console.log("[Boot] All schedulers initialized");
}

function installGracefulShutdown(server: Server) {
  console.log("[Boot] Installing graceful shutdown handlers");
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
  console.log("[Boot] Graceful shutdown handlers installed");
}

// Global error handlers
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Unhandled Rejection] at:", promise, "reason:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[Uncaught Exception]:", error);
});
process.on("exit", (code) => {
  console.log(`[Exit] Process exiting with code ${code}`);
});

(async () => {
  console.log("[Boot] === STARTUP SEQUENCE BEGIN ===");
  try {
    console.log("[Boot] Step 10: Calling logRuntimeReadinessSummary()");
    logRuntimeReadinessSummary();
    console.log("[Boot] Step 11: Calling ensureProductionRuntimeRequirements()");
    ensureProductionRuntimeRequirements({ processType: "web" });
    console.log("[Boot] Step 12: Runtime checks complete");

    if (shouldStartSchedulers()) {
      console.log("[Boot] Step 13: Starting schedulers...");
      await startProductionSchedulers();
    } else {
      console.log("[Boot] Step 13: Skipping schedulers (LOTVIEW_ENABLE_SCHEDULERS not set to web)");
    }

    console.log("[Boot] Step 14: Calling runApp()...");
    const server = await runApp(serveStatic, "web");
    console.log("[Boot] Step 15: runApp() returned successfully");

    installGracefulShutdown(server);
    console.log("[Boot] Step 16: Graceful shutdown installed");

    const port = parseInt(process.env.PORT || "5000", 10);
    console.log(`[Boot] Step 17: Server should be listening on port ${port}`);
    console.log("[Boot] === STARTUP COMPLETE ===");
  } catch (error) {
    console.error("[Boot] [FATAL] Server startup failed:", error instanceof Error ? error.message : String(error));
    console.error(error instanceof Error ? error.stack : "");
    console.log("[Boot] Waiting 5 seconds before exit so logs are flushed...");
    setTimeout(() => process.exit(1), 5000);
  }
})();
