export interface FBMarketplaceScheduler {
  started: boolean;
  reason: string;
}

const notConfigured = "facebook_marketplace_not_configured";

export class FBMarketplaceService {
  constructor(private readonly dealershipId: number) {}

  async createAccount(..._args: unknown[]): Promise<number> {
    throw new Error(notConfigured);
  }

  async initiateAuth(..._args: unknown[]): Promise<any> {
    return { success: false, error: notConfigured, dealershipId: this.dealershipId };
  }

  async verifyAndSaveSession(..._args: unknown[]): Promise<boolean> {
    return false;
  }

  async getAccountStats(..._args: unknown[]): Promise<any> {
    return {
      dealershipId: this.dealershipId,
      totalAccounts: 0,
      activeAccounts: 0,
      totalPosts: 0,
      postsToday: 0,
    };
  }

  async queueVehicleForPosting(..._args: unknown[]): Promise<number> {
    throw new Error(notConfigured);
  }

  async processQueue(..._args: unknown[]): Promise<any> {
    return { success: false, processed: 0, error: notConfigured };
  }

  async getAccountsByUserId(..._args: unknown[]): Promise<any[]> {
    return [];
  }
}

/**
 * Fail-closed placeholder for Facebook Marketplace scheduling.
 *
 * This module exists so the production bundle can compile while Facebook
 * Marketplace automation remains gated behind explicit certification.
 */
export async function createFBMarketplaceScheduler(): Promise<FBMarketplaceScheduler> {
  const enabled = process.env.FEATURE_FACEBOOK_MARKETPLACE_SCHEDULER === "true";

  if (!enabled) {
    console.log("[FB Marketplace] Scheduler disabled pending production certification");
    return {
      started: false,
      reason: "feature_disabled_pending_certification",
    };
  }

  console.warn("[FB Marketplace] Scheduler feature flag enabled but no certified scheduler implementation is registered");
  return {
    started: false,
    reason: "scheduler_not_certified",
  };
}
