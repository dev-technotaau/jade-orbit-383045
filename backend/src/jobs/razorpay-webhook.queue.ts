import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';

export const RAZORPAY_WEBHOOK_QUEUE_NAME = 'razorpay-webhook';

export interface RazorpayWebhookJobData {
  /** RazorpayWebhookEvent.id */
  eventRowId: string;
  /** Razorpay event name (for log clarity). */
  event: string;
  /** OTel trace context for cross-process span linking (set by sweep, optional otherwise). */
  _traceContext?: Record<string, string>;
}

export const razorpayWebhookQueue = new Queue<RazorpayWebhookJobData>(RAZORPAY_WEBHOOK_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 200,
    removeOnFail: 1000,
  },
});

razorpayWebhookQueue.on('error', (err) => {
  logger.error('Razorpay webhook queue error', err);
});

logger.info(`Razorpay webhook queue initialized: ${RAZORPAY_WEBHOOK_QUEUE_NAME}`);
