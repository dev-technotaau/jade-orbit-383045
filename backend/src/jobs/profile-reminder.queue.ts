import logger from '../config/logger';
import { schedulerQueue } from './scheduler.queue';

export const PROFILE_REMINDER_QUEUE_NAME = 'send-profile-reminders';

// Re-export scheduler queue for backward compatibility
export const profileReminderQueue = schedulerQueue;

// Run profile completion reminders weekly on Mondays at 10 AM
schedulerQueue
  .add(
    'send-profile-reminders',
    {},
    {
      repeat: { pattern: '0 10 * * 1' },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }
  )
  .catch((err) => {
    logger.error('Failed to add repeatable profile reminder job:', err);
  });

logger.info(`Profile Reminder scheduled on: scheduler-queue`);
