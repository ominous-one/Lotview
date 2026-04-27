export interface FBMarketplaceScheduler {
  started: boolean;
  reason: string;
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
