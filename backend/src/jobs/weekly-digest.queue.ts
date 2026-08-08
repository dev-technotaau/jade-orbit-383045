import logger from '../config/logger';
import { schedulerQueue } from './scheduler.queue';

export const WEEKLY_DIGEST_QUEUE_NAME = 'send-weekly-digest';

// Re-export scheduler queue for backward compatibility
export const weeklyDigestQueue = schedulerQueue;

// Run weekly digest every Monday at 9:00 AM
schedulerQueue
  .add(
    'send-weekly-digest',
    {},
    {
      repeat: { pattern: '0 9 * * 1' },
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
    }
  )
  .catch((err) => {
    logger.error('Failed to add repeatable weekly digest:', err);
  });

logger.info(`Weekly Digest scheduled on: scheduler-queue`);
