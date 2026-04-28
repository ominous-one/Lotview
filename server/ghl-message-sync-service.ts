export async function syncMessages(_dealershipId: number): Promise<any[]> {
  return [];
}

export function createGhlMessageSyncService(_dealershipId: number): any {
  return {
    async syncMetadataToGhl() {
      return { synced: false, reason: "ghl_message_sync_not_configured" };
    },
    async handleInboundGhlMessage() {
      return { handled: false, reason: "ghl_message_sync_not_configured" };
    },
    async handleGhlContactUpdate() {
      return { handled: false, reason: "ghl_message_sync_not_configured" };
    },
    async handleGhlOpportunityUpdate() {
      return { handled: false, reason: "ghl_message_sync_not_configured" };
    },
  };
}
