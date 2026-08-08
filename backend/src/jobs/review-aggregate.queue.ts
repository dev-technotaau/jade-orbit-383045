/**
 * review-aggregate.queue — refresh the per-company review aggregate
 * (averages, distribution, demographic split, top-job-profiles).
 *
 * Triggered on:
 *   - Review create / update / delete
 *   - Helpful-vote toggle (only changes counts, but cheap to re-run)
 *   - Moderation action (approve / flag / reject / delete)
 *   - Hourly cron via the scheduler queue
 *
 * Idempotent — recomputes the row from scratch from CompanyReview;
 * concurrency 5 keeps fan-in low for popular companies.
 */
import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';

export const REVIEW_AGGREGATE_QUEUE = 'review-aggregate-queue';

export const reviewAggregateQueue = new Queue(REVIEW_AGGREGATE_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 24 * 3600 },
  },
});

reviewAggregateQueue.on('error', (err) => {
  logger.error('review-aggregate queue error', err);
});

export interface ReviewAggregateJobData {
  companyId: string;
  reason?: string;
  _traceContext?: Record<string, unknown>;
}

export async function enqueueReviewAggregateRefresh(
  companyId: string,
  reason: string = 'mutation'
): Promise<void> {
  try {
    // Job-id collapses concurrent requests for the same company
    // within a 5-second debounce window.
    const window = Math.floor(Date.now() / 5000);
    await reviewAggregateQueue.add(
      'refresh',
      { companyId, reason },
      // EXACTLY two colons — BullMQ grandfathers a 3-part id and rejects
      // every other colon count (see jobs/job-id.ts). Left as-is because it
      // works and changing it would reset in-flight dedup keys; if you ever
      // add a segment here, switch to safeJobId() rather than a third colon.
      { jobId: `agg:${companyId}:${window}` }
    );
  } catch (err) {
    logger.warn('enqueueReviewAggregateRefresh failed (non-fatal)', err);
  }
}
