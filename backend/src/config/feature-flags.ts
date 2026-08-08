import * as admin from 'firebase-admin';
import logger from './logger';
import { redis } from './redis';

interface FeatureFlagsConfig {
  [key: string]: boolean | string | number;
}

// Default feature flags (fallback if Remote Config fails)
// All service flags default to ON — toggle OFF from Firebase Console to disable at runtime
const defaultFlags: FeatureFlagsConfig = {
  // Core feature toggles
  maintenanceMode: false,
  enableBetaFeatures: true,

  // Search & Matching
  enableElasticsearch: true,
  enableAIMatching: true,
  enableCloudTalent: true,

  // Notifications
  enableEmailNotifications: true,
  enableSMS: true,
  enableWhatsApp: true,
  enableFCM: true,
  enableWebhooks: true,

  // AI & Analytics
  enableDocumentAI: true,
  enableBigQuery: true,

  // Infrastructure
  enableKafka: true,
  enablePresence: true,
  enableFirestoreCounters: true,

  // Config values
  maxUploadSizeMB: 5,
};

let cachedFlags: FeatureFlagsConfig = { ...defaultFlags };
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute — short TTL so maintenance toggle takes effect quickly
const REDIS_FF_KEY = 'ff:all';
const REDIS_FF_TTL = 60; // 60s — matches in-memory TTL

/**
 * Invalidate the feature flags cache so the next fetch hits Firebase directly.
 */
export const invalidateCache = (): void => {
  lastFetchTime = 0;
  redis.del(REDIS_FF_KEY).catch(() => {});
};

/**
 * Fetch feature flags from Firebase Remote Config.
 * Layer 1: in-memory cache (fastest)
 * Layer 2: Redis cache (survives restarts, shared across instances)
 * Layer 3: Firebase Remote Config (source of truth)
 * @param force - bypass both caches and fetch fresh from Firebase
 */
export const fetchFeatureFlags = async (force = false): Promise<FeatureFlagsConfig> => {
  const now = Date.now();

  // Layer 1: Return in-memory cached flags if still valid (unless force refresh)
  if (!force && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedFlags;
  }

  // Layer 2: Try Redis cache before hitting Firebase
  if (!force) {
    try {
      const redisAll = await redis.get(REDIS_FF_KEY);
      if (redisAll) {
        const flags = JSON.parse(redisAll) as FeatureFlagsConfig;
        cachedFlags = flags;
        lastFetchTime = now;
        return flags;
      }
    } catch {
      // Redis unavailable — fall through to Firebase
    }
  }

  // Layer 3: Fetch from Firebase Remote Config (with retry for transient startup failures)
  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const remoteConfig = admin.remoteConfig();
      const template = await remoteConfig.getTemplate();

      const flags: FeatureFlagsConfig = { ...defaultFlags };

      // Parse parameters from template
      // Admin SDK returns { value: string } for explicit values
      if (template.parameters) {
        for (const [key, param] of Object.entries(template.parameters)) {
          const dv = param.defaultValue as { value?: string } | undefined;
          const value = dv?.value;
          if (value === undefined || value === null) continue;

          if (value === 'true' || value === 'false') {
            flags[key] = value === 'true';
          } else if (value !== '' && !isNaN(Number(value))) {
            flags[key] = Number(value);
          } else {
            flags[key] = value;
          }
        }
      }

      cachedFlags = flags;
      lastFetchTime = now;
      logger.info('Feature flags refreshed from Firebase Remote Config');

      // Cache entire flags object in Redis (fire-and-forget)
      redis.set(REDIS_FF_KEY, JSON.stringify(flags), 'EX', REDIS_FF_TTL).catch(() => {});

      return flags;
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      logger.error('Failed to fetch feature flags from Firebase:', error);
      return cachedFlags;
    }
  }

  return cachedFlags;
};

/**
 * Get a specific feature flag value
 */
export const getFlag = async <T extends boolean | string | number | null>(
  key: string,
  defaultValue: T
): Promise<T> => {
  const flags = await fetchFeatureFlags();
  return (flags[key] as T) ?? defaultValue;
};

/**
 * Check if a feature is enabled
 */
export const isFeatureEnabled = async (key: string): Promise<boolean> => {
  return getFlag(key, false);
};

/**
 * Get all feature flags (for admin panel)
 * @param force - bypass cache and fetch fresh from Firebase
 */
export const getAllFlags = async (force = false): Promise<FeatureFlagsConfig> => {
  return fetchFeatureFlags(force);
};

export default { fetchFeatureFlags, getFlag, isFeatureEnabled, getAllFlags, invalidateCache };
