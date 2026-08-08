import { schedulerQueue } from './scheduler.queue';
import logger from '../config/logger';

/**
 * Housekeeping crons for the admin PBAC system.
 *
 * Both jobs are HYGIENE ONLY — nothing here is load-bearing for correctness:
 *
 *   • Expired grants and role assignments already authorise nothing:
 *     `permission.service.ts#liveWindow` filters on `expiresAt` at read
 *     time, so a time-boxed grant lapses the moment its clock runs out
 *     whether or not this sweep has run. Deleting the dead rows just keeps
 *     the control-centre counts honest.
 *
 *   • Expired resource locks are likewise invisible to
 *     `resource-lock.service.ts`, which filters on `expiresAt > now`.
 *
 * That ordering matters: if the sweep were the thing that enforced expiry,
 * a stalled worker would silently extend everyone's access.
 *
 * Dispatched from `scheduler.worker.ts`.
 */

// Locks live ~45s, so a 10-minute sweep is plenty to stop the table growing
// while staying far below anything that would matter operationally.
schedulerQueue
  .add('pbac-sweep-locks', {}, { repeat: { pattern: '*/10 * * * *' } })
  .then(() => logger.info('Registered PBAC lock sweep cron: */10 * * * *'))
  .catch((err) => logger.error('Failed to register PBAC lock sweep cron:', err));

// Grant expiry + activity-log retention, hourly at xx:25 (offset from the
// other hourly sweeps at :00/:15/:30 so they don't pile onto one minute).
schedulerQueue
  .add('pbac-sweep-grants', {}, { repeat: { pattern: '25 * * * *' } })
  .then(() => logger.info('Registered PBAC grant sweep cron: 25 * * * *'))
  .catch((err) => logger.error('Failed to register PBAC grant sweep cron:', err));
