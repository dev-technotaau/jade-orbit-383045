import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { WHATSAPP_CAMPAIGN_QUEUE_NAME } from './whatsapp-campaign.queue';
import { getOrCreateConversation } from '../services/whatsapp-conversation.service';
import { sendTemplateToConversation } from '../services/whatsapp-send.service';
import { recomputeCampaignCounters } from '../services/whatsapp-campaign.service';
import { isSkipErrorCode, isRetryableErrorCode } from '../services/whatsapp-error-codes';
import { emitWaEvent } from '../services/whatsapp-events.service';
import { emitWa } from '../utils/whatsapp-realtime';
import { captureWaException } from '../utils/whatsapp-metrics';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface CampaignBatchJobData {
  campaignId: string;
  recipientIds: string[];
}

interface CampaignBatchResult {
  skipped?: boolean;
  status?: string;
  processed?: number;
  sentCount?: number;
  failedCount?: number;
  skippedCount?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Longest we will sit on a Meta Retry-After before carrying on. */
const MAX_THROTTLE_WAIT_MS = 60_000;

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
    // TTL set unconditionally, not just when n===1. A single missed `expire`
    // (a reconnect between the INCR and the EXPIRE) left a key with no TTL —
    // a permanent counter above the limit, i.e. a campaign that can never send
    // again in that second-bucket. `expire` is idempotent and cheap.
    await redis.expire(key, 2);
    if (n <= limit) return;
    await sleep(50);
  }
  // Out of patience. The old code fell out of this loop and returned, so the
  // caller sent ANYWAY — the throttle failed open at exactly the moment it was
  // most needed. Throw a retryable code instead: the recipient rolls back to
  // PENDING, this batch yields, and the recovery cron picks it up.
  const err = new Error(
    `Campaign ${campaignId} could not acquire a send slot within 10s (throttle ${limit}/s)`
  ) as Error & { code?: string };
  err.code = '130429'; // rate limit hit — in WA_RETRYABLE_ERROR_CODES
  throw err;
}

/**
 * Processes one batch of campaign recipients: sends the campaign template to
 * each PENDING recipient at the campaign's throttle, writes the per-recipient
 * outcome, and bumps campaign counters. Honors pause/cancel mid-batch (checks
 * the live campaign status before each send).
 *
 * Exported (rather than living inline in the Worker callback) so the send-path
 * outcome mapping - SENT vs SKIPPED vs FAILED vs rolled-back-to-PENDING - can be
 * exercised directly by tests without standing up BullMQ and Redis. That mapping
 * is the part of this module where a mistake costs real money or real messages,
 * and it was previously unreachable from a test.
 */
