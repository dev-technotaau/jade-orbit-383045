import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { schedulerQueue } from './scheduler.queue';
import { injectTraceContext } from '../utils/trace-propagation';

export const PAYMENT_STATUS_POLL_QUEUE_NAME = 'payment-status-poll';

/**
 * Payment-status-poll queue — defensive net for the case where Razorpay's
 * webhook never lands (rare, but documented in the plan §13 risk table).
 *
 * Per-order job lifecycle:
 *   - Enqueued by `order.service.createOrder()` with a 30-second delay.
 *   - Worker fetches the latest payments for the order via Razorpay API.
 *   - If a CAPTURED payment is found that we don't have locally → calls
 *     `recordPayment(...)` directly (same path as the webhook handler).
 *   - Re-enqueues itself every 30s for up to 30m (60 polls), then gives up.
 *
 * Cron also runs every 5 min as a safety sweep for orders the explicit
 * job missed (Redis restart, queue drain, etc.).
 */
export const paymentStatusPollQueue = new Queue(PAYMENT_STATUS_POLL_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 1, // we manage retries via re-enqueue with delay
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});

paymentStatusPollQueue.on('error', (err) => {
  logger.error('Payment status poll queue error:', err);
});

logger.info(`Queue initialized: ${PAYMENT_STATUS_POLL_QUEUE_NAME}`);

/** Per-order poll job. */
export async function enqueuePaymentStatusPoll(args: {
  orderId: string;
  attempt?: number; // 0..59
  delayMs?: number; // default 30s
}): Promise<void> {
  const attempt = args.attempt ?? 0;
  if (attempt >= 60) return; // 30m cap
  await paymentStatusPollQueue.add(
    'poll-order',
    { orderId: args.orderId, attempt, _traceContext: injectTraceContext() },
    { delay: args.delayMs ?? 30_000 }
  );
}

// Sweeper cron — every 5 min, picks up any CREATED/ATTEMPTED orders the
// per-order job stream may have missed.
schedulerQueue
  .add('payment-status-sweep', {}, { repeat: { pattern: '*/5 * * * *' } })
  .then(() => logger.info('Registered payment-status-sweep cron: */5 * * * *'))
  .catch((err) => logger.error('Failed to register payment-status-sweep cron:', err));
