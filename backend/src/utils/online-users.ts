import redis from '../config/redis';
import logger from '../config/logger';

const ONLINE_TTL = 300; // 5 minutes
const ONLINE_SET_KEY = 'online:users';
const onlineUserKey = (userId: string) => `online:user:${userId}`;

/**
 * Mark a user as online (TTL-based presence).
 * Sets individual key + adds to set for counting.
 */
export async function markUserOnline(userId: string): Promise<void> {
  try {
    await redis.set(onlineUserKey(userId), '1', 'EX', ONLINE_TTL);
    await redis.sadd(ONLINE_SET_KEY, userId);
  } catch {
    // Non-critical — presence is best-effort
  }
}

/**
 * Mark a user as offline.
 */
export async function markUserOffline(userId: string): Promise<void> {
  try {
    await redis.del(onlineUserKey(userId));
    await redis.srem(ONLINE_SET_KEY, userId);
  } catch {
    // Non-critical
  }
}

/**
 * Extend online TTL (call on authenticated requests).
 */
export async function extendOnlineTTL(userId: string): Promise<void> {
  try {
    await redis.expire(onlineUserKey(userId), ONLINE_TTL);
  } catch {
    // Non-critical
  }
}

/**
 * Get count of currently online users.
 */
export async function getOnlineCount(): Promise<number> {
  try {
    return await redis.scard(ONLINE_SET_KEY);
  } catch {
    return 0;
  }
}

/**
 * Check if a specific user is online.
 */
export async function isUserOnline(userId: string): Promise<boolean> {
  try {
    return (await redis.exists(onlineUserKey(userId))) === 1;
  } catch {
    return false;
  }
}

/**
 * Clean stale members from the online set.
 * Members whose individual keys have expired should be removed from the set.
 */
export async function cleanStaleOnlineUsers(): Promise<number> {
  try {
    const members = await redis.smembers(ONLINE_SET_KEY);
    let removed = 0;
    for (const userId of members) {
      const exists = await redis.exists(onlineUserKey(userId));
      if (!exists) {
        await redis.srem(ONLINE_SET_KEY, userId);
        removed++;
      }
    }
    if (removed > 0) {
      logger.debug(`Cleaned ${removed} stale online user entries`);
    }
    return removed;
  } catch {
    return 0;
  }
}
