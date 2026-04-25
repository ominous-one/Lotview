/**
 * Re-export feature-flags from services for backward compatibility
 */
export { initializeFlagsFromEnv, isEnabled, isFeatureEnabled } from "./services/feature-flags";
export const FEATURE_FLAGS = {
  VEHICLE_DEDUP: "vehicle_deduplication",
  CLOUD_CARFAX: "cloud_carfax_scraper",
  AI_POSTING_OPTIMIZER: "ai_posting_optimizer",
  GHL_FALLBACK_SMS: "ghl_fallback_sms",
  APPOINTMENT_REMINDERS: "appointment_reminders",
  AI_CHAT: "ai_chat",
  AUTO_POST: "auto_post",
  COMPETITIVE_REPORTS: "competitive_reports",
  FB_BAN_RECOVERY: "fb_ban_recovery",
  AB_TESTING: "ab_testing",
} as const;
