import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { injectTraceContext } from '../utils/trace-propagation';

export const BIGQUERY_BILLING_QUEUE_NAME = 'bigquery-billing-sync';

/**
 * Async streaming queue for billing analytics events.
 *
 * Replaces direct fire-and-forget calls to `streamBillingEvent` from
 * `billing-notification.service.ts`. Using a queue gives us:
 *   - Retry on transient BigQuery errors (3 attempts, exponential backoff)
 *   - Dead-letter visibility (`removeOnFail: false`)
 *   - Back-pressure control (`BULLMQ_BIGQUERY_BILLING_CONCURRENCY`)
 *   - Single consolidation point for OTel/Prometheus metrics
 *
 * Producers call `enqueueBillingBigQueryEvent({...})` instead of importing
 * `streamBillingEvent` directly.
 */
export const bigqueryBillingQueue = new Queue(BIGQUERY_BILLING_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: false, // keep dead-letter for super-admin replay
  },
});

bigqueryBillingQueue.on('error', (err) => {
  logger.error('BigQuery billing queue error:', err);
});

logger.info(`Queue initialized: ${BIGQUERY_BILLING_QUEUE_NAME}`);

export interface BillingBigQueryJobData {
  eventType: string;
  userId?: string;
  refType?: string;
  refId?: string;
  amountPaise?: number;
  currency?: string;
  planCode?: string;
  payload?: Record<string, unknown>;
}

export async function enqueueBillingBigQueryEvent(data: BillingBigQueryJobData): Promise<void> {
  await bigqueryBillingQueue
    .add('stream-event', { ...data, _traceContext: injectTraceContext() })
    .catch((err) => {
      // Never let analytics enqueue failures break the calling path
      logger.warn('Failed to enqueue BigQuery billing event (non-fatal)', {
        eventType: data.eventType,
        err: err instanceof Error ? err.message : err,
      });
    });
}
