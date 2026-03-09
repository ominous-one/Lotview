import fs from "node:fs";
import { type Server } from "node:http";
import path from "node:path";

import express, { type Express, type Request } from "express";

import runApp from "./app";
import { startInventoryScheduler, startMarketAnalysisScheduler, startFacebookCatalogScheduler, startGhlSyncScheduler, startAutomationScheduler, startReengagementScheduler, startScheduledMessageScheduler, startCompetitiveReportScheduler } from "./scheduler";
import { startNotificationsScheduler } from "./scheduler.notifications";
import { startPostingScheduler } from "./posting-scheduler";

export async function serveStatic(app: Express, server: Server) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

(async () => {
  // Start the inventory scheduler
  startInventoryScheduler();
  
  // Start the Facebook posting scheduler
  startPostingScheduler();
  
  // Start the market analysis scheduler
  startMarketAnalysisScheduler();

  // Start the competitive report scheduler (every ~48h per dealer)
  startCompetitiveReportScheduler();
  
  // Start the Facebook Catalog auto-sync scheduler
  startFacebookCatalogScheduler();
  
  // Start the GoHighLevel CRM sync scheduler
  startGhlSyncScheduler();
  
  // Start the automation engine scheduler
  startAutomationScheduler();
  
  // Start the re-engagement campaign scheduler
  startReengagementScheduler();
  
  // Start the scheduled message scheduler
  startScheduledMessageScheduler();

  // Start WS4E notifications outbox processor
  startNotificationsScheduler();
  
  await runApp(serveStatic);
})();
