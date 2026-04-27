export interface InventoryOpsNotificationInput {
  dealershipId?: number | null;
  vehicleId?: number | null;
  type?: string;
  title?: string;
  message: string;
  severity?: "info" | "warning" | "error";
  metadata?: Record<string, unknown>;
}

export async function sendNotification(userId: number, message: string): Promise<void> {
  console.log(`[Notification] user=${userId} message=${message}`);
}

export async function createInventoryOpsNotification(
  input: InventoryOpsNotificationInput,
): Promise<{ id: null; created: false; reason: string }> {
  console.log("[InventoryOpsNotification] notification captured", {
    dealershipId: input.dealershipId ?? null,
    vehicleId: input.vehicleId ?? null,
    type: input.type ?? "inventory_ops",
    severity: input.severity ?? "info",
    message: input.message,
  });

  return {
    id: null,
    created: false,
    reason: "notification_persistence_not_configured",
  };
}
