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

  if (shouldStartWorkerSchedulers()) {
    await startWorkerSchedulers();
  } else {
    console.log("[Runtime] Worker scheduler startup skipped for this process");
  }

  console.log("[Runtime] Worker process online");
})();
