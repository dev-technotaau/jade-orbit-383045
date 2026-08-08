import { schedulerQueue } from './scheduler.queue';
import logger from '../config/logger';

/**
 * Daily billing reminder cron — sends 7d / 3d / 1d renewal reminders for:
 *   - Active subscriptions
 *   - Active one-time entitlements with `autoRenew=true`
 *
 * Dispatched from `scheduler.worker.ts` → `handleBillingReminder`.
 *
 * Schedule: 09:00 IST every day = 03:30 UTC.
 */
schedulerQueue
  .add('send-billing-reminders', {}, { repeat: { pattern: '30 3 * * *' } })
  .then(() => logger.info('Registered billing reminder cron: 30 3 * * *'))
  .catch((err) => logger.error('Failed to register billing reminder cron:', err));