export async function processCampaignBatch(
  data: CampaignBatchJobData
): Promise<CampaignBatchResult> {
  const campaign = await prisma.waCampaign.findUnique({
    where: { id: data.campaignId },
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

  for (const recipientId of data.recipientIds) {
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
    const consentFails = optInStatus === 'OPTED_OUT' || (isMarketing && optInStatus !== 'OPTED_IN');
    if (consentFails) {
      await prisma.waCampaignRecipient.updateMany({
        where: { id: recipient.id, status: 'PENDING' },
        data: { status: 'SKIPPED' },
      });
      continue;
    }

    // RECIPIENT CLAIM - atomically move PENDING -> SENT (with sentAt as the
    // in-flight marker) BEFORE the send. If another worker / a retry of this
    // job already claimed it, count===0 and we skip: this is what makes the
    // per-recipient send idempotent across retries and leader flips.
    const claim = await prisma.waCampaignRecipient.updateMany({
      where: { id: recipient.id, status: 'PENDING' },
      // `lastAttemptAt` survives the rollback below; `sentAt` does not. The
      // recovery cron reads it to decide whether anyone is actually working
      // on this campaign.
      data: { status: 'SENT', sentAt: new Date(), lastAttemptAt: new Date() },
    });
    if (claim.count === 0) continue; // already handled elsewhere

    try {
      const conversation = await getOrCreateConversation(campaign.channelId, recipient.contactId);
      const bodyParams = Array.isArray(recipient.variables)
        ? (recipient.variables as string[])
        : [];
      // A/B: when this recipient was assigned a variant, send that variant's
      // template instead of the campaign default.
      let templateId = campaign.templateId;
      if (recipient.variantId) {
        const variant = await prisma.waCampaignVariant.findUnique({
          where: { id: recipient.variantId },
          select: { templateId: true },
        });
        if (variant) templateId = variant.templateId;
      }
      // Global throttle: cap actual Meta sends to throttlePerSec across all
      // workers/pods (cluster-wide) before each send.
      await acquireSendSlot(campaign.id, campaign.throttlePerSec);
      const message = await sendTemplateToConversation(conversation.id, campaign.createdBy, {
        templateId,
        bodyParams,
        campaignId: campaign.id,
      });
      // A capped / opted-out send is a SKIP; a transient/rate-limit error rolls
      // BACK to PENDING (the recovery cron re-batches it) so we don't
      // permanently drop a deliverable message; everything else is FAILED.
      const isSkip = isSkipErrorCode(message.errorCode);
      const failedSend = message.status === 'FAILED' && !isSkip;
      const retryable = failedSend && isRetryableErrorCode(message.errorCode);

      // Honour Meta's Retry-After. Without this the batch kept firing at its
      // configured rate straight into a 429, rolling every recipient back to
      // PENDING for the recovery cron to re-batch 10 minutes later — a loop
      // that spends conversation credits and never drains. Bounded so one
      // hostile header can't park the worker for an hour.
      const retryAfterMs = (message as { retryAfterMs?: number }).retryAfterMs;
      if (retryable && retryAfterMs && retryAfterMs > 0) {
        const wait = Math.min(retryAfterMs, MAX_THROTTLE_WAIT_MS);
        logger.warn(
          `WhatsApp campaign ${campaign.id}: throttled by Meta, pausing ${wait}ms before the next send`
        );
        await sleep(wait);
      }
      await prisma.waCampaignRecipient.update({
        where: { id: recipient.id },
        data: retryable
          ? {
              status: 'PENDING',
              sentAt: null,
              wamid: null,
              errorCode: message.errorCode,
              lastAttemptAt: new Date(),
            }
          : {
              status: isSkip ? 'SKIPPED' : failedSend ? 'FAILED' : 'SENT',
              wamid: message.wamid,
              sentAt: new Date(),
              lastAttemptAt: new Date(),
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
            ? {
                status: 'PENDING',
                sentAt: null,
                wamid: null,
                errorCode: code,
                lastAttemptAt: new Date(),
              }
            : {
                status: isSkipErrorCode(code) ? 'SKIPPED' : 'FAILED',
                errorCode: code,
                lastAttemptAt: new Date(),
              },
        })
        .catch(() => {});
      void captureWaException(err, { campaignId: campaign.id, recipientId: recipient.id });
    }
  }

  // COUNTER INTEGRITY - recompute counters from the recipient table (and roll
  // up actualCostPaise) instead of trusting monotonic increments, so counters
  // self-heal and never exceed totalRecipients.
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
      emitWaEvent('whatsapp.campaign.completed', { campaignId: campaign.id }).catch(() => {});
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
    processed: data.recipientIds.length,
    sentCount: progress?.sentCount ?? 0,
    failedCount: progress?.failedCount ?? 0,
    skippedCount: progress?.skippedCount ?? 0,
  };
}

/**
 * Concurrency 1 by default keeps the per-number send rate controlled; delivery
 * and read are reconciled later via status webhooks.
 */
export function createWhatsappCampaignWorker(): Worker<CampaignBatchJobData> {
  const worker = new Worker<CampaignBatchJobData>(
    WHATSAPP_CAMPAIGN_QUEUE_NAME,
    (job: Job<CampaignBatchJobData>) => processCampaignBatch(job.data),
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
