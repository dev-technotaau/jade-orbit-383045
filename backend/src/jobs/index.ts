import logger from '../config/logger';
import { workerLeader } from './worker-leader';

/**
 * BullMQ entry point.
 *
 * The host application registered ~28 periodic queues here (job expiry, billing
 * reminders, digests, settlement sync, …). All of those went with their
 * features; what remains is the WhatsApp cron queue, which registers fourteen
 * repeatable jobs — template sync, scheduled-campaign launch, channel-health
 * polling, retention pruning, event and campaign recovery, drip ticks,
 * send-later dispatch, recurring-campaign re-runs, media reconciliation, the
 * webhook heartbeat, link-click rollup, Meta cost sync and the weekly report.
 *
 * Importing a `.queue` file is what registers its repeatable jobs — the import
 * has a side effect. `schedulerQueue.add()` is idempotent, so every instance can
 * safely run these; only WORKER creation is leader-gated (see worker-leader).
 */
import './whatsapp-cron.queue';

/**
 * Remove repeatable jobs whose patterns no longer exist in code.
 *
 * BullMQ persists repeatable definitions in Redis. Without this, a cron removed
 * from source keeps firing forever against a handler that no longer exists —
 * which matters more than usual here, since this module dropped ~28 of them.
 */
async function cleanStaleRepeatableJobs(): Promise<void> {
  try {
    const { schedulerQueue } = await import('./scheduler.queue');
    const repeatableJobs = await schedulerQueue.getRepeatableJobs();
    // Must match the names registered in whatsapp-cron.queue.ts exactly — any
    // name missing here is treated as stale and unregistered on next boot.
    const live = new Set([
      'wa-sync-templates',
      'wa-run-scheduled-campaigns',
      'wa-sync-channel-health',
      'wa-prune-retention',
      'wa-event-recovery',
      'wa-campaign-recovery',
      'wa-drip-tick',
      'wa-scheduled-tick',
      'wa-recurring-tick',
      'wa-media-reconcile',
      'wa-webhook-heartbeat',
      'wa-click-rollup',
      'wa-message-rollup',
      'wa-meta-cost-sync',
      'wa-weekly-report',
    ]);

    let removed = 0;
    for (const job of repeatableJobs) {
      if (live.has(job.name)) continue;
      await schedulerQueue.removeRepeatableByKey(job.key);
      removed++;
    }
    if (removed > 0) {
      logger.info(`Cleaned ${removed} stale repeatable job(s) from scheduler-queue`);
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

/** Shutdown: stop workers + release the leader lock. */
export async function closeAllWorkers(): Promise<void> {
  // Tell long-running batch loops to yield BEFORE we wait on them. A campaign
  // batch can hold the worker for minutes; without this the shutdown always ran
  // out its hard deadline and the process was killed mid-send.
  const { beginWorkerShutdown } = await import('./whatsapp-campaign.worker');
  beginWorkerShutdown();
  await workerLeader.shutdown();
  logger.info('BullMQ worker leader shutdown complete');
}
