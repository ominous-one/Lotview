import fs from "node:fs";
import { type Server } from "node:http";
import path from "node:path";

import express, { type Express } from "express";

import runApp from "./app";
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

(async () => {
  logRuntimeReadinessSummary();
  ensureProductionRuntimeRequirements({ processType: "web" });

  if (shouldStartSchedulers()) {
    await startProductionSchedulers();
  } else {
    console.log("[Runtime] LOTVIEW_ENABLE_SCHEDULERS=false, skipping scheduler startup in this process");
  }

  await runApp(serveStatic);
})();
