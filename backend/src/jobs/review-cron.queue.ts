/**
 * Repeating periodic jobs for the company-review system, all funnelled
 * through the central scheduler queue. Idempotent registration on
 * import — safe to re-import on every boot.
 */
import logger from '../config/logger';
import { schedulerQueue } from './scheduler.queue';

// 6-hourly industry-average refresh. Computes mean overall rating per
// industry from the aggregate table.
schedulerQueue
  .add(
    'refresh-industry-averages',
    {},
    {
      repeat: { pattern: '0 */6 * * *' },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }
  )
  .catch((err) => {
    logger.error('Failed to register refresh-industry-averages cron:', err);
  });

// 12-hourly aggregate sweep — walks every CompanyReviewAggregate row
// older than 24h and enqueues a refresh. Catches any drift from missed
// mutation triggers (e.g. crashes during a transaction).
schedulerQueue
  .add(
    'sweep-review-aggregates',
    {},
    {
      repeat: { pattern: '0 */12 * * *' },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }
  )
  .catch((err) => {
    logger.error('Failed to register sweep-review-aggregates cron:', err);
  });

logger.info('Review crons scheduled on: scheduler-queue');
