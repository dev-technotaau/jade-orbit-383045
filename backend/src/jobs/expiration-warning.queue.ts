import { schedulerQueue } from './scheduler.queue';
import logger from '../config/logger';

// Register daily expiration warning cron (9 AM UTC)
schedulerQueue
  .add('send-expiration-warnings', {}, { repeat: { pattern: '0 9 * * *' } })
  .then(() => logger.info('Registered expiration warning cron: 0 9 * * *'))
  .catch((err) => logger.error('Failed to register expiration warning cron:', err));
