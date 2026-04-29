export interface InventoryOpsNotificationInput {
  dealershipId?: number | null;
  eventType?: string;
  eventKey?: string;
  vehicleId?: number | null;
  title?: string;
  body?: string;
  message?: string;
  deepLink?: string;
  metadata?: Record<string, unknown>;
}

export async function sendNotification(_userId: number, _message: string): Promise<void> {
  return;
}

export async function createInventoryOpsNotification(
  _dbOrInput: unknown,
  maybeInput?: InventoryOpsNotificationInput,
): Promise<{ id: null; created: false; reason: string; input: InventoryOpsNotificationInput }> {
  const input = maybeInput ?? (_dbOrInput as InventoryOpsNotificationInput);
  return {
    id: null,
    created: false,
    reason: "notification_persistence_not_configured",
    input,
  };
}
