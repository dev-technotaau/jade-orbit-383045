import { prisma } from '../config/prisma';
import logger from '../config/logger';
import {
  launchCampaign,
  cloneAndLaunchRecurring,
  recomputeCampaignCounters,
  requeuePending,
} from '../services/email-campaign.service';
import { advanceDripSteps } from '../services/email-sequence.service';
import { dispatchDueScheduledEmails } from '../services/email-thread.service';
import { verifySenderDns, getDefaultSender } from '../services/email-sender.service';
import { sweepExpiredUndos } from '../services/email-bulk.service';
import { emitEmail } from '../utils/email-realtime';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Launch any SCHEDULED campaigns whose scheduledAt has arrived. */
export async function handleEmailScheduledCampaigns(): Promise<void> {
  const due = await prisma.emailCampaign.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const c of due) {
    try {
      await launchCampaign(c.id);
      logger.info(`Launched scheduled email campaign ${c.id}`);
    } catch (e) {
      logger.error(`Scheduled email campaign ${c.id} launch failed: ${(e as Error).message}`);
    }
  }
}

/** Re-run recurring campaigns whose nextRunAt has arrived. */
export async function handleEmailRecurringTick(): Promise<void> {
  const due = await prisma.emailCampaign.findMany({
    where: { recurrenceDays: { not: null }, nextRunAt: { not: null, lte: new Date() } },
    select: { id: true },
    orderBy: { nextRunAt: 'asc' },
    take: 20,
  });
  for (const c of due) {
    try {
      await cloneAndLaunchRecurring(c.id);
      logger.info(`Re-launched recurring email campaign ${c.id}`);
    } catch (e) {
      logger.error(`Recurring email campaign ${c.id} re-launch failed: ${(e as Error).message}`);
    }
  }
}

/** Advance every due recipient of every RUNNING SEQUENCE (drip) campaign. */
export async function handleEmailDripTick(): Promise<void> {
  try {
    const { campaignIds } = await advanceDripSteps();
    for (const id of campaignIds) await recomputeCampaignCounters(id).catch(() => {});
  } catch (e) {
    logger.error(`Email drip tick failed: ${(e as Error).message}`);
  }
}

/** Dispatch send-later inbox replies whose sendAt has arrived. */
export async function handleEmailScheduledTick(): Promise<void> {
  try {
    await dispatchDueScheduledEmails();
  } catch (e) {
    logger.error(`Email scheduled-message tick failed: ${(e as Error).message}`);
  }
}

/**
 * Heal RUNNING broadcast campaigns: complete when nothing is PENDING; re-batch a
 * campaign that has PENDING recipients but hasn't progressed recently (stalled).
 * Idempotent — the worker atomically claims each recipient before sending.
 */
