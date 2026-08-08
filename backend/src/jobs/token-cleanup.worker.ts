import type { Job } from 'bullmq';
import logger from '../config/logger';
import { cleanupExpiredTokens } from '../services/token.service';

export async function handleTokenCleanup(job: Job) {
  const TIMEOUT_MS = 60_000;
  const timeoutId = setTimeout(() => {
    /* safety net */
  }, TIMEOUT_MS);
  try {
    logger.info(`Processing token cleanup job ${job.id}`);

    const deletedCount = await Promise.race([
      cleanupExpiredTokens(),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('Token cleanup worker timeout after 60s')), TIMEOUT_MS)
      ),
    ]);
    logger.info(`Token cleanup completed: ${deletedCount} tokens removed`);
    return { deleted: deletedCount };
  } catch (error) {
    logger.error('Token cleanup failed:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
