export async function syncGhlForDealership(..._args: unknown[]): Promise<any> {
  return { success: false, synced: 0, error: "ghl_sync_not_configured" };
}

export async function processGhlSyncQueue(..._args: unknown[]): Promise<any> {
  return { success: false, processed: 0, error: "ghl_sync_not_configured" };
}

export async function runGhlSyncForAllDealerships(..._args: unknown[]): Promise<any> {
  return { success: false, synced: 0, error: "ghl_sync_not_configured" };
}

export default {
  syncGhlForDealership,
  processGhlSyncQueue,
  runGhlSyncForAllDealerships,
};
