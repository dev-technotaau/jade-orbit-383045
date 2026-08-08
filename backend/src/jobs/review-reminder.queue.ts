import { schedulerQueue } from './scheduler.queue';
import logger from '../config/logger';

// Register daily review reminder cron (10 AM UTC)
schedulerQueue
  .add('send-review-reminders', {}, { repeat: { pattern: '0 10 * * *' } })
  .then(() => logger.info('Registered review reminder cron: 0 10 * * *'))
  .catch((err) => logger.error('Failed to register review reminder cron:', err));
