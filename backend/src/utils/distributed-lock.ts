import { redis } from '../config/redis';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';

/**
 * Distributed lock using Redis SETNX.
 * Prevents double-processing of the same resource across multiple instances.
 */

/**
 * Acquire a lock for the given key.
 * @param key - Lock key (e.g. 'lock:job-publish:abc123')
 * @param ttlSeconds - Lock TTL in seconds (auto-expires to prevent deadlocks)
 * @returns Lock value (UUID) if acquired, null if already locked
 */
export async function acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
  const lockValue = uuidv4();
  try {
    const result = await redis.set(key, lockValue, 'EX', ttlSeconds, 'NX');
    if (result === 'OK') {
      return lockValue;
    }
    return null;
  } catch (error) {
    logger.error(`Failed to acquire lock ${key}:`, error);
    return null; // Graceful degradation — allow processing if Redis is down
  }
}

/**
 * Release a lock. Only releases if the value matches (prevents releasing another process's lock).
 * @param key - Lock key
 * @param lockValue - The UUID returned by acquireLock
 */
export async function releaseLock(key: string, lockValue: string): Promise<boolean> {
  try {
    // Lua script for atomic check-and-delete
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await redis.call('EVAL', script, '1', key, lockValue);
    return result === 1;
  } catch (error) {
    logger.error(`Failed to release lock ${key}:`, error);
    return false;
  }
}

/**
 * Renew a lock's TTL. Only renews if the value matches (prevents renewing another process's lock).
 * @param key - Lock key
 * @param lockValue - The UUID returned by acquireLock
 * @param ttlSeconds - New TTL in seconds
 */
export async function renewLock(
  key: string,
  lockValue: string,
  ttlSeconds: number
): Promise<boolean> {
  try {
    // Lua script for atomic check-and-renew
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("expire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    const result = await redis.call('EVAL', script, '1', key, lockValue, String(ttlSeconds));
    return result === 1;
  } catch (error) {
    logger.error(`Failed to renew lock ${key}:`, error);
    return false;
  }
}

/**
 * Execute a function while holding a distributed lock.
 * Returns null if the lock cannot be acquired (resource is already being processed).
 *
 * @param key - Lock key (e.g. 'lock:app:applicationId')
 * @param ttlSeconds - Lock TTL in seconds
 * @param fn - Async function to execute while holding the lock
 * @returns Result of fn, or null if lock was not acquired
 */
export async function withLock<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T | null> {
  const lockValue = await acquireLock(key, ttlSeconds);
  if (!lockValue) {
    return null;
  }

  try {
    return await fn();
  } finally {
    await releaseLock(key, lockValue);
  }
}
