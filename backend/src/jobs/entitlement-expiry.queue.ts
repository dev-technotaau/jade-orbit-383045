import { schedulerQueue } from './scheduler.queue';
import logger from '../config/logger';

/**
 * Hourly entitlement expiry sweep cron (xx:15).
 *
 * Marks `Entitlement.status` from ACTIVE → EXPIRED for any rows whose
 * `validUntil` is in the past, and matures scheduled downgrades.
 * Hourly (was daily) so a plan expiring mid-day doesn't leave the user
 * planless for up to 24h before their scheduled downgrade matures.
 * Dispatched from `scheduler.worker.ts`.
 */
// Drop the legacy daily registration (repeatables persist in Redis across
// deploys) before adding the hourly one.
schedulerQueue
  .removeRepeatable('sweep-expired-entitlements', { pattern: '0 19 * * *' })
  .catch(() => {});

schedulerQueue
  .add('sweep-expired-entitlements', {}, { repeat: { pattern: '15 * * * *' } })
  .then(() => logger.info('Registered entitlement expiry cron: 15 * * * *'))
  .catch((err) => logger.error('Failed to register entitlement expiry cron:', err));
