export async function enrichInventory(_dealershipId: number): Promise<any> {
  return { enriched: 0, disabled: true };
}

export async function runPhotoEnrichmentSweep(..._args: unknown[]): Promise<{
  processed: 0;
  updated: 0;
  skipped: 0;
  failed: 0;
  terminal: 0;
  disabled: true;
}> {
  return { processed: 0, updated: 0, skipped: 0, failed: 0, terminal: 0, disabled: true };
}
