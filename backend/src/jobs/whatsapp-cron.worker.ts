import { prisma } from '../config/prisma';
import { env } from '../config/env';
import logger from '../config/logger';
import { syncFromMeta } from '../services/whatsapp-template.service';
import {
  launchCampaign,
  cloneAndLaunchRecurring,
  enqueuePendingRecipients,
} from '../services/whatsapp-campaign.service';
import { advanceDueSequenceRecipients } from '../services/whatsapp-sequence.service';
import { dispatchDueScheduledMessages } from '../services/whatsapp-scheduled-message.service';
import { syncChannelHealth, getDefaultChannel } from '../services/whatsapp-channel.service';
import { deleteFileFromR2 } from '../services/storage.service';
import { requeueWhatsappInboundJob } from './whatsapp-inbound.queue';
import { whatsappCampaignQueue } from './whatsapp-campaign.queue';
import { waChannelQuality, waMessagingTierLimit } from '../utils/whatsapp-metrics';

/** Map a Meta quality rating to the numeric gauge (0 unknown, 1 green, 2 yellow, 3 red). */
function qualityToGauge(rating: string | null | undefined): number {
  switch (String(rating ?? '').toUpperCase()) {
    case 'GREEN':
      return 1;
    case 'YELLOW':
      return 2;
    case 'RED':
      return 3;
    default:
      return 0;
  }
}

/**
 * Parse a Meta messaging tier string (e.g. '1K', '10K', '100K', 'UNLIMITED',
 * or 'TIER_10K') to a numeric daily unique-recipient cap. Returns 0 when
 * unknown; UNLIMITED maps to a large sentinel.
 */
function tierToLimit(tier: string | null | undefined): number {
  const t = String(tier ?? '')
    .toUpperCase()
    .replace(/^TIER[_-]?/, '')
    .trim();
  if (!t) return 0;
  if (t.includes('UNLIMITED')) return 1_000_000_000;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*([KMB]?)$/);
  if (!m) return 0;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return 0;
  const mult = m[2] === 'K' ? 1_000 : m[2] === 'M' ? 1_000_000 : m[2] === 'B' ? 1_000_000_000 : 1;
  return Math.round(n * mult);
}

/** Periodic refresh of template status/quality from Meta (no-op until configured). */
export async function handleWaSyncTemplates(): Promise<void> {
  if (!env.META_WHATSAPP_WABA_ID || !env.META_WHATSAPP_TOKEN) return;
  try {
    const { synced } = await syncFromMeta();
    logger.info(`WhatsApp template cron sync: ${synced} template(s)`);
  } catch (e) {
    logger.warn(`WhatsApp template cron sync failed: ${(e as Error).message}`);
  }
}

/** Launch any SCHEDULED campaigns whose scheduledAt has arrived. */
export async function handleWaScheduledCampaigns(): Promise<void> {
  const due = await prisma.waCampaign.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const c of due) {
    try {
      await launchCampaign(c.id);
      logger.info(`Launched scheduled WhatsApp campaign ${c.id}`);
    } catch (e) {
      logger.error(`Scheduled WhatsApp campaign ${c.id} launch failed: ${(e as Error).message}`);
    }
  }
}

/** Pull the live channel quality rating + messaging tier from Meta (no-op until configured). */
export async function handleWaSyncChannelHealth(): Promise<void> {
  if (!env.META_WHATSAPP_PHONE_ID || !env.META_WHATSAPP_TOKEN) return;
  try {
    // syncChannelHealth() returns the freshly-updated channel; fall back to the
    // default channel read if it ever returns nothing.
    const channel = (await syncChannelHealth()) ?? (await getDefaultChannel());
    if (channel) {
      waChannelQuality.set(qualityToGauge(channel.qualityRating));
      waMessagingTierLimit.set(tierToLimit(channel.messagingTier));
    }
    // Best-effort: append a health snapshot row for trend history.
    try {
      const snap = channel ?? (await getDefaultChannel());
      if (snap) {
        await prisma.waChannelHealthSnapshot.create({
          data: {
            channelId: snap.id,
            quality: String(snap.qualityRating),
            tier: snap.messagingTier ?? null,
          },
        });
      }
    } catch (e) {
      logger.warn(`WhatsApp channel health snapshot write failed: ${(e as Error).message}`);
    }
    logger.info('WhatsApp channel health cron sync ok');
  } catch (e) {
    logger.warn(`WhatsApp channel health cron sync failed: ${(e as Error).message}`);
  }
}

