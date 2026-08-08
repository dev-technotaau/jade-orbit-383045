import logger from '../config/logger';
import { schedulerQueue } from './scheduler.queue';

export const SLA_CHECK_QUEUE_NAME = 'check-sla-breaches';

// Re-export scheduler queue for backward compatibility
export const slaCheckQueue = schedulerQueue;

// Check SLA breaches every 15 minutes
schedulerQueue
  .add(
    'check-sla-breaches',
    {},
    {
      repeat: { pattern: '*/15 * * * *' },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }
  )
  .catch((err) => {
    logger.error('Failed to add repeatable SLA check:', err);
  });

logger.info(`SLA Check scheduled on: scheduler-queue`);
