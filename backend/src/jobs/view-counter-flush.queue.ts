import { schedulerQueue } from './scheduler.queue';

// Register repeatable job: flush view counters every 5 minutes
schedulerQueue.add(
  'flush-view-counters',
  {},
  {
    repeat: { pattern: '*/5 * * * *' },
    removeOnComplete: 50,
    removeOnFail: 100,
  }
);
