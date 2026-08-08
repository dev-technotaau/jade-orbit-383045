/**
 * review-aggregate worker — recomputes CompanyReviewAggregate for the
 * companyId on the job payload. Idempotent. Concurrency 5.
 */
import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { REVIEW_AGGREGATE_QUEUE, type ReviewAggregateJobData } from './review-aggregate.queue';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';

export function createReviewAggregateWorker(): Worker {
  const concurrency = parseInt(env.BULLMQ_REVIEW_AGGREGATE_CONCURRENCY || '5', 10);

  const worker = new Worker<ReviewAggregateJobData>(
    REVIEW_AGGREGATE_QUEUE,
    async (job: Job<ReviewAggregateJobData>) => {
      const traceCtx = (job.data?._traceContext ?? {}) as Record<string, string>;
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          const { companyId } = job.data;
          if (!companyId) {
            logger.warn('review-aggregate: missing companyId — skipping', {
              jobId: job.id,
            });
            return { skipped: true };
          }
          const { refreshAggregate } = await import('../services/review-aggregate.service');
          await refreshAggregate(companyId);
          logger.debug(`review-aggregate: refreshed for company=${companyId}`);
          return { ok: true };
        }
      );
    },
    {
      connection: redis,
      concurrency,
      lockDuration: 60_000,
    }
  );

  worker.on('completed', (job) => {
    logger.debug(`review-aggregate job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    logger.error(`review-aggregate job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
