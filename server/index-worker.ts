import { createServer, type Server } from "node:http";

import {
  startInventoryScheduler,
  startMarketAnalysisScheduler,
  startFacebookCatalogScheduler,
  startGhlSyncScheduler,
  startAutomationScheduler,
  startReengagementScheduler,
  startScheduledMessageScheduler,
} from "./scheduler";
import { createFBMarketplaceScheduler } from "./fb-marketplace-service";
import { startPostingScheduler } from "./posting-scheduler";
import { ensureProductionRuntimeRequirements, logRuntimeReadinessSummary } from "./runtime-readiness";

let healthServer: Server | null = null;

function resolveWorkerHealthPort(): number {
  return parseInt(process.env.WORKER_PORT || process.env.PORT || "5001", 10);
}

function startWorkerHealthServer(): Server {
  const port = resolveWorkerHealthPort();
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", process: "worker" }));
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[Runtime] Worker health server listening on port ${port}`);
  });

  return server;
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[Runtime] Received ${signal}, shutting down worker process`);

  if (healthServer) {
    await new Promise<void>((resolve, reject) => {
      healthServer?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  process.exit(0);
}

process.on("uncaughtException", (error) => {
  console.error("[Runtime] Uncaught exception in worker process", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Runtime] Unhandled rejection in worker process", reason);
  process.exit(1);
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((error) => {
    console.error("[Runtime] Worker shutdown failed", error);
    process.exit(1);
  });
});

process.on("SIGINT", () => {
  shutdown("SIGINT").catch((error) => {
    console.error("[Runtime] Worker shutdown failed", error);
    process.exit(1);
  });
});

async function startWorkerSchedulers() {
  console.log("[Runtime] Starting worker schedulers");
  startInventoryScheduler();
  startPostingScheduler();
  await createFBMarketplaceScheduler();
  startMarketAnalysisScheduler();
  startFacebookCatalogScheduler();
  startGhlSyncScheduler();
  startAutomationScheduler();
  startReengagementScheduler();
  startScheduledMessageScheduler();
}

function shouldStartWorkerSchedulers() {
  if (process.env.LOTVIEW_ENABLE_SCHEDULERS === 'false') {
    return false;
  }

  const schedulerProcess = process.env.LOTVIEW_SCHEDULER_PROCESS || 'worker';
  return schedulerProcess === 'worker';
}

(async () => {
  logRuntimeReadinessSummary();
  ensureProductionRuntimeRequirements({ processType: "worker" });
  healthServer = startWorkerHealthServer();

  if (shouldStartWorkerSchedulers()) {
    await startWorkerSchedulers();
  } else {
    console.log("[Runtime] Worker scheduler startup skipped for this process");
  }

  console.log("[Runtime] Worker process online");
})();
