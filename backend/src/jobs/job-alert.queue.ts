import logger from '../config/logger';
import { schedulerQueue } from './scheduler.queue';

export const JOB_ALERT_QUEUE_NAME = 'process-alerts';

// Re-export scheduler queue for backward compatibility
export const jobAlertQueue = schedulerQueue;

// Process job alerts every hour
schedulerQueue
  .add(
    'process-alerts',
    {},
    {
      repeat: { pattern: '0 * * * *' },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }
  )
  .catch((err) => {
    logger.error('Failed to add repeatable job alert processing:', err);
  });

logger.info(`Job Alert scheduled on: scheduler-queue`);
