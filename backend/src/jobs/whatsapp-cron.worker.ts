import { prisma } from '../config/prisma';
import { env } from '../config/env';
import logger from '../config/logger';
import { syncFromMeta } from '../services/whatsapp-template.service';
import {
  launchCampaign,
  cloneAndLaunchRecurring,
  enqueuePendingRecipients,
  completeCampaign,
} from '../services/whatsapp-campaign.service';
import { advanceDueSequenceRecipients } from '../services/whatsapp-sequence.service';
import {
  dispatchDueScheduledMessages,
  SCHEDULED_MEDIA_PREFIX,
} from '../services/whatsapp-scheduled-message.service';
import {
  syncChannelHealth,
  getDefaultChannel,
  recordChannelHealthSnapshot,
  checkTokenHealth,
  TOKEN_EXPIRY_WARN_DAYS,
} from '../services/whatsapp-channel.service';
import { emitWaEvent } from '../services/whatsapp-events.service';
import type { R2ObjectPage } from '../services/storage.service';
import { deleteFileFromR2, listObjectKeys, isR2Configured } from '../services/storage.service';
import { requeueWhatsappInboundJob } from './whatsapp-inbound.queue';
import { whatsappCampaignQueue } from './whatsapp-campaign.queue';
import { getWebhookHealth } from '../services/whatsapp-webhook.service';
import { backfillConsentEvents } from '../services/whatsapp-contact.service';
import { LINK_CLICK_TTL_DAYS, rollupLinkClicks } from '../services/whatsapp-shortlink.service';
import { syncMetaCosts } from '../services/whatsapp-meta-analytics.service';
import { buildAnalyticsReport, rollupMessageDays } from '../services/whatsapp-analytics.service';
import { AuditService } from '../services/audit.service';
import {
  waChannelQuality,
  waMessagingTierLimit,
  waRetentionRowsOverdue,
  waWebhookStale,
  waWebhookUnprocessed,
} from '../utils/whatsapp-metrics';

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

/**
 * Launch any SCHEDULED campaigns whose scheduledAt has arrived.
 *
 * A launch can fail two very different ways, and treating them alike left a
 * campaign that could NEVER launch sitting SCHEDULED and overdue forever, retried
 * on every tick and logging the identical error each time — for days, with the
 * only symptom in the backend log and the campaign still reading "SCHEDULED" to
 * the operator, as if it were about to go out.
 *
 *   - 4xx: the campaign is wrong and only an operator can fix it (a media header
 *     with no file, a carousel used as a variant, an expired offer). Retrying is
 *     futile, so it is returned to DRAFT — the state whose whole purpose is
 *     "needs editing" — and unscheduled, which is exactly what the error text
 *     already asks for ("Edit the campaign and provide it before launching").
 *   - anything else: transient (Meta down, a database blip). Left SCHEDULED so
 *     the next tick tries again, which is the behaviour that matters there.
 */
export async function handleWaScheduledCampaigns(): Promise<void> {
  const due = await prisma.waCampaign.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
    select: { id: true, name: true },
  });
  for (const c of due) {
    try {
      await launchCampaign(c.id);
      logger.info(`Launched scheduled WhatsApp campaign ${c.id}`);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      const permanent = typeof status === 'number' && status >= 400 && status < 500;
      const reason = (e as Error).message;
      if (!permanent) {
        logger.error(`Scheduled WhatsApp campaign ${c.id} launch failed, will retry: ${reason}`);
        continue;
      }
      await prisma.waCampaign
        .update({ where: { id: c.id }, data: { status: 'DRAFT', scheduledAt: null } })
        .catch((err) =>
          logger.error(`Could not unschedule campaign ${c.id}: ${(err as Error).message}`)
        );
      logger.error(
        `Scheduled WhatsApp campaign ${c.id} ("${c.name}") cannot launch and has been ` +
          `returned to DRAFT — it will not be retried: ${reason}`
      );
      // Surface it where the operator actually is. Without this the only sign a
      // scheduled broadcast never went out was a line in the server log.
      emitWaEvent('whatsapp.campaign.unscheduled', {
        campaignId: c.id,
        name: c.name,
        reason,
      }).catch(() => {});
    }
  }
}

