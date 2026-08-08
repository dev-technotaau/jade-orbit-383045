import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';

export const WEB_PUSH_QUEUE_NAME = 'web-push-queue';

export const webPushQueue = new Queue(WEB_PUSH_QUEUE_NAME, {
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

webPushQueue.on('error', (err) => {
  logger.error('Web Push Queue Error:', err);
});

logger.info(`Web Push Queue initialized: ${WEB_PUSH_QUEUE_NAME}`);
