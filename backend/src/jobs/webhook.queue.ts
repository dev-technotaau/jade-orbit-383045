import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';

export const WEBHOOK_QUEUE_NAME = 'webhook-delivery';

export const webhookQueue = new Queue(WEBHOOK_QUEUE_NAME, {
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

webhookQueue.on('error', (err) => {
  logger.error('Webhook Queue Error:', err);
});

logger.info(`Webhook Queue initialized: ${WEBHOOK_QUEUE_NAME}`);
