import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { injectTraceContext } from '../utils/trace-propagation';

export const FCM_QUEUE_NAME = 'fcm-queue';

export const fcmQueue = new Queue(FCM_QUEUE_NAME, {
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

fcmQueue.on('error', (err) => {
  logger.error('FCM Queue Error:', err);
});

logger.info(`FCM Queue initialized: ${FCM_QUEUE_NAME}`);

export async function addFCMJob(
  data: {
    userId: string;
    title: string;
    body: string;
    data?: Record<string, string>;
  },
  priority?: number
) {
  return fcmQueue.add(
    'send-fcm',
    { ...data, _traceContext: injectTraceContext() },
    priority ? { priority } : {}
  );
}
