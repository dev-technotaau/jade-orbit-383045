/**
 * follower-notify.queue — fan-out notifications to all followers when
 * a company posts a new job.
 *
 * Enqueued by the createJob success path (jobService) with payload
 * `{ companyId, jobId }`. The worker pages through CompanyFollow and
 * creates one in-app Notification per follower (chunked, rate-limited
 * via the underlying notification.service path).
 *
 * Idempotency: jobId-bound — if the same `(companyId, jobId)` is
 * enqueued twice (e.g. on re-publish), the worker is safe because
 * the notification.service prevents duplicate inserts via the
 * existing dedupe path.
 */
import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { safeJobId } from './job-id';

export const FOLLOWER_NOTIFY_QUEUE = 'follower-notify-queue';

export const followerNotifyQueue = new Queue(FOLLOWER_NOTIFY_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
    // Keep completed jobs for an hour for traceability, then drop.
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 24 * 3600 },
  },
});

followerNotifyQueue.on('error', (err) => {
  logger.error('follower-notify queue error', err);
});

export interface FollowerNotifyJobData {
  companyId: string;
  jobId: string;
  /** Trace context for OTel propagation. */
  _traceContext?: Record<string, unknown>;
}

/**
 * Public helper — call from anywhere (e.g. job.service.createJob)
 * when a job ships and we want followers notified. Fire-and-forget;
 * BullMQ owns delivery + retries.
 */
export async function enqueueFollowerNotify(
  data: Omit<FollowerNotifyJobData, '_traceContext'>
): Promise<void> {
  try {
    await followerNotifyQueue.add('notify-followers', data, {
      // Job id matches (companyId, jobId) so duplicate enqueues
      // collapse into one — BullMQ rejects duplicate ids by default.
      // The bare `a:b` form threw, and the throw was swallowed by the
      // catch below as "non-fatal" — so followers were silently never
      // notified of a new job.
      jobId: safeJobId('follow', data.companyId, data.jobId),
    });
  } catch (err) {
    logger.warn('enqueueFollowerNotify failed (non-fatal)', err);
  }
}
