import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { SCHEDULER_QUEUE_NAME } from './scheduler.queue';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';
import { handleJobExpiration } from './job-expiration.worker';
import { handleJobEngagementNudge } from './job-engagement-nudge.worker';
import { handleTokenCleanup } from './token-cleanup.worker';
import { handleJobAlert } from './job-alert.worker';
import { handleJobRecommendationDigest } from './job-recommendation-digest.worker';
import {
  handleFollowedCompanyJobsDigest,
  handleProfileViewsDigest,
  handleSavedJobsClosingDigest,
  handleCandidateRecommendationsDigest,
  handleApplicationsAwaitingDigest,
  handleCvSearchAlertsDigest,
} from './recurring-digests.worker';
import { handleSlaCheck } from './sla-check.worker';
import { handleProfileReminder } from './profile-reminder.worker';
import { handleScheduledPublish } from './scheduled-publish.worker';
import { handleWeeklyDigest } from './weekly-digest.worker';
import { handleDataExport, handleExportCleanup } from './data-export.worker';
import { handleDbBackup, handleBackupCleanup } from './backup.worker';
import { handleExpirationWarning } from './expiration-warning.worker';
import { handleReviewReminder } from './review-reminder.worker';
import { handleStaleProfileCheck } from './stale-profile.worker';
import { handleViewCounterFlush } from './view-counter-flush.worker';
import { handleBillingReminder } from './billing-reminder.worker';
import { handleEntitlementExpiry } from './entitlement-expiry.worker';
import { handleSettlementSync } from './settlement-sync.worker';
import { handleDisputeSync } from './dispute-sync.worker';
import { handleSubscriptionRenewal } from './subscription-renewal.worker';
import { handlePaymentStatusSweep } from './payment-status-poll.worker';
import {
  handlePaymentRetry,
  handleExpirePendingOrders,
  handleAutoRenewOneTimePlans,
} from './payment-retry.worker';
import { handleWebhookRetrySweep } from './webhook-retry-sweep.worker';
import { handlePbacSweepGrants, handlePbacSweepLocks } from './admin-pbac-cron.worker';
import { handleVendorLeadExpiry } from './vendor-lead-expiry.worker';
import { handleSearchHistorySweep } from './search-history.worker';
import { handleReviewIndustryAverages, handleReviewAggregateSweep } from './review-cron.worker';
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
} from './whatsapp-cron.worker';
import {
  handleEmailScheduledCampaigns,
  handleEmailRecurringTick,
  handleEmailDripTick,
  handleEmailScheduledTick,
  handleEmailCampaignRecovery,
  handleEmailPruneRetention,
  handleEmailDeliverabilityVerify,
  handleEmailBulkCleanup,
} from './email-cron.worker';

/**
 * Combined scheduler worker — processes ALL periodic/cron jobs through
 * a single BullMQ Worker (1 blocking Redis connection) instead of many
 * separate Workers.
 */
export function createSchedulerWorker(): Worker {
  const worker = new Worker(
    SCHEDULER_QUEUE_NAME,
    async (job: Job) => {
      const traceCtx = (job.data as Record<string, any>)?._traceContext || {};
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          switch (job.name) {
            case 'check-expired-jobs':
              return handleJobExpiration(job);
            case 'send-engagement-nudges':
              return handleJobEngagementNudge(job);
            case 'cleanup-tokens':
              return handleTokenCleanup(job);
            case 'process-alerts':
              return handleJobAlert(job);
            case 'send-job-recommendations':
              return handleJobRecommendationDigest(job);
            case 'digest-saved-jobs-closing':
              return handleSavedJobsClosingDigest(job);
            case 'digest-applications-awaiting':
              return handleApplicationsAwaitingDigest(job);
            case 'digest-followed-companies':
              return handleFollowedCompanyJobsDigest(job);
            case 'digest-candidate-recommendations':
              return handleCandidateRecommendationsDigest(job);
            case 'digest-cv-search-alerts':
              return handleCvSearchAlertsDigest(job);
            case 'digest-profile-views':
              return handleProfileViewsDigest(job);
            case 'check-sla-breaches':
              return handleSlaCheck(job);
            case 'send-profile-reminders':
              return handleProfileReminder(job);
            case 'check-scheduled-jobs':
              return handleScheduledPublish(job);
            case 'send-weekly-digest':
              return handleWeeklyDigest(job);
            case 'export-data':
              return handleDataExport(job);
            case 'db-backup':
              return handleDbBackup(job);
            case 'backup-cleanup':
              return handleBackupCleanup(job);
            case 'export-cleanup':
              return handleExportCleanup(job);
            case 'send-expiration-warnings':
              return handleExpirationWarning(job);
            case 'send-review-reminders':
              return handleReviewReminder(job);
            case 'check-stale-profiles':
              return handleStaleProfileCheck(job);
            case 'flush-view-counters':
              return handleViewCounterFlush(job);
            case 'send-billing-reminders':
              return handleBillingReminder(job);
            case 'sweep-expired-entitlements':
              return handleEntitlementExpiry(job);
            case 'sync-settlements':
              return handleSettlementSync(job);
            case 'sync-disputes':
              return handleDisputeSync(job);
            case 'subscription-renewal-precheck':
              return handleSubscriptionRenewal(job);
            case 'payment-status-sweep':
              return handlePaymentStatusSweep(job);
            case 'process-payment-retries':
              return handlePaymentRetry(job);
            case 'expire-pending-orders':
              return handleExpirePendingOrders(job);
            case 'auto-renew-one-time-plans':
              return handleAutoRenewOneTimePlans(job);
            case 'webhook-retry-sweep':
              return handleWebhookRetrySweep(job);
            case 'vendor-lead-expiry-sweep':
              return handleVendorLeadExpiry(job);
            case 'search-history-sweep':
              return handleSearchHistorySweep(job);
            case 'refresh-industry-averages':
              return handleReviewIndustryAverages(job);
            case 'sweep-review-aggregates':
              return handleReviewAggregateSweep(job);
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
            case 'email-run-scheduled-campaigns':
              return handleEmailScheduledCampaigns();
            case 'email-drip-tick':
              return handleEmailDripTick();
            case 'email-scheduled-tick':
              return handleEmailScheduledTick();
            case 'email-campaign-recovery':
              return handleEmailCampaignRecovery();
            case 'email-recurring-tick':
              return handleEmailRecurringTick();
            case 'email-prune-retention':
              return handleEmailPruneRetention();
            case 'email-deliverability-verify':
              return handleEmailDeliverabilityVerify();
            case 'email-bulk-cleanup':
              return handleEmailBulkCleanup();
            case 'pbac-sweep-locks':
              return handlePbacSweepLocks();
            case 'pbac-sweep-grants':
              return handlePbacSweepGrants();
            default:
              logger.warn(`Unknown scheduler job name: ${job.name}`);
              return null;
          }
        }
      );
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
