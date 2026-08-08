import logger from '../config/logger';
import { schedulerQueue } from './scheduler.queue';

export const JOB_ENGAGEMENT_NUDGE_QUEUE_NAME = 'send-engagement-nudges';

// Re-export the shared scheduler queue, matching the sibling cron modules.
export const jobEngagementNudgeQueue = schedulerQueue;

// Once a day at 09:30. Daily (not hourly) because the worker's own cooldown is
// measured in days — running more often would just no-op against the lock.
schedulerQueue
  .add(
    'send-engagement-nudges',
    {},
    {
      repeat: { pattern: '30 9 * * *' },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }
  )
  .catch((err) => {
    logger.error('Failed to add repeatable engagement nudge job:', err);
  });

logger.info(`Job Engagement Nudge scheduled on: scheduler-queue`);
