import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { injectTraceContext } from '../utils/trace-propagation';

export const EMAIL_BULK_QUEUE_NAME = 'email-bulk-queue';

/**
 * Async bulk-action queue. Large select-all-across-filter mutations (delete /
 * tag / status change over up to 200k rows) are offloaded here so the API
 * request returns immediately with a jobId; the worker processes in chunks and
 * writes live progress to the `EmailBulkJob` row (polled by the admin UI).
 */
export const emailBulkQueue = new Queue(EMAIL_BULK_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 1, // idempotency is per-chunk; a blind retry could double-apply loops
    removeOnComplete: true,
    removeOnFail: 100,
  },
});

emailBulkQueue.on('error', (err) => {
  logger.error('Email Bulk Queue Error:', err);
});

logger.info(`Email Bulk Queue initialized: ${EMAIL_BULK_QUEUE_NAME}`);

export async function addBulkActionJob(jobId: string) {
  return emailBulkQueue.add('bulk-action', { jobId, _traceContext: injectTraceContext() });
}
