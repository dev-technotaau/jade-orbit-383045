import logger from '../config/logger';
import { workerLeader } from './worker-leader';

// Import periodic queue files to register their repeatable jobs.
// These call schedulerQueue.add() which is idempotent — safe on all instances.
import './job-expiration.queue';
import './job-engagement-nudge.queue';
import './token-cleanup.queue';
import './sla-check.queue';
import './job-alert.queue';
import './job-recommendation-digest.queue';
import './recurring-digests.queue';
import './profile-reminder.queue';
import './scheduled-publish.queue';
import './weekly-digest.queue';
import './backup.queue';
import './data-export.queue';
import './expiration-warning.queue';
import './review-reminder.queue';
import './stale-profile.queue';
import './view-counter-flush.queue';
import './billing-reminder.queue';
import './invoice-generation.queue';
import './entitlement-expiry.queue';
import './settlement-sync.queue';
import './dispute-sync.queue';
import './subscription-renewal.queue';
import './payment-status-poll.queue';
import './payment-retry.queue';
import './webhook-retry-sweep.queue';
import './vendor-lead-expiry.queue';
import './search-history.queue';
import './follower-notify.queue';
import './review-cron.queue';
import './whatsapp-cron.queue';
import './email-cron.queue';
import './admin-pbac-cron.queue';

// Scheduler queue for stale job cleanup
import { schedulerQueue } from './scheduler.queue';

/**
 * Clean up stale repeatable jobs before the queue files re-register them.
 * All periodic jobs now live in the single scheduler queue.
 */
async function cleanStaleRepeatableJobs(): Promise<void> {
  try {
    const repeatableJobs = await schedulerQueue.getRepeatableJobs();
    for (const rj of repeatableJobs) {
      await schedulerQueue.removeRepeatableByKey(rj.key);
      logger.debug(`Removed stale repeatable job: ${rj.key}`);
    }
    if (repeatableJobs.length > 0) {
      logger.info(`Cleaned ${repeatableJobs.length} stale repeatable job(s) from scheduler-queue`);
    }
  } catch (error) {
    logger.error('Failed to clean repeatable jobs from scheduler-queue:', error);
  }
}

/**
 * Initialize BullMQ workers via leader election.
 * Only the leader instance creates Worker objects (blocking Redis connections).
 * The standby instance runs in API-only mode and auto-promotes if the leader dies.
 */
export async function initializeWorkers(): Promise<void> {
  await cleanStaleRepeatableJobs();
  const isLeader = await workerLeader.tryBecomeLeader();
  logger.info(
    isLeader
      ? 'This instance is the BullMQ worker leader'
      : 'This instance is in standby mode (another instance is the worker leader)'
  );
}

/**
 * Shutdown: stop workers + release leader lock.
 */
export async function closeAllWorkers(): Promise<void> {
  await workerLeader.shutdown();
  logger.info('BullMQ worker leader shutdown complete');
}
