import logger from '../config/logger';
import { schedulerQueue } from './scheduler.queue';

export const JOB_EXPIRATION_QUEUE_NAME = 'check-expired-jobs';

// Re-export scheduler queue for backward compatibility
export const jobExpirationQueue = schedulerQueue;

// Add repeatable job to check for expired jobs every 6 hours
schedulerQueue
  .add(
    'check-expired-jobs',
    {},
    {
      repeat: { pattern: '0 */6 * * *' },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }
  )
  .catch((err) => {
    logger.error('Failed to add repeatable job expiration check:', err);
  });

logger.info(`Job Expiration scheduled on: scheduler-queue`);
