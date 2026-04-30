export async function processOutbox(): Promise<void> { }
export async function processEmailOutboxBatch(..._args: unknown[]): Promise<any> {
  return { processed: 0, sent: 0, failed: 0 };
}
