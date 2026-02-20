import { storage } from "./storage";

export const FEATURE_FLAGS = {
  ENABLE_APPRAISAL_AUTOSAVE: 'feature_appraisal_autosave',
  ENABLE_GHL_MESSENGER_SYNC: 'feature_ghl_messenger_sync',
} as const;

export type FeatureFlagKey = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS];

const featureFlagCache: Map<string, { value: boolean; expiresAt: number }> = new Map();
const CACHE_TTL_MS = 60000; // 1 minute cache

export async function isFeatureEnabled(flagKey: FeatureFlagKey, dealershipId?: number): Promise<boolean> {
  const cacheKey = dealershipId ? `${flagKey}:${dealershipId}` : flagKey;
  const now = Date.now();
  
  const cached = featureFlagCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  
  try {
    // First check dealership-specific override if dealershipId provided
    if (dealershipId) {
      const dealershipKey = `${flagKey}:dealership:${dealershipId}`;
      const dealershipSetting = await storage.getGlobalSetting(dealershipKey);
      if (dealershipSetting) {
        const value = dealershipSetting.value.toLowerCase() === 'true' || dealershipSetting.value === '1';
        featureFlagCache.set(cacheKey, { value, expiresAt: now + CACHE_TTL_MS });
        return value;
      }
    }
    
    // Fall back to global setting
    const setting = await storage.getGlobalSetting(flagKey);
    
    // Default to enabled if not set (feature on by default)
    const value = setting ? (setting.value.toLowerCase() === 'true' || setting.value === '1') : true;
    
    featureFlagCache.set(cacheKey, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  } catch (error) {
    console.error(`[FeatureFlags] Error checking flag ${flagKey}:`, error);
    // Default to enabled on error to avoid blocking features
    return true;
  }
}

export async function setFeatureFlag(flagKey: FeatureFlagKey, enabled: boolean, dealershipId?: number, updatedBy?: number): Promise<void> {
  const key = dealershipId ? `${flagKey}:dealership:${dealershipId}` : flagKey;
  
  await storage.setGlobalSetting({
    key,
    value: enabled ? 'true' : 'false',
    description: `Feature flag: ${flagKey}${dealershipId ? ` for dealership ${dealershipId}` : ' (global)'}`,
    isSecret: false,
    updatedBy: updatedBy || null,
  });
  
  // Clear cache
  const cacheKey = dealershipId ? `${flagKey}:${dealershipId}` : flagKey;
  featureFlagCache.delete(cacheKey);
}

export function clearFeatureFlagCache(): void {
  featureFlagCache.clear();
}
