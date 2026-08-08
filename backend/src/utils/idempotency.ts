import { redis } from '../config/redis';
import logger from '../config/logger';

const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours

/**
 * Check if a Kafka message has already been processed.
 * @param key - Unique key (e.g. 'topic:partition:offset')
 * @returns true if already processed, false if new
 */
export async function isProcessed(key: string): Promise<boolean> {
  try {
    const exists = await redis.exists(`idempotency:${key}`);
    return exists === 1;
  } catch (error) {
    logger.error(`Idempotency check failed for ${key}:`, error);
    return false; // Graceful degradation: allow processing if Redis is down
  }
}

/**
 * Mark a Kafka message as processed.
 * Uses SETNX to prevent race conditions between consumers.
 * @param key - Unique key (e.g. 'topic:partition:offset')
 */
export async function markProcessed(key: string): Promise<void> {
  try {
    await redis.set(`idempotency:${key}`, '1', 'EX', IDEMPOTENCY_TTL_SECONDS, 'NX');
  } catch (error) {
    logger.error(`Failed to mark message as processed ${key}:`, error);
  }
}
