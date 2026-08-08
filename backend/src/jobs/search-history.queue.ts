/**
 * search-history.queue — registers the recurring sweep on the shared
 * scheduler queue. Cron: every 30 minutes (`*\/30 * * * *`).
 *
 * The actual handler lives in `search-history.worker.ts` and is wired
 * into the unified scheduler worker (`scheduler.worker.ts`).
 */

import { schedulerQueue } from './scheduler.queue';
import logger from '../config/logger';

schedulerQueue
  .add(
    'search-history-sweep',
    {},
    {
      // Every 30 minutes, on the hour and half-hour.
      repeat: { pattern: '*/30 * * * *' },
    }
  )
  .then(() => logger.info('Registered search-history-sweep cron: */30 * * * *'))
  .catch((err) => logger.error('Failed to register search-history-sweep cron:', err));
