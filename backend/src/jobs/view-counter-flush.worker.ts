import type { Job } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';

/**
 * Flush Redis view counters to the database in batch.
 * Runs every 5 minutes via the scheduler queue.
 */
export async function handleViewCounterFlush(_job: Job): Promise<{ flushed: number }> {
  const prisma = (await import('../config/prisma')).prisma;
  let flushed = 0;
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'job:views:*', 'COUNT', 100);
    cursor = nextCursor;

    for (const key of keys) {
      try {
        // Atomically get and delete — GETDEL available in Redis 6.2+
        const countStr = (await redis.call('GETDEL', key)) as string | null;
        if (!countStr) continue;

        const count = parseInt(countStr, 10);
        if (count <= 0) continue;

        const jobId = key.replace('job:views:', '');
        await prisma.jobPost.update({
          where: { id: jobId },
          data: { views: { increment: count } },
        });
        flushed++;
      } catch (error) {
        // Job may have been deleted — skip silently
        logger.debug(`Failed to flush view counter for ${key}:`, error);
      }
    }
  } while (cursor !== '0');

  if (flushed > 0) {
    logger.info(`Flushed view counters for ${flushed} jobs`);
  }
  return { flushed };
}
