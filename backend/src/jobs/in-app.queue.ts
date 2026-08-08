import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';

export const IN_APP_QUEUE_NAME = 'in-app-queue';

export const inAppQueue = new Queue(IN_APP_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

inAppQueue.on('error', (err) => {
  logger.error('In-App Queue Error:', err);
});

logger.info(`In-App Queue initialized: ${IN_APP_QUEUE_NAME}`);
