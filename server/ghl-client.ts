type DisabledResult = {
  success: false;
  error: string;
  skipped?: true;
  [key: string]: unknown;
};

function disabled(operation: string): DisabledResult {
  return {
    success: false,
    skipped: true,
    error: `GHL ${operation} is not configured`,
  };
}

export class GHLClient {
  static async getInstanceForDealership(_dealershipId: number): Promise<GHLClient | null> {
    return null;
  }

  static async getInstance(): Promise<GHLClient | null> {
    return null;
  }

  async handleCTAAction(..._args: unknown[]): Promise<DisabledResult> {
    return disabled("CTA sync");
  }

  async syncChatConversation(_params: Record<string, unknown>): Promise<DisabledResult> {
    return disabled("conversation sync");
  }

  async autoSyncChatLead(_params: Record<string, unknown>): Promise<DisabledResult> {
    return disabled("lead sync");
  }
}
