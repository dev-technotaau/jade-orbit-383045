import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';

/**
 * Combined scheduler queue for all periodic/cron jobs.
 * Instead of 8 separate queues (each requiring its own Worker + blocking
 * Redis connection), all periodic tasks funnel through this single queue
 * with distinct job names. One Worker processes them all, cutting Redis
 * connections from 8 → 1 (critical for Redis Cloud free-tier limits).
 */
export const SCHEDULER_QUEUE_NAME = 'scheduler-queue';

export const schedulerQueue = new Queue(SCHEDULER_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

schedulerQueue.on('error', (err) => {
  logger.error('Scheduler Queue Error:', err);
});

logger.info(`Scheduler Queue initialized: ${SCHEDULER_QUEUE_NAME}`);
