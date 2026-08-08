import { schedulerQueue } from './scheduler.queue';
import logger from '../config/logger';

// Register weekly stale profile check (Monday 10 AM UTC)
schedulerQueue
  .add('check-stale-profiles', {}, { repeat: { pattern: '0 10 * * 1' } })
  .then(() => logger.info('Registered stale profile check cron: 0 10 * * 1'))
  .catch((err) => logger.error('Failed to register stale profile check cron:', err));
