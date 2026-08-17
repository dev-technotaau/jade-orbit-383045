import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { SCHEDULER_QUEUE_NAME } from './scheduler.queue';
import {
  handleWaSyncTemplates,
  handleWaScheduledCampaigns,
  handleWaSyncChannelHealth,
  handleWaPruneRetention,
  handleWaEventRecovery,
  handleWaCampaignRecovery,
  handleWaDripTick,
  handleWaScheduledTick,
  handleWaRecurringTick,
  handleWaMediaReconcile,
  handleWaWebhookHeartbeat,
  handleWaClickRollup,
  handleWaMessageRollup,
  handleWaMetaCostSync,
  handleWaWeeklyReport,
} from './whatsapp-cron.worker';

/**
 * Shared cron dispatcher.
 *
 * One BullMQ queue carries every repeatable job; this worker routes by job name.
 * The host platform registered ~40 cases here (job expiry, digests, billing,
 * settlements, PBAC sweeps, email crons). All of those went with their features.
 *
 * ── The fourteen names below are load-bearing ──
 * They must match `whatsapp-cron.queue.ts` EXACTLY. A name registered there but
 * missing here falls to `default`, which logs a warning and returns null — the
 * cron fires on schedule and silently does nothing. That failure mode is quiet
 * enough to survive a deploy unnoticed, so treat the two lists as one unit:
 * change a name in either file and change it in both.
 *
 * The same fourteen names also appear in `jobs/index.ts` as the live set for
 * `cleanStaleRepeatableJobs` — a name missing there gets UNREGISTERED from Redis
 * on the next boot.
 */
export function createSchedulerWorker(): Worker {
  const worker = new Worker(
    SCHEDULER_QUEUE_NAME,
    async (job: Job) => {
      return (async () => {
        switch (job.name) {
          case 'wa-sync-templates':
            return handleWaSyncTemplates();
          case 'wa-run-scheduled-campaigns':
            return handleWaScheduledCampaigns();
          case 'wa-sync-channel-health':
            return handleWaSyncChannelHealth();
          case 'wa-prune-retention':
            return handleWaPruneRetention();
          case 'wa-event-recovery':
            return handleWaEventRecovery();
          case 'wa-campaign-recovery':
            return handleWaCampaignRecovery();
          case 'wa-drip-tick':
            return handleWaDripTick();
          case 'wa-scheduled-tick':
            return handleWaScheduledTick();
          case 'wa-recurring-tick':
            return handleWaRecurringTick();
          case 'wa-media-reconcile':
            return handleWaMediaReconcile();
          case 'wa-webhook-heartbeat':
            return handleWaWebhookHeartbeat();
          case 'wa-click-rollup':
            return handleWaClickRollup();
          case 'wa-message-rollup':
            return handleWaMessageRollup();
          case 'wa-meta-cost-sync':
            return handleWaMetaCostSync();
          case 'wa-weekly-report':
            return handleWaWeeklyReport();
          default:
            logger.warn(`Unknown scheduler job name: ${job.name}`);
            return null;
        }
      })();
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_SCHEDULER_CONCURRENCY, 10),
      lockDuration: 300000, // 5 min — some periodic tasks are heavy
      stalledInterval: 120000,
    }
  );

  worker.on('completed', (job) => {
    logger.info(`Scheduler job ${job.id} (${job.name}) completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Scheduler job ${job?.id} (${job?.name}) failed: ${err.message}`);
  });

  return worker;
}
