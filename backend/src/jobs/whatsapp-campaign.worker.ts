import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { WHATSAPP_CAMPAIGN_QUEUE_NAME } from './whatsapp-campaign.queue';
import { getOrCreateConversation } from '../services/whatsapp-conversation.service';
import { sendTemplateToConversation } from '../services/whatsapp-send.service';
import {
  recomputeCampaignCounters,
  isSkipErrorCode,
  isRetryableErrorCode,
} from '../services/whatsapp-campaign.service';
import { emitWaEvent } from '../services/whatsapp-events.service';
import { emitWa } from '../utils/whatsapp-realtime';
import { captureWaException } from '../utils/whatsapp-metrics';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface CampaignBatchJobData {
  campaignId: string;
  recipientIds: string[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Global per-second send ceiling for a campaign, enforced via Redis so the cap
 * holds across worker concurrency AND multiple pods. A per-batch in-loop sleep
 * alone would let the effective rate = concurrency × throttlePerSec; this caps
 * actual Meta sends to `perSec` per rolling 1-second window cluster-wide. Spins
 * (≤~10s) until a slot frees in the current window.
 */
async function acquireSendSlot(campaignId: string, perSec: number): Promise<void> {
  const limit = Math.max(1, perSec);
  for (let i = 0; i < 200; i++) {
    const sec = Math.floor(Date.now() / 1000);
    const key = `wa:camp-rate:${campaignId}:${sec}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 2);
    if (n <= limit) return;
    await sleep(50);
  }
}

/**
 * Processes one batch of campaign recipients: sends the campaign template to
 * each PENDING recipient at the campaign's throttle, writes the per-recipient
 * outcome, and bumps campaign counters. Honors pause/cancel mid-batch (checks
 * the live campaign status before each send). Concurrency 1 keeps the per-number
 * send rate controlled; delivery/read are reconciled later via status webhooks.
 */
export function createWhatsappCampaignWorker(): Worker<CampaignBatchJobData> {
  const worker = new Worker<CampaignBatchJobData>(
    WHATSAPP_CAMPAIGN_QUEUE_NAME,
    async (job: Job<CampaignBatchJobData>) => {
      return (async () => {
          const campaign = await prisma.waCampaign.findUnique({
            where: { id: job.data.campaignId },
          });
          if (!campaign) return { skipped: true };
          if (campaign.status !== 'RUNNING') return { skipped: true, status: campaign.status };

          // Send-time opt-out re-validation (compliance): a contact may opt out
          // AFTER the audience was materialized, so re-check consent per recipient
          // below. Load the campaign template's category once to know whether the
          // send is MARKETING (which requires an active opt-in).
          const template = await prisma.waTemplate.findUnique({
            where: { id: campaign.templateId },
            select: { category: true },
          });
          const isMarketing = template?.category === 'MARKETING';

          for (const recipientId of job.data.recipientIds) {
            // Honor pause/cancel issued mid-batch.
            const live = await prisma.waCampaign.findUnique({
              where: { id: campaign.id },
              select: { status: true },
            });
            if (live?.status !== 'RUNNING') break;

            const recipient = await prisma.waCampaignRecipient.findUnique({
              where: { id: recipientId },
              include: { contact: { select: { isBlocked: true, optInStatus: true } } },
            });
            if (!recipient || recipient.status !== 'PENDING') continue;
            if (recipient.contact.isBlocked) {
              // Atomically claim-and-skip a blocked contact (PENDING -> SKIPPED).
              await prisma.waCampaignRecipient.updateMany({
                where: { id: recipient.id, status: 'PENDING' },
                data: { status: 'SKIPPED' },
              });
              continue;
            }
            // Re-validate consent at send time (the audience may be stale): a
            // MARKETING send needs an active opt-in, and ANY category must skip a
            // contact who has opted out since materialize. Claim-and-skip atomically.
            const optInStatus = recipient.contact.optInStatus;
            const consentFails =
              optInStatus === 'OPTED_OUT' || (isMarketing && optInStatus !== 'OPTED_IN');
            if (consentFails) {
              await prisma.waCampaignRecipient.updateMany({
                where: { id: recipient.id, status: 'PENDING' },
                data: { status: 'SKIPPED' },
              });
              continue;
            }

            // (5) RECIPIENT CLAIM — atomically move PENDING -> SENT (with sentAt as
            // the in-flight marker) BEFORE the send. If another worker / a retry of
            // this job already claimed it, count===0 and we skip: this is what makes
            // the per-recipient send idempotent across retries and leader flips.
            const claim = await prisma.waCampaignRecipient.updateMany({
              where: { id: recipient.id, status: 'PENDING' },
              data: { status: 'SENT', sentAt: new Date() },
            });
            if (claim.count === 0) continue; // already handled elsewhere

            try {
              const conversation = await getOrCreateConversation(
                campaign.channelId,
                recipient.contactId
              );
              const bodyParams = Array.isArray(recipient.variables)
                ? (recipient.variables as string[])
                : [];
              // A/B: when this recipient was assigned a variant, send that
              // variant's template instead of the campaign default.
              let templateId = campaign.templateId;
              if (recipient.variantId) {
                const variant = await prisma.waCampaignVariant.findUnique({
                  where: { id: recipient.variantId },
                  select: { templateId: true },
                });
                if (variant) templateId = variant.templateId;
              }
              // Global throttle: cap actual Meta sends to throttlePerSec across
              // all workers/pods (cluster-wide) before each send.
              await acquireSendSlot(campaign.id, campaign.throttlePerSec);
              const message = await sendTemplateToConversation(
                conversation.id,
                campaign.createdBy,
                {
                  templateId,
                  bodyParams,
                  campaignId: campaign.id,
                }
              );
              // A capped / opted-out send is a SKIP; a transient/rate-limit error
              // rolls BACK to PENDING (the recovery cron re-batches it) so we don't
              // permanently drop a deliverable message; everything else is FAILED.
              const isSkip = isSkipErrorCode(message.errorCode);
              const failedSend = message.status === 'FAILED' && !isSkip;
              const retryable = failedSend && isRetryableErrorCode(message.errorCode);
              await prisma.waCampaignRecipient.update({
                where: { id: recipient.id },
                data: retryable
                  ? { status: 'PENDING', sentAt: null, wamid: null, errorCode: message.errorCode }
                  : {
                      status: isSkip ? 'SKIPPED' : failedSend ? 'FAILED' : 'SENT',
                      wamid: message.wamid,
                      sentAt: new Date(),
                      errorCode: message.errorCode,
                    },
              });
            } catch (err: any) {
              // Throw during send: a transient error rolls back to PENDING (recovery
              // cron re-batches); a recognized cap code is a SKIP; else a hard FAILED.
              const code = err?.code ?? 'SEND_ERROR';
              await prisma.waCampaignRecipient
                .update({
                  where: { id: recipient.id },
                  data: isRetryableErrorCode(code)
                    ? { status: 'PENDING', sentAt: null, wamid: null, errorCode: code }
                    : { status: isSkipErrorCode(code) ? 'SKIPPED' : 'FAILED', errorCode: code },
                })
                .catch(() => {});
              void captureWaException(err, { campaignId: campaign.id, recipientId: recipient.id });
            }
          }

          // (4) COUNTER INTEGRITY — recompute counters from the recipient table
          // (and roll up actualCostPaise) instead of trusting monotonic increments,
          // so counters self-heal and never exceed totalRecipients.
          await recomputeCampaignCounters(campaign.id);

          // Mark complete when nothing is left pending.
          const remaining = await prisma.waCampaignRecipient.count({
            where: { campaignId: campaign.id, status: 'PENDING' },
          });
          if (remaining === 0) {
            const fresh = await prisma.waCampaign.findUnique({
              where: { id: campaign.id },
              select: { status: true, recurrenceDays: true },
            });
            if (fresh?.status === 'RUNNING') {
              const completedAt = new Date();
              // Recurring campaigns arm nextRunAt = completedAt + N days so the
              // recurring cron re-fires them; one-off campaigns leave it null.
              const nextRunAt =
                fresh.recurrenceDays && fresh.recurrenceDays > 0
                  ? new Date(completedAt.getTime() + fresh.recurrenceDays * 24 * 60 * 60 * 1000)
                  : null;
              await prisma.waCampaign
                .update({
                  where: { id: campaign.id },
                  data: { status: 'COMPLETED', completedAt, nextRunAt },
                })
                .catch(() => {});
              emitWaEvent('whatsapp.campaign.completed', { campaignId: campaign.id }).catch(
                () => {}
              );
            }
          }
          // Push live progress to the campaigns view.
          const progress = await prisma.waCampaign.findUnique({
            where: { id: campaign.id },
            select: {
              id: true,
              status: true,
              totalRecipients: true,
              sentCount: true,
              deliveredCount: true,
              readCount: true,
              failedCount: true,
              skippedCount: true,
            },
          });
          if (progress) emitWa('wa:campaign', progress);

          // Counters are recomputed from the recipient table, so report the
          // campaign-level rollup rather than per-batch tallies.
          return {
            processed: job.data.recipientIds.length,
            sentCount: progress?.sentCount ?? 0,
            failedCount: progress?.failedCount ?? 0,
            skippedCount: progress?.skippedCount ?? 0,
          };
        })();
    },
    {
      connection: redis,
      concurrency: parseInt(env.WHATSAPP_CAMPAIGN_CONCURRENCY, 10) || 1,
      lockDuration: 600_000,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(`WhatsApp campaign batch ${job?.id} failed: ${err.message}`);
    void captureWaException(err, { jobId: job?.id, campaignId: job?.data?.campaignId });
  });

  return worker;
}
