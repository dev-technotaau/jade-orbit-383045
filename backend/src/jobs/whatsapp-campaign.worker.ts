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
  scheduleCampaignCounterRecompute,
  completeCampaign,
  getMessagingTierBudget,
} from '../services/whatsapp-campaign.service';
import {
  isSkipErrorCode,
  isRetryableErrorCode,
  isAuthErrorCode,
} from '../services/whatsapp-error-codes';
import { withinBusinessHours } from '../utils/whatsapp-business-hours';
import { appendRecipientToken, getCampaignLinkCodes } from '../services/whatsapp-shortlink.service';
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
  /** The batch stopped (or never started) because the daily messaging tier is spent. */
  tierExhausted?: boolean;
  /** The batch was held because the campaign only sends inside business hours. */
  outsideBusinessHours?: boolean;
  /** The batch stopped early because Meta rejected the channel's access token. */
  tokenRejected?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Longest we will sit on a Meta Retry-After before carrying on. */
const MAX_THROTTLE_WAIT_MS = 60_000;

/**
 * Upper bound on sends in flight at once inside one batch.
 *
 * The cluster-wide ceiling is `acquireChannelSendSlot`, not this — the pool only
 * decides how much of the configured throttle is actually reachable. The real
 * pool size is the smaller of this, the campaign's throttlePerSec (more senders
 * than the per-second ceiling just queue in Redis) and the batch itself.
 */
const SEND_POOL_CEILING = Math.max(1, parseInt(env.WHATSAPP_CAMPAIGN_SEND_CONCURRENCY, 10) || 8);

/**
 * Global per-second send ceiling for a campaign, enforced via Redis so the cap
 * holds across worker concurrency AND multiple pods. A per-batch in-loop sleep
 * alone would let the effective rate = concurrency × throttlePerSec; this caps
 * actual Meta sends to `perSec` per rolling 1-second window cluster-wide. Spins
 * (≤~10s) until a slot frees in the current window.
 */
/**
 * Cooperative shutdown flag.
 *
 * `closeAllWorkers()` waits for the ACTIVE job to finish, and a campaign batch is
 * a long serial loop — so on SIGTERM the process sat here until the 25s hard
 * deadline force-killed it, mid-send. Batches poll this and yield, leaving the
 * remaining recipients PENDING for the recovery cron.
 *
 * It lives here rather than in jobs/index.ts to avoid an import cycle
 * (index -> worker-leader -> this file).
 */
let workerShutdownRequested = false;

export function beginWorkerShutdown(): void {
  workerShutdownRequested = true;
}

export function isWorkerShuttingDown(): boolean {
  return workerShutdownRequested;
}

/**
 * Cluster-wide send throttle for ONE phone number.
 *
 * Exported because the drip loop needs it too — that path had no rate gate at all,
 * and with ADVANCE_CAP at 500 a single tick could fire 500 back-to-back Graph calls
 * at a number whose limit the operator had set to 15/s.
 */