/** Pull the live channel quality rating + messaging tier from Meta (no-op until configured). */
export async function handleWaSyncChannelHealth(): Promise<void> {
  // Gated on there being a channel to sync, not on the env. A channel can carry
  // its OWN access token now, so an install configured entirely from the console
  // — no META_WHATSAPP_PHONE_ID, no META_WHATSAPP_TOKEN — is a supported setup,
  // and the old env guard would have left it with no health data at all.
  const configured = await getDefaultChannel().catch(() => null);
  if (!configured) return;

  // EVERY active number, not just the default one. Quality rating and messaging
  // tier are per-number, and syncing only the default left a second connected
  // number permanently unmeasured — its rating could fall to RED, and its sends
  // start being throttled, with nothing anywhere in the product saying so.
  const rows = await prisma.waChannel
    .findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } })
    .catch(() => []);
  const targets = rows.length > 0 ? rows : [configured];

  for (const target of targets) {
    try {
      const channel = await syncChannelHealth(target.id);
      // The gauges hold one value, so they track the DEFAULT number — the one
      // every send with no channel of its own goes out from.
      if (target.isDefault) {
        waChannelQuality.set(qualityToGauge(channel.qualityRating));
        waMessagingTierLimit.set(tierToLimit(channel.messagingTier));
      }
      // Best-effort: append a health snapshot row for trend history. Only on an
      // actual CHANGE — this used to insert unconditionally every 15 minutes, so a
      // healthy channel wrote ~96 identical rows a day into a table nothing prunes.
      try {
        const quality = String(channel.qualityRating);
        const tier = channel.messagingTier ?? null;
        const previous = await prisma.waChannelHealthSnapshot.findFirst({
          where: { channelId: channel.id },
          orderBy: { createdAt: 'desc' },
          select: { quality: true, tier: true },
        });
        await recordChannelHealthSnapshot(channel.id, quality, tier);
        // A degradation is the one transition anybody needs to be told about:
        // it is the leading indicator of a number being rate-limited or banned,
        // and the only previous reaction was a duplicate row nobody read.
        if (previous && previous.quality !== quality && quality !== 'GREEN') {
          logger.error(
            `WhatsApp channel ${channel.displayPhone} quality degraded ` +
              `${previous.quality} -> ${quality} ` +
              `(tier ${previous.tier ?? 'unknown'} -> ${tier ?? 'unknown'})`
          );
          emitWaEvent('whatsapp.channel.quality_degraded', {
            channelId: channel.id,
            from: previous.quality,
            to: quality,
            tier,
          }).catch(() => {});
        }
      } catch (e) {
        logger.warn(
          `WhatsApp channel ${target.displayPhone} health snapshot write failed: ` +
            `${(e as Error).message}`
        );
      }
      // An ineligible number is not a quality problem and does not show up in the
      // rating: Meta answers GREEN right up until the send is refused. Say so.
      if (channel.healthStatus && channel.healthStatus !== 'AVAILABLE') {
        logger.error(
          `WhatsApp channel ${target.displayPhone} cannot send freely — Meta reports ` +
            `health_status ${channel.healthStatus}. Campaigns launched now will fail.`
        );
      }

      // The credential itself. A 24-hour or 60-day USER token pasted in place of a
      // system-user token works perfectly until the hour it lapses, at which point
      // every send fails with OAuth 190 and the only trace is a screen of FAILED
      // rows. This is the warning that arrives BEFORE that happens.
      const tokenHealth = await checkTokenHealth(target.id).catch(() => null);
      if (tokenHealth && !tokenHealth.ok) {
        logger.warn(
          `WhatsApp channel ${target.displayPhone} token check failed: ${tokenHealth.error}`
        );
      } else if (tokenHealth && !tokenHealth.valid) {
        logger.error(
          `WhatsApp channel ${target.displayPhone} access token is no longer valid — ` +
            'every send will fail with OAuth 190 until it is replaced.'
        );
      } else if (
        tokenHealth?.daysRemaining != null &&
        tokenHealth.daysRemaining <= TOKEN_EXPIRY_WARN_DAYS
      ) {
        logger.warn(
          `WhatsApp channel ${target.displayPhone} access token expires in ` +
            `${tokenHealth.daysRemaining} day(s) — replace it with a system-user token ` +
            'that does not expire.'
        );
      }
      logger.info(`WhatsApp channel health cron sync ok for ${target.displayPhone}`);
    } catch (e) {
      logger.warn(
        `WhatsApp channel ${target.displayPhone} health cron sync failed: ${(e as Error).message}`
      );
    }
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
 * `AuditLog` holds actor, IP, user agent and entity ids; it is archived at
 * AUDIT_LOG_ARCHIVE_DAYS and deleted at AUDIT_LOG_TTL_DAYS (below).
 * `WaLinkClick` holds IP + user agent per click.
 */
const WEBHOOK_DELIVERY_TTL_DAYS = 30;
const AUDIT_LOG_TTL_DAYS = 180;
/**
 * When an audit row leaves the default view but is still kept.
 *
 * `AuditLog.isArchived` was filtered out of every list, stat and export query
 * and nothing ever set it — a permanently-true predicate, and an "include
 * archived" toggle in the viewer that could never surface a single row. The
 * archival semantics were declared and unimplemented while the only real
 * retention behaviour was the hard delete below.
 *
 * Archiving is what makes the two honest: past 90 days a row drops out of the
 * working trail (the recent activity an operator is actually reading) but stays
 * queryable behind the toggle until the 180-day delete removes it for good.
 */
const AUDIT_LOG_ARCHIVE_DAYS = 90;
// LINK_CLICK_TTL_DAYS is owned by the short-link service: the click series reads
// raw rows for everything inside this window, so both sides must agree on it.
/**
 * Channel-health snapshots. Now that a row is only written on an actual change
 * (see recordChannelHealthSnapshot) the table grows slowly — but nothing pruned
 * it at all, and a year of quality transitions is well past useful for a trend
 * chart that only ever shows 30 days.
 */
const CHANNEL_HEALTH_TTL_DAYS = 365;

/**
 * Ceiling on the post-prune overdue counts that feed `wa_retention_rows_overdue`.
 *
 * Counting the exact backlog of a table that has never been drained is itself a
 * long scan, and this runs every hour. The gauge saturates instead: any value at
 * the cap already means "far behind", which is the only thing the alert needs to
 * know.
 */
const OVERDUE_COUNT_CAP = 100_000;

export async function handleWaPruneRetention(): Promise<void> {
  const settings = await prisma.waSettings
    .findUnique({ where: { id: 'default' } })
    .catch(() => null);
  const retentionDays = settings?.retentionDays;

  const DAY_MS = 24 * 60 * 60 * 1000;
  const BATCH = 1000;
  /**
   * A wall-clock budget, not a loop count.
   *
   * `MAX_LOOPS = 20` capped every table at 20k rows PER DAY. A deployment taking
   * more than 20k inbound messages a day therefore fell permanently behind its
   * own retention policy: the backlog grew monotonically, the configured
   * retentionDays became fiction, and the failure was invisible because the job
   * still reported success. A budget drains as much as it safely can, says out
   * loud when it ran out, and leaves the remainder on `wa_retention_rows_overdue`.
   *
   * Five minutes, not ten: the job runs hourly now (see whatsapp-cron.queue), so
   * the drain rate comes from the number of passes rather than the length of one,
   * and a short pass keeps the shared scheduler queue moving.
   */
  const PRUNE_BUDGET_MS = parseInt(env.WA_PRUNE_BUDGET_MS, 10);
  const deadline = Date.now() + PRUNE_BUDGET_MS;
  let budgetExhausted = false;
  const withinBudget = (): boolean => {
    if (Date.now() < deadline) return true;
    budgetExhausted = true;
    return false;
  };

  // 1) Messages + their R2 media — only when a retention window is configured.
  let deletedMessages = 0;
  let deletedMedia = 0;
  if (retentionDays && retentionDays > 0) {
    // Aggregate BEFORE deleting, exactly as the click prune does below. The
    // daily rollup cron normally has these days covered, but a first prune after
    // a rollup outage would otherwise delete message history that was never
    // aggregated — and unlike the messages themselves, the aggregate is the copy
    // the dashboard's headline numbers are meant to survive on.
    await rollupMessageDays(MESSAGE_ROLLUP_CATCHUP_DAYS).catch((e) => {
      logger.warn(`WhatsApp retention prune: message rollup failed: ${(e as Error).message}`);
    });
    const cutoff = new Date(Date.now() - retentionDays * DAY_MS);
    while (withinBudget()) {
      const stale = await prisma.waMessage.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true, mediaUrl: true, mediaThumbUrl: true },
        take: BATCH,
      });
      if (stale.length === 0) break;

      for (const m of stale) {
        // Both objects: the bubble-sized derivative is a copy of the same
        // customer photo, so a retention policy that deleted only the original
        // would leave a readable thumbnail of every "deleted" image in the
        // bucket forever.
        for (const key of [m.mediaUrl, m.mediaThumbUrl]) {
          if (!key) continue;
          try {
            await deleteFileFromR2(key); // stored mediaUrl/mediaThumbUrl are R2 keys
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
  while (withinBudget()) {
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
    while (withinBudget()) {
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

  // Archive AFTER the delete, in the same batched shape: rows past the delete
  // cutoff are gone by now, so this only ever walks the 90-180 day band, and the
  // `isArchived: false` predicate makes each pass pick up where the last stopped.
  const archivedAudit = await pruneOlderThan(
    'audit log archive',
    AUDIT_LOG_ARCHIVE_DAYS,
    async (cutoff, take) => {
      const stale = await prisma.auditLog.findMany({
        where: { createdAt: { lt: cutoff }, isArchived: false },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take,
      });
      if (stale.length === 0) return 0;
      const res = await prisma.auditLog.updateMany({
        where: { id: { in: stale.map((r) => r.id) } },
        data: { isArchived: true },
      });
      return res.count;
    }
  );

  // Reconstruct consent history for contacts that predate WaConsentEvent. Lives
  // in the daily housekeeping job rather than in a cron of its own because it is
  // a one-time migration: once drained it is a single indexed query that returns
  // nothing. Until then, the opt-out trend would be missing everything older
  // than the event log.
  await backfillConsentEvents().catch((e) => {
    logger.warn(`WhatsApp consent backfill failed: ${(e as Error).message}`);
  });

  // Aggregate before deleting. The daily rollup cron normally has these days
  // covered already, but a first prune after this change (or after a long
  // rollup outage) would otherwise erase click history that was never rolled up.
  await handleWaClickRollup().catch((e) => {
    logger.warn(`WhatsApp retention prune: click rollup failed: ${(e as Error).message}`);
  });

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

  const deletedSnapshots = await pruneOlderThan(
    'channel health snapshots',
    CHANNEL_HEALTH_TTL_DAYS,
    async (cutoff, take) => {
      const doomed = await prisma.waChannelHealthSnapshot.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take,
      });
      if (doomed.length === 0) return 0;
      const res = await prisma.waChannelHealthSnapshot.deleteMany({
        where: { id: { in: doomed.map((d) => d.id) } },
      });
      return res.count;
    }
  );

  // Expired trusted devices. hire_adda declares an @@index([expiresAt]) on its
  // equivalent table as if a sweeper were planned, and then never wrote one, so
  // the table grows forever.
  const { pruneExpiredTrustedDevices } = await import('../services/whatsapp-mfa.service');
  const deletedDevices = await pruneExpiredTrustedDevices().catch((e) => {
    logger.warn(`WhatsApp retention prune (trusted devices) failed: ${(e as Error).message}`);
    return 0;
  });

  // What the prune did NOT reach. The warn below is one line in whichever run
  // hits the wall; this is the alertable series behind it — see
  // `wa_retention_rows_overdue`.
  const overdue: Record<string, number> = {};
  const recordOverdue = async (
    table: string,
    cutoff: Date | null,
    count: (cutoff: Date) => Promise<number>
  ): Promise<void> => {
    try {
      // A null cutoff means no TTL is configured for this table, so nothing can
      // be past one — report zero rather than leaving a stale reading behind.
      const remaining = cutoff ? await count(cutoff) : 0;
      overdue[table] = remaining;
      waRetentionRowsOverdue.set({ table }, remaining);
    } catch (e) {
      // A failed count must not fail the prune that already succeeded. Leaving
      // the gauge at its previous value is honest: it says "unknown", not "zero".
      logger.warn(
        `WhatsApp retention prune: overdue count for ${table} failed: ${(e as Error).message}`
      );
    }
  };

  await recordOverdue(
    'wa_message',
    retentionDays && retentionDays > 0 ? new Date(Date.now() - retentionDays * DAY_MS) : null,
    (cutoff) =>
      prisma.waMessage.count({ where: { createdAt: { lt: cutoff } }, take: OVERDUE_COUNT_CAP })
  );
  await recordOverdue('wa_webhook_event', eventCutoff, (cutoff) =>
    prisma.waWebhookEvent.count({ where: { createdAt: { lt: cutoff } }, take: OVERDUE_COUNT_CAP })
  );
  await recordOverdue(
    'webhook_delivery',
    new Date(Date.now() - WEBHOOK_DELIVERY_TTL_DAYS * DAY_MS),
    (cutoff) =>
      prisma.webhookDelivery.count({
        where: { createdAt: { lt: cutoff } },
        take: OVERDUE_COUNT_CAP,
      })
  );
  await recordOverdue('audit_log', new Date(Date.now() - AUDIT_LOG_TTL_DAYS * DAY_MS), (cutoff) =>
    prisma.auditLog.count({ where: { createdAt: { lt: cutoff } }, take: OVERDUE_COUNT_CAP })
  );
  await recordOverdue(
    'wa_link_click',
    new Date(Date.now() - LINK_CLICK_TTL_DAYS * DAY_MS),
    (cutoff) =>
      prisma.waLinkClick.count({ where: { createdAt: { lt: cutoff } }, take: OVERDUE_COUNT_CAP })
  );
  await recordOverdue(
    'wa_channel_health_snapshot',
    new Date(Date.now() - CHANNEL_HEALTH_TTL_DAYS * DAY_MS),
    (cutoff) =>
      prisma.waChannelHealthSnapshot.count({
        where: { createdAt: { lt: cutoff } },
        take: OVERDUE_COUNT_CAP,
      })
  );

  logger.info(
    `WhatsApp retention prune: ${deletedMessages} message(s), ${deletedMedia} media object(s) ` +
      `(>${retentionDays ?? '∞'}d), ${deletedEvents} webhook event(s) (>${eventTtlDays}d), ` +
      `${deletedDeliveries} webhook delivery/ies (>${WEBHOOK_DELIVERY_TTL_DAYS}d), ` +
      `${deletedAudit} audit log(s) (>${AUDIT_LOG_TTL_DAYS}d), ` +
      `${archivedAudit} audit log(s) archived (>${AUDIT_LOG_ARCHIVE_DAYS}d), ` +
      `${deletedClicks} link click(s) (>${LINK_CLICK_TTL_DAYS}d), ` +
      `${deletedSnapshots} channel health snapshot(s) (>${CHANNEL_HEALTH_TTL_DAYS}d), ` +
      `${deletedDevices} expired trusted device(s) deleted`
  );
  if (budgetExhausted) {
    // Loud, because this means the deployment is not actually honouring its own
    // retention policy and nothing else would say so.
    const behind =
      Object.entries(overdue)
        .filter(([, n]) => n > 0)
        .map(([table, n]) => `${table}=${n}${n >= OVERDUE_COUNT_CAP ? '+' : ''}`)
        .join(', ') || 'none counted';
    logger.warn(
      `WhatsApp retention prune ran out of its ${PRUNE_BUDGET_MS}ms budget with rows still ` +
        `above the cutoff (${behind}) — raise WA_PRUNE_BUDGET_MS; it already runs hourly.`
    );
  }
}

/**
 * Reconcile the R2 media archive against the database.
 *
 * Every deleter in this system starts from a row: the retention prune above
 * reads `WaMessage.mediaUrl` before deleting the message, and DPDP erasure
 * (`eraseContactData`) reads it before nulling it. An object no row names is
 * therefore reachable by neither and lives in the bucket forever — a cost leak,
 * and a hole in the right-to-be-forgotten flow, because a photo archived just
 * after a contact's erasure ran survives that erasure entirely.
 *
 * Objects younger than the grace window are left alone. The stamp lands
 * milliseconds after the upload, but the archive queue retries a failed job for
 * ~17 hours and each attempt re-uploads the same key, so anything narrower could
 * delete a key that a job in flight is about to reference.
 */
const MEDIA_ARCHIVE_PREFIX = 'whatsapp-media/';
const MEDIA_RECONCILE_GRACE_MS = 24 * 60 * 60 * 1000;
/** Wall-clock budget, for the same reason the retention prune has one. */
const MEDIA_RECONCILE_BUDGET_MS = 300000;

/**
 * Sweep staged attachments for send-later messages whose row never materialised
 * (or was deleted out from under them).
 *
 * Separate from the archive sweep below because the ownership question is a
 * different one: these are named by `WaScheduledMessage.mediaKey`, not by any
 * message, and a PENDING row may legitimately hold its bytes for months.
 */
async function sweepScheduledMedia(
  cutoff: Date,
  deadline: number
): Promise<{ scanned: number; orphaned: number; deleted: number; budgetExhausted: boolean }> {
  let scanned = 0;
  let orphaned = 0;
  let deleted = 0;
  let token: string | undefined;

  do {
    if (Date.now() >= deadline) return { scanned, orphaned, deleted, budgetExhausted: true };
    let page: R2ObjectPage;
    try {
      page = await listObjectKeys(SCHEDULED_MEDIA_PREFIX, token);
    } catch (e) {
      logger.warn(`WhatsApp scheduled-media sweep listing failed: ${(e as Error).message}`);
      return { scanned, orphaned, deleted, budgetExhausted: false };
    }
    token = page.nextToken;
    scanned += page.objects.length;

    const candidates = page.objects
      .filter((o) => !o.lastModified || o.lastModified < cutoff)
      .map((o) => o.key);
    if (candidates.length === 0) continue;

    const referenced = await prisma.waScheduledMessage.findMany({
      where: { mediaKey: { in: candidates } },
      select: { mediaKey: true },
    });
    const live = new Set(referenced.map((r) => r.mediaKey));

    for (const key of candidates) {
      if (live.has(key)) continue;
      orphaned++;
      try {
        await deleteFileFromR2(key);
        deleted++;
      } catch (e) {
        logger.warn(
          `WhatsApp scheduled-media sweep could not delete orphan ${key}: ${(e as Error).message}`
        );
      }
    }
  } while (token);

  return { scanned, orphaned, deleted, budgetExhausted: false };
}

export async function handleWaMediaReconcile(): Promise<void> {
  // No bucket, nothing archived, nothing to sweep. A deployment without R2 is
  // supported, and must not log an error every night for it.
  if (!isR2Configured()) return;

  const cutoff = new Date(Date.now() - MEDIA_RECONCILE_GRACE_MS);
  const deadline = Date.now() + MEDIA_RECONCILE_BUDGET_MS;
  let scanned = 0;
  let orphaned = 0;
  let deleted = 0;
  let budgetExhausted = false;
  let token: string | undefined;

  // Scheduled attachments live outside `whatsapp-media/` precisely so this sweep
  // cannot delete a file that is waiting to be sent and is therefore named by no
  // message. They still need sweeping — a crash between the upload and the row
  // insert leaves bytes nothing will ever send — so they get their own pass with
  // their own owner lookup, sharing this run's budget.
  const sweptScheduled = await sweepScheduledMedia(cutoff, deadline);
  scanned += sweptScheduled.scanned;
  orphaned += sweptScheduled.orphaned;
  deleted += sweptScheduled.deleted;
  if (sweptScheduled.budgetExhausted) budgetExhausted = true;

  do {
    if (Date.now() >= deadline) {
      budgetExhausted = true;
      break;
    }

    let page: R2ObjectPage;
    try {
      page = await listObjectKeys(MEDIA_ARCHIVE_PREFIX, token);
    } catch (e) {
      logger.warn(`WhatsApp media reconcile listing failed: ${(e as Error).message}`);
      return;
    }
    token = page.nextToken;
    scanned += page.objects.length;

    // A missing LastModified is treated as old enough to consider: the DB lookup
    // below is the real safety net, and skipping it forever would mean such an
    // object could never be swept at all.
    const candidates = page.objects
      .filter((o) => !o.lastModified || o.lastModified < cutoff)
      .map((o) => o.key);
    if (candidates.length === 0) continue;

    // One query per page, not one per key.
    //
    // BOTH columns. The bubble-sized derivatives live under `whatsapp-media/thumb/`
    // and are therefore listed by the same prefix scan, but they are named by
    // `mediaThumbUrl` — matching on `mediaUrl` alone would have found no owner
    // for a single one of them and deleted every thumbnail in the bucket 24
    // hours after it was written, silently returning the inbox to full-size
    // downloads while the DB went on pointing at objects that no longer exist.
    const referenced = await prisma.waMessage.findMany({
      where: {
        OR: [{ mediaUrl: { in: candidates } }, { mediaThumbUrl: { in: candidates } }],
      },
      select: { mediaUrl: true, mediaThumbUrl: true },
    });
    const live = new Set<string | null>();
    for (const m of referenced) {
      live.add(m.mediaUrl);
      live.add(m.mediaThumbUrl);
    }

    for (const key of candidates) {
      if (live.has(key)) continue;
      orphaned++;
      try {
        await deleteFileFromR2(key);
        deleted++;
      } catch (e) {
        logger.warn(
          `WhatsApp media reconcile could not delete orphan ${key}: ${(e as Error).message}`
        );
      }
    }
  } while (token);

  logger.info(
    `WhatsApp media reconcile: scanned ${scanned} archived object(s), ` +
      `${orphaned} unreferenced (>${MEDIA_RECONCILE_GRACE_MS / (60 * 60 * 1000)}h old), ` +
      `${deleted} deleted`
  );
  if (budgetExhausted) {
    logger.warn(
      `WhatsApp media reconcile ran out of its ${MEDIA_RECONCILE_BUDGET_MS}ms budget with ` +
        'objects left to scan — the remainder is picked up on the next run.'
    );
  }
}

/**
 * Recover inbound webhook events whose processing job died after exhausting its
 * retries. Re-enqueues valid, unprocessed events older than 2 minutes. The
 * inbound worker is idempotent (dedup on WAMID + per-event jobId), so this is safe.
 */
/** Give up on an event after this many recovery replays. */
const MAX_DEFER_ATTEMPTS = 12;

export async function handleWaEventRecovery(): Promise<void> {
  const cutoff = new Date(Date.now() - 2 * 60 * 1000);
  const stuck = await prisma.waWebhookEvent.findMany({
    where: {
      processedAt: null,
      signatureOk: true,
      createdAt: { lt: cutoff },
      // Bound the replay.
      //
      // An event whose statuses reference a WAMID we will NEVER hold (a send from
      // another tool, a pre-migration message) is deferred by design and was
      // therefore retried forever. Because this pass takes the OLDEST 200, a
      // handful of those permanently-stuck events squatted at the front of the
      // queue and starved genuinely recoverable ones out of the window entirely.
      deferAttempts: { lt: MAX_DEFER_ATTEMPTS },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  // Retire anything that has exhausted its attempts, so it stops competing for the
  // window. Kept, never deleted: the payload is the only record that the event
  // arrived at all.
  //
  // Stamped `abandonedAt`, NOT `processedAt`. Using the success field meant an
  // event that was never handled reported success everywhere an operator could
  // look — green chip, no filter that finds it, unprocessed gauge back to zero —
  // and then had its payload pruned at 14 days. The retirement path was written
  // for a benign case (statuses for WAMIDs this system will never hold), but a
  // MESSAGES batch reaching it means a customer message was destroyed, so the
  // two are recorded separately.
  const exhaustedWhere = {
    processedAt: null,
    abandonedAt: null,
    signatureOk: true,
    deferAttempts: { gte: MAX_DEFER_ATTEMPTS },
  };
  const doomed = await prisma.waWebhookEvent.findMany({
    where: exhaustedWhere,
    select: { id: true, eventType: true },
  });
  if (doomed.length > 0) {
    const messageEvents = doomed.filter((e) => e.eventType === 'message');
    await prisma.waWebhookEvent.updateMany({
      where: exhaustedWhere,
      data: {
        abandonedAt: new Date(),
        abandonReason: `exhausted ${MAX_DEFER_ATTEMPTS} replays`,
      },
    });
    // A message batch that dies here is a lost customer message, which is a
    // different severity from an unmatched status and is logged as one.
    if (messageEvents.length > 0) {
      logger.error(
        `WhatsApp event recovery: ABANDONED ${messageEvents.length} inbound MESSAGE event(s) ` +
          `after ${MAX_DEFER_ATTEMPTS} replays — customer messages were not stored. ` +
          `Event ids: ${messageEvents.map((e) => e.id).join(', ')}`
      );
    }
    const benign = doomed.length - messageEvents.length;
    if (benign > 0) {
      logger.warn(
        `WhatsApp event recovery: gave up on ${benign} non-message event(s) after ` +
          `${MAX_DEFER_ATTEMPTS} replays — they reference WAMIDs this system does not hold`
      );
    }
  }

  if (stuck.length === 0) return;

  let requeued = 0;
  for (const ev of stuck) {
    try {
      // Count the attempt BEFORE re-enqueueing, so a job that keeps failing still
      // converges on the give-up threshold.
      await prisma.waWebhookEvent
        .update({
          where: { id: ev.id },
          data: { deferAttempts: { increment: 1 }, lastAttemptAt: new Date() },
        })
        .catch(() => {});
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
        // completeCampaign, not a bare status write: this path never computed
        // nextRunAt, so a recurring campaign that finished via the recovery cron
        // silently stopped recurring.
        await completeCampaign(c.id);
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
 * Webhook heartbeat: is Meta still delivering?
 *
 * Meta disables a webhook subscription after sustained delivery failures, and
 * also stops delivering when the callback URL's TLS certificate expires or the
 * host changes. All three produce the same symptom — an inbox that goes quiet.
 * Nothing errors, /health stays green, and Meta never re-sends what it did not
 * deliver, so every inbound message and delivery receipt is lost for as long as
 * it takes a human to notice. This turns the silence into a gauge, a log line
 * and an AuditLog row.
 *
 * The subscription check costs a Graph round trip, so it is only made once the
 * silence already looks abnormal.
 */
export async function handleWaWebhookHeartbeat(): Promise<void> {
  try {
    const probe = await getWebhookHealth();
    const health = probe.stale ? await getWebhookHealth({ checkSubscription: true }) : probe;

    waWebhookStale.set(health.stale ? 1 : 0);
    waWebhookUnprocessed.set(health.unprocessed);

    if (!health.stale) return;

    const age = health.ageMinutes === null ? 'ever' : `${health.ageMinutes} minutes`;
    const reason =
      health.subscribed === false
        ? 'Meta no longer lists a subscribed app for this WABA — re-subscribe the webhook.'
        : health.signatureFailures24h > 0
          ? `${health.signatureFailures24h} webhook(s) were rejected for a bad signature in the ` +
            'last 24h — check META_WHATSAPP_APP_SECRET.'
          : 'Check the callback URL, its TLS certificate, and the Meta app subscription.';

    logger.error(
      `WhatsApp webhook is silent: no signed event for ${age} ` +
        `(threshold ${health.staleAfterMinutes}m). ${reason}`
    );
    await AuditService.log({
      action: 'WA_WEBHOOK_STALE',
      entity: 'WaChannel',
      performedBy: 'system',
      details: {
        lastEventAt: health.lastEventAt,
        ageMinutes: health.ageMinutes,
        staleAfterMinutes: health.staleAfterMinutes,
        subscribed: health.subscribed,
        signatureFailures24h: health.signatureFailures24h,
        unprocessed: health.unprocessed,
      },
    });
  } catch (e) {
    logger.error(`WhatsApp webhook heartbeat failed: ${(e as Error).message}`);
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
      // A cancelled or paused source must not keep spawning clones. Without this
      // there was no way to stop a recurring campaign at all: cancel left
      // recurrenceDays/nextRunAt intact, and updateCampaign refuses to edit a
      // campaign that has already run.
      status: { notIn: ['CANCELLED', 'PAUSED'] },
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

/**
 * Roll raw link clicks into the daily aggregate.
 *
 * Guards the click TREND against the retention prune, which deletes raw
 * WaLinkClick rows on a 180-day TTL — until this existed that took the trend
 * with them, because `WaShortLink.clickCount` survived only as a lifetime
 * counter: the dashboard could say how many clicks a link had ever had and
 * nothing about when. The aggregate holds no IP or user agent, so it can outlive
 * the raw rows. The prune calls this itself before deleting clicks, so the daily
 * cron is about freshness rather than ordering.
 *
 * Re-rolls the most recent already-aggregated day as well, because that day was
 * almost certainly still accumulating clicks when it was first rolled. Upserts,
 * so a re-roll corrects rather than doubles.
 */
export async function handleWaClickRollup(): Promise<void> {
  const DAY_MS = 24 * 60 * 60 * 1000;
  /** Ceiling on catch-up work, so a deployment that has never rolled up cannot stall the queue. */
  const MAX_DAYS_PER_RUN = 90;

  const [oldestRaw, latestRolled] = await Promise.all([
    prisma.waLinkClick.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.waLinkClickDaily.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
  ]);
  if (!oldestRaw) return;

  const utcDay = (d: Date) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const today = utcDay(new Date());
  let cursor = latestRolled ? utcDay(latestRolled.date) : utcDay(oldestRaw.createdAt);

  let days = 0;
  let rows = 0;
  while (cursor.getTime() <= today.getTime() && days < MAX_DAYS_PER_RUN) {
    rows += await rollupLinkClicks(cursor).catch((e) => {
      logger.warn(
        `WhatsApp click rollup failed for ${cursor.toISOString().slice(0, 10)}: ${(e as Error).message}`
      );
      return 0;
    });
    cursor = new Date(cursor.getTime() + DAY_MS);
    days += 1;
  }
  logger.info(`WhatsApp click rollup: ${rows} link-day row(s) across ${days} day(s)`);
}

/**
 * Pull Meta's own billed volume + cost into WaMetaCostDaily.
 *
 * Seven days rather than one: Meta backfills these analytics for a couple of
 * days after the fact, so a strictly-yesterday sync would permanently record the
 * first, incomplete version of every day. The upsert makes the overlap free.
 */
/**
 * How far back each rollup pass recomputes.
 *
 * Three days rather than one: delivery and read callbacks arrive for hours after
 * a send (and Meta re-delivers late ones), so a day rolled up once at midnight
 * would freeze a delivery rate that was still moving. Re-rolling upserts the
 * corrected figures over the provisional ones.
 */
const MESSAGE_ROLLUP_DAYS = 3;

/**
 * A wider window for the pass that runs immediately before the retention prune,
 * so a deployment whose rollup cron has been down for a few days still has its
 * history aggregated before the rows behind it are deleted for good.
 */
const MESSAGE_ROLLUP_CATCHUP_DAYS = 14;

/**
 * Aggregate WaMessage into WaMessageDaily so the dashboard's headline numbers
 * survive the retention prune.
 *
 * Every figure on the analytics page was a live count over a table this module
 * hard-deletes from, so "total messages sent" shrank overnight whenever the
 * prune crossed a day boundary and a report taken today could not be reproduced
 * next month. The rollup carries no message text, phone number or contact id, so
 * it can be kept for as long as the operator wants a history.
 */
export async function handleWaMessageRollup(): Promise<void> {
  try {
    const rows = await rollupMessageDays(MESSAGE_ROLLUP_DAYS);
    logger.info(`WhatsApp message rollup: ${rows} day/channel/category row(s) written`);
  } catch (e) {
    logger.warn(`WhatsApp message rollup failed: ${(e as Error).message}`);
  }
}

export async function handleWaMetaCostSync(): Promise<void> {
  if (!env.META_WHATSAPP_WABA_ID || !env.META_WHATSAPP_TOKEN) return;
  try {
    await syncMetaCosts(7);
  } catch (e) {
    logger.warn(`WhatsApp Meta cost sync failed: ${(e as Error).message}`);
  }
}

/**
 * Weekly performance digest, fanned out as `whatsapp.report.weekly` to every
 * subscribed webhook endpoint.
 *
 * The dashboard could not be exported or scheduled at all, so handing a
 * stakeholder a weekly summary meant screenshotting it. This reuses the existing
 * outbound-webhook dispatcher rather than adding an email path, so an operator
 * can route it wherever they already receive events (Zapier, a CRM, Slack).
 * No-op when nobody is subscribed — building the report is not free.
 */
export async function handleWaWeeklyReport(): Promise<void> {
  const REPORT_EVENT = 'whatsapp.report.weekly';
  const subscribers = await prisma.webhookEndpoint
    .count({ where: { isActive: true, events: { has: REPORT_EVENT } } })
    .catch(() => 0);
  if (subscribers === 0) return;

  try {
    const report = await buildAnalyticsReport(7);
    await emitWaEvent(REPORT_EVENT, {
      window: report.window,
      generatedAt: report.generatedAt,
      messages: report.overview.messages,
      contacts: report.overview.contacts,
      conversations: report.overview.conversations,
      sla: report.sla,
      csat: { averageScore: report.csat.averageScore, ratedCount: report.csat.ratedCount },
      optOut: {
        optOuts: report.optOut.optOuts,
        optIns: report.optOut.optIns,
        ratePer1000: report.optOut.ratePer1000,
        worstCampaigns: report.optOut.byCampaign.slice(0, 5),
      },
      cost: {
        estimatedCostPaise: report.cost.totalEstimatedCostPaise,
        actualCostPaise: report.cost.totalActualCostPaise,
        metaCostMinor: report.cost.meta.available ? report.cost.meta.totalCostMinor : null,
        metaCurrency: report.cost.meta.currency,
      },
      clicks: report.clicks.reduce((s, c) => s + c.clicks, 0),
      ctwaContacts: report.ctwa.totalContacts,
    });
    logger.info(`WhatsApp weekly report dispatched to ${subscribers} subscriber(s)`);
  } catch (e) {
    logger.warn(`WhatsApp weekly report failed: ${(e as Error).message}`);
  }
}
