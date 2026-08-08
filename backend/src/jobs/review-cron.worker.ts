/**
 * Handlers for the review-related scheduled jobs (registered in
 * review-cron.queue.ts and dispatched by scheduler.worker.ts).
 */
import type { Job } from 'bullmq';
import logger from '../config/logger';
import { prisma } from '../config/prisma';
import { refreshIndustryAverages } from '../services/industry-avg.service';
import { enqueueReviewAggregateRefresh } from './review-aggregate.queue';

/**
 * Recompute industry-level averages — populates the redis cache used
 * by the per-company aggregate row.
 */
export async function handleReviewIndustryAverages(_job: Job): Promise<{ updated: number }> {
  const result = await refreshIndustryAverages();
  return result;
}

/**
 * Walk every aggregate older than 24h and enqueue a fresh refresh.
 * Catches drift from missed mutation triggers (rare, but defensive).
 */
export async function handleReviewAggregateSweep(_job: Job): Promise<{ enqueued: number }> {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  const stale = await prisma.companyReviewAggregate.findMany({
    where: { refreshedAt: { lt: cutoff } },
    select: { companyId: true },
    take: 500,
  });
  for (const row of stale) {
    void enqueueReviewAggregateRefresh(row.companyId, 'cron_sweep').catch(() => {});
  }
  logger.info(`review-aggregate sweep enqueued ${stale.length} refreshes`);
  return { enqueued: stale.length };
}
