import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';

export const MATCHING_QUEUE_NAME = 'matching-queue';

export const matchingQueue = new Queue(MATCHING_QUEUE_NAME, {
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

matchingQueue.on('error', (err) => {
  logger.error('Matching Queue Error:', err);
});

logger.info(`Matching Queue initialized: ${MATCHING_QUEUE_NAME}`);