export async function acquireChannelSendSlot(channelId: string, perSec: number): Promise<void> {
  const limit = Math.max(1, perSec);
  for (let i = 0; i < 200; i++) {
    const sec = Math.floor(Date.now() / 1000);
    // Keyed on the CHANNEL, not the campaign.
    //
    // Meta's throughput limit is per phone number. A per-campaign bucket meant three
    // concurrent campaigns at 15/s each sent 45/s at one number — the limiter was
    // enforcing a number the operator set while the thing it protects was breached.
    const key = `wa:chan-rate:${channelId}:${sec}`;
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
    `Channel ${channelId} could not acquire a send slot within 10s (throttle ${limit}/s)`
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

  // BUSINESS-HOURS GATE (opt-in per campaign).
  //
  // `scheduledAt` is a single absolute instant, so a campaign armed for 10:00
  // IST reached an international list in the middle of the night. Night-time
  // marketing is what drives blocks and reports, and those are exactly what
  // degrade the number's quality rating and its messaging tier.
  //
  // Held, not paused — deliberately the same shape as the tier gate below: the
  // recipients stay PENDING and the recovery cron re-batches them once the
  // window opens, whereas a PAUSED campaign is invisible to that cron and would
  // never resume on its own.
  if (campaign.respectBusinessHours) {
    const settings = await prisma.waSettings.findUnique({
      where: { id: 'default' },
      select: { businessHours: true },
    });
    if (!withinBusinessHours(settings?.businessHours ?? null, new Date())) {
      logger.info(
        `WhatsApp campaign ${campaign.id}: outside business hours — ` +
          'the batch is held and its recipients stay PENDING until the window opens'
      );
      return { skipped: true, outsideBusinessHours: true };
    }
  }

  // META MESSAGING-TIER GATE.
  //
  // Meta caps how many DISTINCT contacts a number may start a conversation with in
  // a rolling 24h window. Nothing in the send path used to know that: once the
  // allowance was gone every further send came back 131056/130497, and those
  // refusals are what degrade the number's quality rating and eventually get it
  // restricted. So the batch stops when the allowance is spent and leaves the
  // remaining recipients PENDING — the recovery cron re-batches them and they go
  // out as the window rolls off, i.e. an over-tier campaign spreads across days
  // instead of burning its audience on rejections. Deliberately not a pause: a
  // PAUSED campaign is invisible to the recovery cron and would never resume.
  const tier = await getMessagingTierBudget();
  let tierRemaining = tier.remaining;
  let tierExhausted = false;
  // Set when Meta rejects the channel's access token, so the batch stops early.
  let tokenRejected = false;
  if (tierRemaining !== null && tierRemaining <= 0) {
    return { skipped: true, tierExhausted: true };
  }

  // Send-time opt-out re-validation (compliance): a contact may opt out
  // AFTER the audience was materialized, so re-check consent per recipient
  // below.
  //
  // The category has to come from the template the recipient will ACTUALLY be
  // sent, not from the campaign default. An A/B test whose base template is
  // UTILITY but whose variant B is MARKETING skipped the opt-in requirement for
  // every recipient assigned to B — a marketing message to a contact who never
  // opted in — and priced the whole campaign at the utility rate. Both maps are
  // loaded once per batch (the variant lookup used to be one query per
  // recipient).
  const variants = await prisma.waCampaignVariant.findMany({
    where: { campaignId: campaign.id },
    select: { id: true, templateId: true },
  });
  const variantTemplateById = new Map(variants.map((v) => [v.id, v.templateId]));
  const templates = await prisma.waTemplate.findMany({
    where: { id: { in: [campaign.templateId, ...variants.map((v) => v.templateId)] } },
    select: { id: true, category: true },
  });
  const categoryByTemplateId = new Map(templates.map((t) => [t.id, t.category]));

  // Campaign short links, loaded once per batch so every outbound parameter can
  // carry a per-recipient `?r=` token. Without it one code is shared by the whole
  // audience and a click is an anonymous counter increment — no click→conversion
  // funnel, no clicker retargeting, no per-variant CTR.
  const linkCodes = await getCampaignLinkCodes(campaign.id);

  // The live-status read used to run once PER RECIPIENT — an extra round trip
  // for every send, on a pool of 5 connections. The atomic PENDING -> SENT claim
  // below is the real safety net against a concurrent pause; this poll only has
  // to be prompt enough that a paused campaign stops within a second or so.
  const LIVE_STATUS_POLL_MS = 1000;
  let liveStatus: string | null = campaign.status;
  let liveStatusAt = 0;
  let liveStatusPoll: Promise<string | null> | null = null;
  /** Campaign status, re-read at most once a second and shared by every sender. */
  const currentStatus = async (): Promise<string | null> => {
    if (Date.now() - liveStatusAt <= LIVE_STATUS_POLL_MS) return liveStatus;
    // One in-flight poll for the whole pool rather than one poll per sender.
    liveStatusPoll ??= prisma.waCampaign
      .findUnique({ where: { id: campaign.id }, select: { status: true } })
      .then((live) => {
        liveStatus = live?.status ?? null;
        liveStatusAt = Date.now();
        return liveStatus;
      })
      .finally(() => {
        liveStatusPoll = null;
      });
    return liveStatusPoll;
  };

  // Every recipient row in ONE query rather than a findUnique per recipient.
  // The snapshot can go stale while the batch runs; that is harmless, because
  // the atomic PENDING -> SENT claim below — not this read — is what makes a
  // recipient go out exactly once.
  const recipients = await prisma.waCampaignRecipient.findMany({
    where: { id: { in: data.recipientIds } },
    include: { contact: { select: { isBlocked: true, optInStatus: true } } },
  });

  /** Set when the whole batch must stop: pause/cancel, shutdown, tier, token. */
  let stop = false;
  /**
   * Shared Meta Retry-After deadline.
   *
   * Meta throttles per NUMBER, so a 429 answered by one sender has to hold the
   * whole pool — otherwise the others keep firing into the same refusal for the
   * length of the backoff and roll their recipients back for nothing.
   */
  let throttledUntil = 0;

  const sendOne = async (recipient: (typeof recipients)[number]): Promise<void> => {
    // Honor pause/cancel issued mid-batch.
    if ((await currentStatus()) !== 'RUNNING') {
      stop = true;
      return;
    }
    if (recipient.status !== 'PENDING') return;

    // A/B: when this recipient was assigned a variant, send that variant's
    // template instead of the campaign default — and judge consent + price by
    // that template's category.
    const templateId = recipient.variantId
      ? (variantTemplateById.get(recipient.variantId) ?? campaign.templateId)
      : campaign.templateId;
    const isMarketing = categoryByTemplateId.get(templateId) === 'MARKETING';

    if (recipient.contact.isBlocked) {
      // Atomically claim-and-skip a blocked contact (PENDING -> SKIPPED).
      await prisma.waCampaignRecipient.updateMany({
        where: { id: recipient.id, status: 'PENDING' },
        data: { status: 'SKIPPED' },
      });
      return;
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
      return;
    }

    // Today's tier allowance is spent — stop here rather than send into a
    // refusal. Everyone left stays PENDING for the recovery cron. The pool is
    // stopped rather than the function abandoned: the counter rebuild and the
    // progress event at the tail still have to run, or the campaigns view
    // freezes on stale numbers.
    if (tierRemaining !== null && tierRemaining <= 0) {
      logger.warn(
        `WhatsApp campaign ${campaign.id}: messaging tier allowance exhausted ` +
          `(${tier.limit} contacts/24h); the remaining recipients stay PENDING ` +
          'until the 24h window rolls off'
      );
      tierExhausted = true;
      stop = true;
      return;
    }

    // One claimed recipient is one contact out of the daily allowance (a campaign
    // holds at most one row per contact). A contact already counted in the rolling
    // window costs nothing extra at Meta, but finding that out would be a query
    // per recipient — so it is charged again here and the batch stops slightly
    // early, which is the harmless direction to be wrong in.
    //
    // Reserved BEFORE the claim and handed back when the claim loses: with
    // several sends in flight, decrementing after the await would let the pool
    // overshoot the allowance by its own width and spend the overshoot on
    // rejections that degrade the number's quality rating.
    if (tierRemaining !== null) tierRemaining -= 1;

    // RECIPIENT CLAIM - atomically move PENDING -> SENT (with sentAt as the
    // in-flight marker) BEFORE the send. If another sender in this pool, another
    // worker, or a retry of this job already claimed it, count===0 and we skip:
    // this is what makes the per-recipient send idempotent across retries and
    // leader flips.
    const claim = await prisma.waCampaignRecipient.updateMany({
      where: { id: recipient.id, status: 'PENDING' },
      // `lastAttemptAt` survives the rollback below; `sentAt` does not. The
      // recovery cron reads it to decide whether anyone is actually working
      // on this campaign.
      data: { status: 'SENT', sentAt: new Date(), lastAttemptAt: new Date() },
    });
    if (claim.count === 0) {
      if (tierRemaining !== null) tierRemaining += 1;
      return; // already handled elsewhere
    }

    try {
      const conversation = await getOrCreateConversation(campaign.channelId, recipient.contactId);
      const rawBodyParams = Array.isArray(recipient.variables)
        ? (recipient.variables as string[])
        : [];
      // Stamped at SEND time, not at materialize: the stored `variables` stay the
      // clean values an operator sees in the recipients export, and a link minted
      // after the audience was materialized is still tracked.
      const bodyParams = rawBodyParams.map((v) =>
        appendRecipientToken(String(v), recipient.contactId, linkCodes)
      );
      // A Retry-After another sender is already serving applies to this number,
      // so wait it out before asking for a slot.
      const backoffMs = throttledUntil - Date.now();
      if (backoffMs > 0) await sleep(Math.min(backoffMs, MAX_THROTTLE_WAIT_MS));
      // Global throttle: cap actual Meta sends to throttlePerSec across all
      // workers/pods (cluster-wide) before each send.
      await acquireChannelSendSlot(campaign.channelId, campaign.throttlePerSec);
      // Campaign-level template parameters (media header, header text, URL-button
      // suffix). Without these a media-header template is sent body-only and Meta
      // rejects every recipient with (#131008). launchCampaign now refuses such a
      // campaign up front; this is the other half of that fix.
      const tp = (campaign.templateParams ?? {}) as {
        headerText?: string;
        headerMediaId?: string;
        headerMediaUrl?: string;
        headerMediaType?: 'image' | 'video' | 'document';
        headerMediaFilename?: string;
        headerLocation?: { latitude: number; longitude: number; name?: string; address?: string };
        buttonUrlParam?: string;
        buttonUrlParams?: string[];
        couponCode?: string;
        ltoExpirationMs?: number;
        catalogThumbnailProductId?: string;
        productSections?: Array<{ title: string; productRetailerIds: string[] }>;
        productRetailerId?: string;
        carouselCards?: Array<{
          headerMediaId?: string;
          headerMediaUrl?: string;
          headerMediaType?: 'image' | 'video';
          bodyParams?: string[];
          buttonUrlParam?: string;
          buttonUrlParams?: string[];
        }>;
      };
      const message = await sendTemplateToConversation(conversation.id, campaign.createdBy, {
        templateId,
        bodyParams,
        headerText: tp.headerText,
        // An uploaded media id, when the operator picked a file rather than a
        // link. The send path prefers the id over the URL, so forwarding both is
        // safe; forwarding neither is what made a media-header broadcast reach
        // Meta with no header at all.
        headerImageId: tp.headerMediaId,
        headerMediaUrl: tp.headerMediaUrl,
        headerMediaType: tp.headerMediaType,
        // The DOCUMENT header's filename. Without it every recipient's PDF is
        // named after the URL's last path segment rather than the operator's own
        // "Invoice-October.pdf".
        headerMediaFilename: tp.headerMediaFilename,
        // The LOCATION header's pin — campaign-wide, like the media above. It was
        // absent from this forward, so a LOCATION-header broadcast reached Meta
        // with no header parameter and every recipient was refused with (#131008).
        headerLocation: tp.headerLocation,
        buttonUrlParam: tp.buttonUrlParam
          ? appendRecipientToken(tp.buttonUrlParam, recipient.contactId, linkCodes)
          : undefined,
        // A template may carry TWO dynamic URL buttons, each addressed by its own
        // index. Only the first was forwarded, so the second went out unfilled and
        // Meta refused every recipient with (#131008). Each link gets the same
        // per-recipient token appended, for the same reason the first one does.
        buttonUrlParams: tp.buttonUrlParams?.map((url) =>
          url ? appendRecipientToken(url, recipient.contactId, linkCodes) : url
        ),
        // Coupon + offer expiry are campaign-wide, not per recipient: the whole
        // audience shares one code and one countdown. Forwarding them is the
        // other half of the launch gate that now refuses a COPY_CODE or
        // LIMITED_TIME_OFFER campaign with no value supplied.
        couponCode: tp.couponCode,
        ltoExpirationMs: tp.ltoExpirationMs,
        // Catalogue products, campaign-wide. A multi-product template's sections
        // are chosen per send and exist nowhere else, so without this forward the
        // broadcast rendered a product list with no products in it.
        catalogThumbnailProductId: tp.catalogThumbnailProductId,
        productSections: tp.productSections,
        productRetailerId: tp.productRetailerId,
        // Carousel cards, campaign-wide like the header media. Each card's own
        // link button gets the recipient token appended for the same reason the
        // bubble's does: a click is only attributable to a contact if the link
        // carries them. `launchCampaign` has already refused a carousel campaign
        // whose cards are not fully filled in.
        carouselCards: tp.carouselCards?.map((card) => ({
          ...card,
          buttonUrlParam: card.buttonUrlParam
            ? appendRecipientToken(card.buttonUrlParam, recipient.contactId, linkCodes)
            : undefined,
          buttonUrlParams: card.buttonUrlParams?.map((url) =>
            url ? appendRecipientToken(url, recipient.contactId, linkCodes) : url
          ),
        })),
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
        throttledUntil = Math.max(throttledUntil, Date.now() + wait);
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

      // An expired/revoked token rejects EVERY remaining recipient identically,
      // and there is no delay that fixes it. Without this the batch rolled all
      // of them back one at a time, holding the worker's single concurrency slot
      // for the whole audience (and, until the backoff fix, sleeping 30s between
      // each) while every other campaign queued behind it. Stop here instead:
      // the rest stay PENDING and the recovery cron resumes them the moment the
      // credential is replaced.
      if (retryable && isAuthErrorCode(message.errorCode)) {
        logger.error(
          `WhatsApp campaign ${campaign.id}: Meta rejected the access token (190) — ` +
            'stopping this batch; the remaining recipients stay PENDING until the ' +
            'token is replaced'
        );
        tokenRejected = true;
        stop = true;
        return;
      }
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
  };

  // BOUNDED-CONCURRENCY SEND POOL.
  //
  // A batch used to await one recipient at a time, and the worker ran one batch
  // at a time — so with a 200-400ms Graph round trip the real throughput was
  // 2-5 messages/second whatever `throttlePerSec` said, and a six-figure
  // audience took most of a day. Sending several at once makes the configured
  // throttle reachable; the throttle itself is unaffected, because
  // `acquireChannelSendSlot` is a cluster-wide per-second budget that every
  // sender still has to draw from.
  const poolSize = Math.max(
    1,
    Math.min(SEND_POOL_CEILING, campaign.throttlePerSec, recipients.length)
  );
  let cursor = 0;
  const runSender = async (): Promise<void> => {
    try {
      for (;;) {
        // Yield promptly on shutdown so the remaining recipients stay PENDING
        // and the recovery cron re-batches them. Without this the process sat
        // here until the 25s force-exit killed it mid-send, leaving recipients
        // claimed-but-unsent.
        if (stop || isWorkerShuttingDown()) return;
        const next = recipients[cursor++];
        if (!next) return;
        await sendOne(next);
      }
    } catch (err) {
      // Every send OUTCOME is handled inside sendOne, so a throw reaching here
      // is infrastructure — the database went away. Stop the other senders
      // rather than leave them running detached from a job that is already
      // failing.
      stop = true;
      throw err;
    }
  };
  const outcomes = await Promise.allSettled(Array.from({ length: poolSize }, () => runSender()));
  // Rethrown only once every sender has settled, so BullMQ retries the batch
  // exactly as it did when this was a serial loop — with nothing still in flight
  // against the recipients the retry is about to re-read.
  const rejected = outcomes.find((o) => o.status === 'rejected');
  if (rejected) throw (rejected as PromiseRejectedResult).reason;

  // COUNTER INTEGRITY - recompute counters from the recipient table (and roll
  // up actualCostPaise) instead of trusting monotonic increments, so counters
  // self-heal and never exceed totalRecipients.
  //
  // Coalesced, not awaited per batch. The rebuild is seven whole-campaign
  // aggregates; running it synchronously after every batch meant a 500k-recipient
  // campaign at batchSize 100 re-scanned the entire recipient table 5,000 times,
  // and the sends themselves queued behind it. The debounce already existed for
  // the status-webhook path — the worker simply never used it.
  scheduleCampaignCounterRecompute(campaign.id);

  // Mark complete when nothing is left pending. An existence probe, not a COUNT
  // over every recipient row.
  const nextPending = await prisma.waCampaignRecipient.findFirst({
    where: { campaignId: campaign.id, status: 'PENDING' },
    select: { id: true },
  });
  if (nextPending === null) {
    // Final batch: the coalesced rebuild above may not have landed yet, and the
    // progress payload emitted below is what the campaigns view settles on.
    await recomputeCampaignCounters(campaign.id);
    const fresh = await prisma.waCampaign.findUnique({
      where: { id: campaign.id },
      select: { status: true, recurrenceDays: true },
    });
    if (fresh?.status === 'RUNNING') {
      // Recurrence is armed inside completeCampaign, and so is the completion
      // announcement (socket + outbound webhook). Both used to be computed here,
      // and ONLY here — the recovery cron and the drip retirement both wrote a bare
      // COMPLETED, so a recurring campaign that finished through either of those
      // silently stopped recurring and neither told anyone it had ended.
      await completeCampaign(campaign.id).catch(() => {});
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
    ...(tierExhausted ? { tierExhausted: true } : {}),
    ...(tokenRejected ? { tokenRejected: true } : {}),
  };
}

/**
 * One BATCH at a time by default — the parallelism lives inside a batch (see the
 * send pool in `processCampaignBatch`), where the cluster-wide per-second budget
 * can govern it. Delivery and read are reconciled later via status webhooks.
 */
export function createWhatsappCampaignWorker(): Worker<CampaignBatchJobData> {
  const worker = new Worker<CampaignBatchJobData>(
    WHATSAPP_CAMPAIGN_QUEUE_NAME,
    (job: Job<CampaignBatchJobData>) => processCampaignBatch(job.data),
    {
      connection: redis,
      concurrency: parseInt(env.WHATSAPP_CAMPAIGN_CONCURRENCY, 10) || 1,
      // Batches now yield on shutdown (see isWorkerShuttingDown above), so a job
      // that stops renewing its lock really is orphaned. Ten minutes meant a pod
      // killed mid-batch left its recipients unreachable for ten minutes before
      // BullMQ would consider the job stalled; two is enough headroom for one
      // in-flight Graph call.
      lockDuration: 120_000,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(`WhatsApp campaign batch ${job?.id} failed: ${err.message}`);
    void captureWaException(err, { jobId: job?.id, campaignId: job?.data?.campaignId });
  });

  return worker;
}
