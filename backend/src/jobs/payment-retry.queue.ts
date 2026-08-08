import { schedulerQueue } from './scheduler.queue';
import logger from '../config/logger';

/**
 * Payment retry processor + auto-expire + auto-renew sweep.
 *
 * Runs every 10 minutes via the scheduler queue (per plan §3.7 line 268).
 * Dispatched in `scheduler.worker.ts` → `handlePaymentRetry`.
 */
schedulerQueue
  .add('process-payment-retries', {}, { repeat: { pattern: '*/10 * * * *' } })
  .then(() => logger.info('Registered payment retry cron: */10 * * * *'))
  .catch((err) => logger.error('Failed to register payment retry cron:', err));

/**
 * Hourly auto-expire pending orders that exceed their TTL.
 */
schedulerQueue
  .add('expire-pending-orders', {}, { repeat: { pattern: '15 * * * *' } })
  .then(() => logger.info('Registered pending-order expiry cron: 15 * * * *'))
  .catch((err) => logger.error('Failed to register pending-order expiry cron:', err));

/**
 * Daily auto-renew sweep for one-time plans with autoRenew=true.
 * Runs at 06:00 IST = 00:30 UTC.
 */
schedulerQueue
  .add('auto-renew-one-time-plans', {}, { repeat: { pattern: '30 0 * * *' } })
  .then(() => logger.info('Registered auto-renew cron: 30 0 * * *'))
  .catch((err) => logger.error('Failed to register auto-renew cron:', err));
