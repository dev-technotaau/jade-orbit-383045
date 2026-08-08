import logger from '../config/logger';
import { schedulerQueue } from './scheduler.queue';

export const JOB_RECOMMENDATION_DIGEST_JOB = 'send-job-recommendations';

/**
 * "Jobs for you" — the scheduled recommendation digest.
 *
 * ── Why this ticks DAILY when the default cadence is WEEKLY ──
 * Cadence is a per-user preference (WEEKLY default; DAILY or OFF available),
 * so the cron itself cannot be weekly — that would pin every user to the same
 * rhythm and the same Monday morning. It ticks once a day and
 * `digestPolicy.canSend()` decides, per user, whether they are actually due.
 * A user switching to DAILY therefore starts receiving daily sends with
 * nothing rescheduled.
 *
 * 08:30 is deliberately BEFORE the 09:00 / 09:30 employer crons: candidates
 * get the quieter slot, and the shared daily cap then protects them from a
 * second recurring message later the same morning.
 *
 * Registered on the shared `schedulerQueue` like every other cron — one
 * blocking Redis connection for all periodic work, not one per job.
 */
schedulerQueue
  .add(
    JOB_RECOMMENDATION_DIGEST_JOB,
    {},
    {
      repeat: { pattern: '30 8 * * *' },
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
    }
  )
  .then(() => logger.info('Registered job recommendation digest cron: 30 8 * * *'))
  .catch((err) => logger.error('Failed to register job recommendation digest cron:', err));