/**
 * Prune WhatsApp messages + raw webhook events. Messages honour the configured
 * retention window (null/0 = keep forever). Raw webhook events ALWAYS prune on a
 * short fixed TTL (independent of message retention) so the plaintext second copy
 * of inbound content (sender phone/wa_id, body, media ids, referral) in
 * WaWebhookEvent.payload is purged quickly even when message retention is long or
 * keep-forever. R2 media for deleted messages is best-effort removed first (the
 * stored `mediaUrl` is the R2 key).
 */
const WA_WEBHOOK_EVENT_TTL_DAYS = 14;

/**
 * Fixed TTLs for the three tables that were accumulating personal data forever
 * outside every retention and erasure path.
 *
 * `WebhookDelivery.payload` stores the whole outbound event verbatim — for
 * `whatsapp.message.inbound` that is the contact's phone number and the text
 * they sent — once per delivery attempt, retries included. Nothing deleted it,
 * the retention prune did not know about it, and DPDP erasure did not scrub it,
 * so a contact who exercised their right to erasure still had their number and
 * message sitting in this table. It is a debug log; it does not need to outlive
 * a fortnight.
 *
 * `AuditLog` holds actor, IP, user agent and entity ids; `archiveLogs()` exists
 * but was never called from anywhere. `WaLinkClick` holds IP + user agent per
 * click.
 */
const WEBHOOK_DELIVERY_TTL_DAYS = 30;
const AUDIT_LOG_TTL_DAYS = 180;
const LINK_CLICK_TTL_DAYS = 180;

export async function handleWaPruneRetention(): Promise<void> {
  const settings = await prisma.waSettings
    .findUnique({ where: { id: 'default' } })
    .catch(() => null);
  const retentionDays = settings?.retentionDays;

  const DAY_MS = 24 * 60 * 60 * 1000;
  const BATCH = 1000;
  const MAX_LOOPS = 20; // cap work per run (≤20k rows/table/day)

  // 1) Messages + their R2 media — only when a retention window is configured.
  let deletedMessages = 0;
  let deletedMedia = 0;
  if (retentionDays && retentionDays > 0) {
    const cutoff = new Date(Date.now() - retentionDays * DAY_MS);
    for (let i = 0; i < MAX_LOOPS; i++) {
      const stale = await prisma.waMessage.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true, mediaUrl: true },
        take: BATCH,
      });
      if (stale.length === 0) break;

      for (const m of stale) {
        if (m.mediaUrl) {
          try {
            await deleteFileFromR2(m.mediaUrl); // stored mediaUrl is the R2 key
            deletedMedia++;
          } catch {
            /* best-effort: R2 unconfigured / object already gone */
          }
        }
      }

      const res = await prisma.waMessage.deleteMany({
        where: { id: { in: stale.map((m) => m.id) } },
      });
      deletedMessages += res.count;
      if (stale.length < BATCH) break;
    }
  }

  // 2) Raw webhook events — short fixed TTL, applied ALWAYS (shorter of the fixed
  //    TTL and any configured message window). Purges the plaintext payload copy
  //    fast regardless of the message-retention setting.
  const eventTtlDays =
    retentionDays && retentionDays > 0
      ? Math.min(retentionDays, WA_WEBHOOK_EVENT_TTL_DAYS)
      : WA_WEBHOOK_EVENT_TTL_DAYS;
  const eventCutoff = new Date(Date.now() - eventTtlDays * DAY_MS);
  let deletedEvents = 0;
  for (let i = 0; i < MAX_LOOPS; i++) {
    // Select ids, then delete by id — the same shape the message prune above
    // uses. The previous version looped over a bare `deleteMany`, which has no
    // LIMIT: the first call deleted every stale row in one transaction (a
    // multi-hundred-thousand-row DELETE against a 30s statement_timeout) and
    // the loop then exited having batched nothing.
    const doomed = await prisma.waWebhookEvent.findMany({
      where: { createdAt: { lt: eventCutoff } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });
    if (doomed.length === 0) break;
    const res = await prisma.waWebhookEvent.deleteMany({
      where: { id: { in: doomed.map((e) => e.id) } },
    });
    deletedEvents += res.count;
    if (doomed.length < BATCH) break;
  }

  // 3) Everything else that quietly accumulates personal data. Batched by id
  //    for the same reason as above: an unbounded DELETE would hit the 30s
  //    statement_timeout on a table that has never been pruned.
  const pruneOlderThan = async (
    label: string,
    days: number,
    del: (cutoff: Date, take: number) => Promise<number>
  ): Promise<number> => {
    const cutoff = new Date(Date.now() - days * DAY_MS);
    let total = 0;
    for (let i = 0; i < MAX_LOOPS; i++) {
      const n = await del(cutoff, BATCH).catch((e) => {
        logger.warn(`WhatsApp retention prune (${label}) failed: ${(e as Error).message}`);
        return 0;
      });
      total += n;
      if (n < BATCH) break;
    }
    return total;
  };

  const deletedDeliveries = await pruneOlderThan(
    'webhook deliveries',
    WEBHOOK_DELIVERY_TTL_DAYS,
    async (cutoff, take) => {
      const doomed = await prisma.webhookDelivery.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take,
      });
      if (doomed.length === 0) return 0;
      const res = await prisma.webhookDelivery.deleteMany({
        where: { id: { in: doomed.map((d) => d.id) } },
      });
      return res.count;
    }
  );

  const deletedAudit = await pruneOlderThan(
    'audit logs',
    AUDIT_LOG_TTL_DAYS,
    async (cutoff, take) => {
      const doomed = await prisma.auditLog.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take,
      });
      if (doomed.length === 0) return 0;
      const res = await prisma.auditLog.deleteMany({
        where: { id: { in: doomed.map((d) => d.id) } },
      });
      return res.count;
    }
  );

  const deletedClicks = await pruneOlderThan(
    'link clicks',
    LINK_CLICK_TTL_DAYS,
    async (cutoff, take) => {
      const doomed = await prisma.waLinkClick.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take,
      });
      if (doomed.length === 0) return 0;
      const res = await prisma.waLinkClick.deleteMany({
        where: { id: { in: doomed.map((d) => d.id) } },
      });
      return res.count;
    }
  );

  logger.info(
    `WhatsApp retention prune: ${deletedMessages} message(s), ${deletedMedia} media object(s) ` +
      `(>${retentionDays ?? '∞'}d), ${deletedEvents} webhook event(s) (>${eventTtlDays}d), ` +
      `${deletedDeliveries} webhook delivery/ies (>${WEBHOOK_DELIVERY_TTL_DAYS}d), ` +
      `${deletedAudit} audit log(s) (>${AUDIT_LOG_TTL_DAYS}d), ` +
      `${deletedClicks} link click(s) (>${LINK_CLICK_TTL_DAYS}d) deleted`
  );
}

