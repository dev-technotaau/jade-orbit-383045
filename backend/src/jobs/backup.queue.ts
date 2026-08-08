import logger from '../config/logger';
import { schedulerQueue } from './scheduler.queue';

export const DB_BACKUP_JOB_NAME = 'db-backup';
export const BACKUP_CLEANUP_JOB_NAME = 'backup-cleanup';

// Re-export scheduler queue for backward compatibility
export const backupQueue = schedulerQueue;

// Database backup → R2 — daily at 2:00 AM UTC
schedulerQueue
  .add(
    DB_BACKUP_JOB_NAME,
    {},
    {
      repeat: { pattern: '0 2 * * *' },
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 },
    }
  )
  .catch((err) => {
    logger.error('Failed to schedule database backup job:', err);
  });

// Backup cleanup (delete old R2 backups) — weekly on Sunday at 4:00 AM UTC
schedulerQueue
  .add(
    BACKUP_CLEANUP_JOB_NAME,
    {},
    {
      repeat: { pattern: '0 4 * * 0' },
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    }
  )
  .catch((err) => {
    logger.error('Failed to schedule backup cleanup job:', err);
  });

logger.info(
  'Backup jobs scheduled on: scheduler-queue (db-backup@2AM-UTC, backup-cleanup@Sun4AM-UTC)'
);
