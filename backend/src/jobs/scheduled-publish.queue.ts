import logger from '../config/logger';
import { schedulerQueue } from './scheduler.queue';

export const SCHEDULED_PUBLISH_QUEUE_NAME = 'check-scheduled-jobs';

// Re-export scheduler queue for backward compatibility
export const scheduledPublishQueue = schedulerQueue;

// Check for scheduled jobs every 5 minutes
schedulerQueue
  .add(
    'check-scheduled-jobs',
    {},
    {
      repeat: { pattern: '*/5 * * * *' },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }
  )
  .catch((err) => {
    logger.error('Failed to add repeatable scheduled publish check:', err);
  });

logger.info(`Scheduled Publish scheduled on: scheduler-queue`);