/**
 * Recover inbound webhook events whose processing job died after exhausting its
 * retries. Re-enqueues valid, unprocessed events older than 2 minutes. The
 * inbound worker is idempotent (dedup on WAMID + per-event jobId), so this is safe.
 */
export async function handleWaEventRecovery(): Promise<void> {
  const cutoff = new Date(Date.now() - 2 * 60 * 1000);
  const stuck = await prisma.waWebhookEvent.findMany({
    where: { processedAt: null, signatureOk: true, createdAt: { lt: cutoff } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  if (stuck.length === 0) return;

  let requeued = 0;
  for (const ev of stuck) {
    try {
      // `requeue` (not `add`): the spent job still occupies this jobId and a
      // plain add would be silently discarded. See the queue module.
      const job = await requeueWhatsappInboundJob(ev.id);
      if (job) requeued++;
    } catch (e) {
      logger.warn(
        `WhatsApp event recovery re-enqueue failed for ${ev.id}: ${(e as Error).message}`
      );
    }
  }
  logger.info(`WhatsApp event recovery: re-enqueued ${requeued}/${stuck.length} stuck event(s)`);
}

/**
 * Heal RUNNING campaigns. A campaign with no PENDING recipients left is marked
 * COMPLETED; one that still has PENDING recipients but hasn't progressed a batch
 * recently is re-batched. Re-enqueuing is safe — the worker atomically claims
 * each recipient (PENDING -> SENT) before sending, so no recipient is double-sent.
 */
/** Most recipients one recovery tick will re-batch. Bounds queue amplification. */
const RECOVERY_RECIPIENT_CAP = 5000;

/**
 * How many batch jobs for this campaign are already waiting, delayed or active.
 * Best-effort: if the queue can't be inspected, report 0 and let the cron
 * proceed (an extra batch is survivable; a permanently stalled campaign is not).
 */
async function countQueuedBatches(campaignId: string): Promise<number> {
  try {
    const jobs = await whatsappCampaignQueue.getJobs(['waiting', 'delayed', 'active'], 0, 500);
    return jobs.filter((j) => j?.data?.campaignId === campaignId).length;
  } catch {
    return 0;
  }
}

export async function handleWaCampaignRecovery(): Promise<void> {
  // BROADCAST only. A SEQUENCE (drip) campaign deliberately leaves every
  // recipient PENDING — `launchCampaign` hands off to `startSequence` and the
  // wa-drip-tick cron advances them one step at a time. Nothing on that path
  // writes `sentAt`, so the "is it progressing?" test below was always zero for
  // drips and this cron re-batched the whole audience within 10 minutes of
  // launch, blasting the campaign's BASE template to everyone at once and then
  // marking the campaign COMPLETED — silently cancelling the remaining steps.
  const running = await prisma.waCampaign.findMany({
    where: { status: 'RUNNING', type: 'BROADCAST' },
    select: { id: true, batchSize: true },
  });
  if (running.length === 0) return;

  // Only re-batch when no recipient has been sent in the last few minutes
  // (i.e. the campaign appears stalled, not merely throttled and in-flight).
  const stallCutoff = new Date(Date.now() - 5 * 60 * 1000);

  for (const c of running) {
    try {
      const pendingCount = await prisma.waCampaignRecipient.count({
        where: { campaignId: c.id, status: 'PENDING' },
      });

      if (pendingCount === 0) {
        await prisma.waCampaign.update({
          where: { id: c.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        logger.info(`WhatsApp campaign ${c.id} marked COMPLETED (no PENDING recipients)`);
        continue;
      }

      // Progress is `lastAttemptAt`, not `sentAt`. A campaign being rate-limited
      // by Meta rolls every recipient back to PENDING with `sentAt: null`
      // (131056/130429/131048 are all retryable), so the old test saw zero
      // progress on exactly the campaign that was working hardest — and
      // re-batched the whole thing on top of the work already queued.
      const recentlyAttempted = await prisma.waCampaignRecipient.count({
        where: { campaignId: c.id, lastAttemptAt: { gte: stallCutoff } },
      });
      if (recentlyAttempted > 0) continue; // still progressing — leave it alone

      // Don't pile on. If batches for this campaign are already queued or
      // running, the campaign is not stalled in the sense this cron repairs.
      const queued = await countQueuedBatches(c.id);
      if (queued > 0) {
        logger.info(
          `WhatsApp campaign ${c.id} recovery: skipped — ${queued} batch job(s) already queued`
        );
        continue;
      }

      // Paged + capped. This used to be an unbounded findMany of every PENDING
      // recipient into memory before the first job was queued.
      const requeued = await enqueuePendingRecipients(
        c.id,
        c.batchSize || 100,
        RECOVERY_RECIPIENT_CAP
      );
      if (requeued === RECOVERY_RECIPIENT_CAP) {
        // Say so rather than looking like the whole backlog was handled. The
        // next tick picks up where this one stopped.
        logger.warn(
          `WhatsApp campaign ${c.id} recovery: capped at ${RECOVERY_RECIPIENT_CAP} recipients ` +
            'this tick; the remainder is left for the next run'
        );
      }
      logger.info(
        `WhatsApp campaign ${c.id} recovery: re-batched ${requeued} PENDING recipient(s)`
      );
    } catch (e) {
      logger.error(`WhatsApp campaign ${c.id} recovery failed: ${(e as Error).message}`);
    }
  }
}

/**
 * Drip tick: advance every due recipient of every RUNNING SEQUENCE (drip)
 * campaign by one step. The sequence service is self-contained and never throws.
 */
export async function handleWaDripTick(): Promise<void> {
  await advanceDueSequenceRecipients();
}

/**
 * Scheduled-message tick: dispatch every PENDING send-later message whose sendAt
 * has arrived. The service sends each row best-effort and stamps SENT / FAILED.
 */
export async function handleWaScheduledTick(): Promise<void> {
  try {
    await dispatchDueScheduledMessages();
  } catch (e) {
    logger.error(`WhatsApp scheduled-message tick failed: ${(e as Error).message}`);
  }
}

/**
 * Recurring-campaign tick: clone + re-launch every recurring campaign whose
 * nextRunAt has arrived. Each clone is best-effort so one failure never blocks
 * the rest. Capped per run.
 */
export async function handleWaRecurringTick(): Promise<void> {
  const due = await prisma.waCampaign.findMany({
    where: {
      recurrenceDays: { not: null },
      nextRunAt: { not: null, lte: new Date() },
    },
    select: { id: true },
    orderBy: { nextRunAt: 'asc' },
    take: 20,
  });
  for (const c of due) {
    try {
      await cloneAndLaunchRecurring(c.id);
      logger.info(`Re-launched recurring WhatsApp campaign ${c.id}`);
    } catch (e) {
      logger.error(`Recurring WhatsApp campaign ${c.id} re-launch failed: ${(e as Error).message}`);
    }
  }
}