export async function handleEmailCampaignRecovery(): Promise<void> {
  const running = await prisma.emailCampaign.findMany({
    where: { status: 'RUNNING', type: 'BROADCAST' },
    select: { id: true },
  });
  if (running.length === 0) return;
  const stallCutoff = new Date(Date.now() - 5 * 60 * 1000);

  for (const c of running) {
    try {
      const pendingCount = await prisma.emailCampaignRecipient.count({
        where: { campaignId: c.id, status: 'PENDING' },
      });
      if (pendingCount === 0) {
        await prisma.emailCampaign.update({
          where: { id: c.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        logger.info(`Email campaign ${c.id} marked COMPLETED (no PENDING recipients)`);
        continue;
      }
      const recentlySent = await prisma.emailCampaignRecipient.count({
        where: { campaignId: c.id, sentAt: { gte: stallCutoff } },
      });
      if (recentlySent > 0) continue;
      await requeuePending(c.id);
      logger.info(
        `Email campaign ${c.id} recovery: re-batched ${pendingCount} PENDING recipient(s)`
      );
    } catch (e) {
      logger.error(`Email campaign ${c.id} recovery failed: ${(e as Error).message}`);
    }
  }
}

const EMAIL_INBOUND_TTL_DAYS = 14;

/**
 * Prune analytics events / send logs / link clicks + raw inbound past retention.
 * Intentionally NOT pruned: EmailUnsubscribe + EmailSuppression (compliance
 * audit trail — proof of opt-out must outlive analytics retention) and
 * EmailTemplateVersion (capped at 20 per template in updateTemplate instead).
 */
export async function handleEmailPruneRetention(): Promise<void> {
  const settings = await prisma.emailSettings
    .findUnique({ where: { id: 'default' } })
    .catch(() => null);
  const retentionDays = settings?.retentionDays;
  const BATCH = 5000;
  const MAX_LOOPS = 20;

  let deletedEvents = 0;
  let deletedLogs = 0;
  let deletedClicks = 0;
  if (retentionDays && retentionDays > 0) {
    const cutoff = new Date(Date.now() - retentionDays * DAY_MS);
    for (let i = 0; i < MAX_LOOPS; i++) {
      const res = await prisma.emailEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
      deletedEvents += res.count;
      if (res.count < BATCH) break;
    }
    for (let i = 0; i < MAX_LOOPS; i++) {
      const res = await prisma.emailSendLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
      deletedLogs += res.count;
      if (res.count < BATCH) break;
    }
    // Per-click rows (aggregate counts live on EmailLink and survive the prune).
    for (let i = 0; i < MAX_LOOPS; i++) {
      const res = await prisma.emailLinkClick.deleteMany({ where: { createdAt: { lt: cutoff } } });
      deletedClicks += res.count;
      if (res.count < BATCH) break;
    }
  }

  // Raw inbound (bounce/reply MIME summaries) always prune on a short TTL.
  const inboundCutoff = new Date(Date.now() - EMAIL_INBOUND_TTL_DAYS * DAY_MS);
  let deletedInbound = 0;
  for (let i = 0; i < MAX_LOOPS; i++) {
    const res = await prisma.emailInboundMessage.deleteMany({
      where: { createdAt: { lt: inboundCutoff } },
    });
    deletedInbound += res.count;
    if (res.count < BATCH) break;
  }

  logger.info(
    `Email retention prune: ${deletedEvents} event(s), ${deletedLogs} send-log(s), ${deletedClicks} link-click(s) ` +
      `(>${retentionDays ?? '∞'}d), ${deletedInbound} inbound row(s) (>${EMAIL_INBOUND_TTL_DAYS}d)`
  );
}

/** Sweep expired undo snapshots + prune old finished bulk-job rows. */
export async function handleEmailBulkCleanup(): Promise<void> {
  try {
    const undos = await sweepExpiredUndos();
    // Drop COMPLETED/FAILED bulk-job rows older than 24h (progress is transient).
    const jobCutoff = new Date(Date.now() - DAY_MS);
    const jobs = await prisma.emailBulkJob.deleteMany({
      where: { status: { in: ['COMPLETED', 'FAILED'] }, updatedAt: { lt: jobCutoff } },
    });
    if (undos > 0 || jobs.count > 0) {
      logger.info(
        `Email bulk cleanup: swept ${undos} undo snapshot(s), pruned ${jobs.count} bulk-job row(s)`
      );
    }
  } catch (e) {
    logger.error(`Email bulk cleanup failed: ${(e as Error).message}`);
  }
}

/** Daily deliverability check: verify the default sender's SPF/DKIM/DMARC, and
 *  advance each active sender's warm-up day by one calendar day (capped). */
export async function handleEmailDeliverabilityVerify(): Promise<void> {
  try {
    const sender = await getDefaultSender();
    if (sender) {
      const { sender: verified } = await verifySenderDns(sender.id);
      // Alert on a DNS regression that would hurt (or block) sending.
      if (!verified.dkimVerified || !verified.spfVerified || !verified.dmarcVerified) {
        emitEmail('email:alert', {
          type: 'dns',
          senderId: verified.id,
          fromEmail: verified.fromEmail,
          dkim: verified.dkimVerified,
          spf: verified.spfVerified,
          dmarc: verified.dmarcVerified,
        });
      }
    }
    // Advance the warm-up ramp once per day (runs daily). Capped so it can't run away.
    await prisma.emailSender
      .updateMany({
        where: { isActive: true, warmupDay: { lt: 60 } },
        data: { warmupDay: { increment: 1 } },
      })
      .catch(() => {});
  } catch (e) {
    logger.warn(`Email deliverability verify failed: ${(e as Error).message}`);
  }
}
