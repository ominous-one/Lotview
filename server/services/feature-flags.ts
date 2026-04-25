/**
 * Feature Flags
 * Centralized feature flag management with environment variable support
 * and per-dealership overrides.
 *
 * Critical flags that were hardcoded or missing:
 * - ENABLE_AUTOPOST_QUEUE (was missing — defaults to false)
 * - ENABLE_COMPETITIVE_REPORT_SCHEDULER (was missing — defaults to false)
 */

import { getRedisClient } from "./redis";
import { logInfo, logWarn } from "../error-utils";
import { storage } from "../storage";

// ---- Flag Definitions ----

interface FeatureFlag {
  key: string;
  defaultValue: boolean;
  description: string;
  requiresRestart?: boolean;
}

export const FEATURE_FLAGS: Record<string, FeatureFlag> = {
  autopost_queue: {
    key: "autopost_queue",
    defaultValue: false, // SAFETY: disabled by default, must be explicitly enabled
    description: "Automatically post eligible vehicles to Facebook Marketplace",
    requiresRestart: false,
  },
  competitive_report_scheduler: {
    key: "competitive_report_scheduler",
    defaultValue: false,
    description: "Generate competitive pricing reports daily",
    requiresRestart: false,
  },
  ai_cost_tracking: {
    key: "ai_cost_tracking",
    defaultValue: true,
    description: "Track AI API costs per dealership",
    requiresRestart: false,
  },
  scrape_validation: {
    key: "scrape_validation",
    defaultValue: true,
    description: "Validate scrape quality before storing",
    requiresRestart: false,
  },
  vehicle_deduplication: {
    key: "vehicle_deduplication",
    defaultValue: true,
    description: "Prevent duplicate vehicles via VIN dedup",
    requiresRestart: false,
  },
  photo_guard: {
    key: "photo_guard",
    defaultValue: true,
    description: "Protect manual photos from enrichment overwrite",
    requiresRestart: false,
  },
  webhook_verification: {
    key: "webhook_verification",
    defaultValue: true,
    description: "Verify webhook signatures for security",
    requiresRestart: false,
  },
  ghl_email_notifications: {
    key: "ghl_email_notifications",
    defaultValue: true,
    description: "Send emails through GHL integration",
    requiresRestart: false,
  },
  scrape_failure_alerts: {
    key: "scrape_failure_alerts",
    defaultValue: true,
    description: "Alert dealership when scraping fails",
    requiresRestart: false,
  },
  external_api_rate_limiting: {
    key: "external_api_rate_limiting",
    defaultValue: true,
    description: "Rate limit external API endpoints",
    requiresRestart: false,
  },
  facebook_messenger_api: {
    key: "facebook_messenger_api",
    defaultValue: false,
    description: "Enable Facebook Messenger auto-reply API",
    requiresRestart: false,
  },
  ai_model_router: {
    key: "ai_model_router",
    defaultValue: false,
    description: "Use multi-provider AI router with automatic fallback",
    requiresRestart: false,
  },
  calendar_sync: {
    key: "calendar_sync",
    defaultValue: false,
    description: "Sync appointments with Google/Outlook calendars",
    requiresRestart: false,
  },
  ab_testing_followups: {
    key: "ab_testing_followups",
    defaultValue: false,
    description: "A/B testing for follow-up sequences",
    requiresRestart: false,
  },
  cdn_assets: {
    key: "cdn_assets",
    defaultValue: false,
    description: "Serve static assets from CDN",
    requiresRestart: true,
  },
  read_replicas: {
    key: "read_replicas",
    defaultValue: false,
    description: "Use database read replicas for read queries",
    requiresRestart: true,
  },
};

// ---- Core Functions ----

/**
 * Check if a feature flag is enabled.
 * Priority: env var > per-dealership override > default
 */
