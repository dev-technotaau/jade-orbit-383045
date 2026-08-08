import logger from '../config/logger';
import { schedulerQueue } from './scheduler.queue';

export const TOKEN_CLEANUP_QUEUE_NAME = 'cleanup-tokens';

// Re-export scheduler queue for backward compatibility
export const tokenCleanupQueue = schedulerQueue;

// Run token cleanup daily at 3 AM
schedulerQueue
  .add(
    'cleanup-tokens',
    {},
    {
      repeat: { pattern: '0 3 * * *' },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }
  )
  .catch((err) => {
    logger.error('Failed to add repeatable token cleanup job:', err);
  });

logger.info(`Token Cleanup scheduled on: scheduler-queue`);
