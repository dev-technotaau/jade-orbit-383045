import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';
import { streamBillingEvent } from '../services/billing-bigquery-sync.service';
import {
  BIGQUERY_BILLING_QUEUE_NAME,
  type BillingBigQueryJobData,
} from './bigquery-billing-sync.queue';

export function createBigQueryBillingWorker(): Worker {
  const worker = new Worker(
    BIGQUERY_BILLING_QUEUE_NAME,
    async (job: Job<BillingBigQueryJobData>) => {
      const traceCtx = (job.data as unknown as Record<string, unknown>)._traceContext as
        | Record<string, string>
        | undefined;
      return withExtractedContext(
        traceCtx ?? {},
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          await streamBillingEvent({
            eventType: job.data.eventType,
            userId: job.data.userId,
            refType: job.data.refType,
            refId: job.data.refId,
            amountPaise: job.data.amountPaise,
            currency: job.data.currency,
            planCode: job.data.planCode,
            payload: job.data.payload,
          });
          return { streamed: true };
        }
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_BIGQUERY_BILLING_CONCURRENCY ?? '5', 10),
      lockDuration: 60_000,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(`BigQuery billing job ${job?.id} failed: ${err.message}`, {
      eventType: job?.data?.eventType,
    });
  });
  worker.on('completed', (job) => {
    logger.debug(`BigQuery billing job ${job.id} completed`, {
      eventType: job.data?.eventType,
    });
  });

  return worker;
}
