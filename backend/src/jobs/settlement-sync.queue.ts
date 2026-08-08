import { schedulerQueue } from './scheduler.queue';
import logger from '../config/logger';

/**
 * Daily settlement sync cron — fetches yesterday's settlements from
 * Razorpay and persists them. Runs at 02:00 IST = 20:30 UTC.
 *
 * Dispatched from `scheduler.worker.ts` → `handleSettlementSync`.
 */
schedulerQueue
  .add('sync-settlements', {}, { repeat: { pattern: '30 20 * * *' } })
  .then(() => logger.info('Registered settlement sync cron: 30 20 * * *'))
  .catch((err) => logger.error('Failed to register settlement sync cron:', err));
