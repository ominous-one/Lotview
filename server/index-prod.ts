import fs from "node:fs";
import { type Server } from "node:http";
import path from "node:path";

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
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
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

(async () => {
  logRuntimeReadinessSummary();
  ensureProductionRuntimeRequirements({ processType: "web" });

  if (shouldStartSchedulers()) {
    await startProductionSchedulers();
  } else {
    console.log("[Runtime] LOTVIEW_ENABLE_SCHEDULERS=false, skipping scheduler startup in this process");
  }

  const server = await runApp(serveStatic);
  installGracefulShutdown(server);
})();
