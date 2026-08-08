/**
 * follower-notify worker — processes the follower-notify queue and
 * fans out notifications to every follower of the company that
 * posted the job.
 *
 * Processing strategy:
 *   - Single Worker connection (one blocking Redis poll).
 *   - Concurrency 5 — most companies have <100 followers, so the
 *     fan-out is bounded; concurrency lets multiple companies'
 *     posts process in parallel.
 *   - Each job calls notifyFollowersOfNewJob which chunks the
 *     follower list internally to avoid hammering the notification
 *     service.
 */
import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { FOLLOWER_NOTIFY_QUEUE, type FollowerNotifyJobData } from './follower-notify.queue';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';

export function createFollowerNotifyWorker(): Worker {
  const concurrency = parseInt(env.BULLMQ_FOLLOWER_NOTIFY_CONCURRENCY || '5', 10);

  const worker = new Worker<FollowerNotifyJobData>(
    FOLLOWER_NOTIFY_QUEUE,
    async (job: Job<FollowerNotifyJobData>) => {
      const traceCtx = (job.data?._traceContext ?? {}) as Record<string, string>;
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          const { companyId, jobId } = job.data;
          if (!companyId || !jobId) {
            logger.warn('follower-notify: missing companyId/jobId — skipping', { jobId: job.id });
            return { skipped: true };
          }
          // Lazy-import the service to keep the worker module's
          // import graph small at boot.
          const { notifyFollowersOfNewJob } = await import('../services/company-follow.service');
          const result = await notifyFollowersOfNewJob(companyId, jobId);
          logger.info(
            `follower-notify: notified ${result.notified} followers · companyId=${companyId} jobId=${jobId}`
          );
          return result;
        }
      );
    },
    {
      connection: redis,
      concurrency,
      lockDuration: 120_000,
    }
  );

  worker.on('completed', (job) => {
    logger.debug(`follower-notify job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    logger.error(`follower-notify job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
