export async function getAutopostQueue(_dealershipId: number): Promise<any[]> {
  return [];
}

export async function evaluateAndEnqueueAutopost(..._args: unknown[]): Promise<{
  enqueued: 0;
  updatedEligibility: 0;
  skipped: 0;
  failed: 0;
  disabled: true;
}> {
  return { enqueued: 0, updatedEligibility: 0, skipped: 0, failed: 0, disabled: true };
}
