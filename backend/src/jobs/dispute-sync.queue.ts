import { schedulerQueue } from './scheduler.queue';
import logger from '../config/logger';

/**
 * Daily dispute sync cron — fetches the latest disputes from Razorpay
 * and reconciles open/won/lost states. Runs at 03:00 IST = 21:30 UTC.
 *
 * Dispatched from `scheduler.worker.ts` → `handleDisputeSync`.
 */
schedulerQueue
  .add('sync-disputes', {}, { repeat: { pattern: '30 21 * * *' } })
  .then(() => logger.info('Registered dispute sync cron: 30 21 * * *'))
  .catch((err) => logger.error('Failed to register dispute sync cron:', err));