export async function isEnabled(flagKey: string, dealershipId?: number): Promise<boolean> {
  const flag = FEATURE_FLAGS[flagKey];
  if (!flag) {
    logWarn(`[FeatureFlag] Unknown flag: ${flagKey}`);
    return false;
  }

  // 1. Environment variable (global override)
  const envKey = `ENABLE_${flagKey.toUpperCase()}`;
  const envValue = process.env[envKey];
  if (envValue !== undefined) {
    return envValue === "true" || envValue === "1";
  }

  // 2. Per-dealership override (from Redis)
  if (dealershipId) {
    const redis = getRedisClient();
    const override = await redis.get(`flag:${flagKey}:${dealershipId}`);
    if (override !== null) {
      return override === "1";
    }
  }

  // 3. Default value
  return flag.defaultValue;
}

/**
 * Enable a feature flag globally.
 */
export async function enable(flagKey: string): Promise<void> {
  const redis = getRedisClient();
  await redis.set(`flag:global:${flagKey}`, "1");
  logInfo(`[FeatureFlag] Enabled globally: ${flagKey}`);
}

/**
 * Disable a feature flag globally.
 */
export async function disable(flagKey: string): Promise<void> {
  const redis = getRedisClient();
  await redis.set(`flag:global:${flagKey}`, "0");
  logInfo(`[FeatureFlag] Disabled globally: ${flagKey}`);
}

/**
 * Set per-dealership override.
 */
export async function setDealershipFlag(
  flagKey: string,
  dealershipId: number,
  enabled: boolean
): Promise<void> {
  const redis = getRedisClient();
  await redis.set(`flag:${flagKey}:${dealershipId}`, enabled ? "1" : "0");
  logInfo(`[FeatureFlag] Set ${flagKey}=${enabled} for dealership ${dealershipId}`);
}

/**
 * Get all feature flags with current values.
 */
export async function getAllFlags(dealershipId?: number): Promise<
  Array<{
    key: string;
    description: string;
    enabled: boolean;
    defaultValue: boolean;
    source: "env" | "dealership" | "global" | "default";
  }>
> {
  const results = [];

  for (const [key, flag] of Object.entries(FEATURE_FLAGS)) {
    const envKey = `ENABLE_${key.toUpperCase()}`;
    const envValue = process.env[envKey];
    let enabled = flag.defaultValue;
    let source: "env" | "dealership" | "global" | "default" = "default";

    if (envValue !== undefined) {
      enabled = envValue === "true" || envValue === "1";
      source = "env";
    } else if (dealershipId) {
      const redis = getRedisClient();
      const override = await redis.get(`flag:${key}:${dealershipId}`);
      if (override !== null) {
        enabled = override === "1";
        source = "dealership";
      } else {
        const global = await redis.get(`flag:global:${key}`);
        if (global !== null) {
          enabled = global === "1";
          source = "global";
        }
      }
    }

    results.push({
      key,
      description: flag.description,
      enabled,
      defaultValue: flag.defaultValue,
      source,
    });
  }

  return results;
}

/**
 * Initialize feature flags from environment variables.
 * Call this at application startup.
 */
export function initializeFlagsFromEnv(): void {
  logInfo("[FeatureFlag] Initializing from environment variables");

  for (const [key, flag] of Object.entries(FEATURE_FLAGS)) {
    const envKey = `ENABLE_${key.toUpperCase()}`;
    const envValue = process.env[envKey];

    if (envValue !== undefined) {
      const enabled = envValue === "true" || envValue === "1";
      logInfo(`[FeatureFlag] ${key}: ${enabled} (from ${envKey})`);
    } else {
      logInfo(`[FeatureFlag] ${key}: ${flag.defaultValue} (default)`);
    }
  }

  // Critical safety check
  if (isEnabledSync("autopost_queue")) {
    logInfo("[FeatureFlag] AUTOPOST QUEUE IS ENABLED — vehicles will auto-post to Facebook");
  } else {
    logWarn("[FeatureFlag] Autopost queue is DISABLED — set ENABLE_AUTOPOST_QUEUE=true to enable");
  }
}

// Synchronous version for startup checks (no Redis)
function isEnabledSync(flagKey: string): boolean {
  const flag = FEATURE_FLAGS[flagKey];
  if (!flag) return false;

  const envKey = `ENABLE_${flagKey.toUpperCase()}`;
  const envValue = process.env[envKey];
  if (envValue !== undefined) {
    return envValue === "true" || envValue === "1";
  }

  return flag.defaultValue;
}
