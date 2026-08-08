import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { EMAIL_BULK_QUEUE_NAME } from './email-bulk.queue';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';
import { processBulkJob } from '../services/email-bulk.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface BulkJobData {
  jobId: string;
}

/**
 * Processes offloaded bulk-action jobs (large select-all-across-filter
 * mutations). Each BullMQ job carries only the `EmailBulkJob` row id; the
 * service resolves the target ids and applies the op in chunks, writing live
 * progress back to the row.
 */
export function createEmailBulkWorker(): Worker<BulkJobData> {
  const worker = new Worker<BulkJobData>(
    EMAIL_BULK_QUEUE_NAME,
    async (job: Job<BulkJobData>) => {
      const traceCtx = (job.data as any)?._traceContext || {};
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          await processBulkJob(job.data.jobId);
          return { jobId: job.data.jobId };
        }
      );
    },
    {
      connection: redis,
      concurrency: 2,
      lockDuration: 600_000,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(`Email bulk job ${job?.data?.jobId} failed: ${err.message}`);
  });

  return worker;
}
