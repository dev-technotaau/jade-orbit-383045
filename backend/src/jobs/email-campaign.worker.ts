import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env, getEmailMaxSendPerHour, getEmailMaxSendPerDay } from '../config/env';
import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { EMAIL_CAMPAIGN_QUEUE_NAME } from './email-campaign.queue';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';
import { dispatchRecipient, type DispatchTemplate } from '../services/email-dispatch.service';
import { resolveOutboundAttachments, toAttachmentRefs } from '../services/email-attachment.service';
import {
  recomputeCampaignCounters,
  pauseCampaign,
  isRetryableSendReason,
} from '../services/email-campaign.service';
import { getEmailSettings } from '../services/email-settings.service';
import { emitEmail } from '../utils/email-realtime';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface CampaignBatchJobData {
  campaignId: string;
  recipientIds: string[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Short-lived cache for footer-snippet HTML (per-recipient variant lookups stay
// cheap during a batch; 60s TTL so admin edits still propagate quickly).
const footerCache = new Map<string, { html: string | null; at: number }>();

/** Resolve a template's attached footer snippet HTML (cached ~60s). */
async function resolveFooterSnippet(footerSnippetId: string | null): Promise<string | null> {
  if (!footerSnippetId) return null;
  const hit = footerCache.get(footerSnippetId);
  if (hit && Date.now() - hit.at < 60_000) return hit.html;
  const snippet = await prisma.emailSnippet
    .findUnique({ where: { id: footerSnippetId }, select: { html: true } })
    .catch(() => null);
  const html = snippet?.html ?? null;
  footerCache.set(footerSnippetId, { html, at: Date.now() });
  return html;
}

/** Build the UTM param map from a campaign's utm* fields (null when none set). */
function campaignUtm(c: {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
}): Record<string, string> | null {
  const u: Record<string, string> = {};
  if (c.utmSource) u.utm_source = c.utmSource;
  if (c.utmMedium) u.utm_medium = c.utmMedium;
  if (c.utmCampaign) u.utm_campaign = c.utmCampaign;
  if (c.utmTerm) u.utm_term = c.utmTerm;
  if (c.utmContent) u.utm_content = c.utmContent;
  return Object.keys(u).length ? u : null;
}

/** Circuit-breaker thresholds (self-hosted reputation guard). */
const CB_MIN_SAMPLE = 50;
const CB_BOUNCE_RATE = 0.05; // 5%
const CB_COMPLAINT_RATE = 0.001; // 0.1%

/** Per-recipient-domain per-second ceiling (gmail/outlook defer aggressive senders). */
const DOMAIN_PER_SEC = 5;

/**
 * Resolve today's warm-up daily cap for a cold IP from EmailSettings.warmupSchedule
 * (`[{ day, cap }]`) keyed by the sender's warmupDay. Returns null when there's no
 * schedule or warm-up is complete (warmupDay past the last scheduled day).
 */
function warmupDailyCap(schedule: unknown, warmupDay: number): number | null {
  if (!Array.isArray(schedule) || schedule.length === 0) return null;
  const entries = schedule as Array<{ day?: number; cap?: number }>;
  const maxDay = Math.max(...entries.map((e) => (typeof e?.day === 'number' ? e.day : 0)));
  if (warmupDay > maxDay) return null; // ramp finished
  let cap: number | null = null;
  for (const e of entries) {
    if (typeof e?.day === 'number' && typeof e?.cap === 'number' && e.day <= warmupDay) cap = e.cap;
  }
  return cap;
}

/**
 * Cluster-wide send governor. Enforces (a) the sender's hourly/daily cap — with
 * the warm-up ramp applied to the daily cap for a cold IP — as a HARD stop
 * (returns false → the batch leaves the rest PENDING for the cron to re-batch
 * next window) and (b) a per-second global + per-recipient-domain sliding window
 * via Redis so the effective rate holds across workers AND pods.
 */
async function acquireSendSlot(
  campaignId: string,
  perSec: number,
  domain: string,
  sender: { id: string; hourlyCap: number | null; dailyCap: number | null },
  warmupDayCap: number | null
): Promise<boolean> {
  const hourCap = sender.hourlyCap ?? getEmailMaxSendPerHour();
  const baseDayCap = sender.dailyCap ?? getEmailMaxSendPerDay();
  const dayCap = warmupDayCap != null ? Math.min(baseDayCap, warmupDayCap) : baseDayCap;
  const hourKey = `ha:email-cap:h:${sender.id}:${Math.floor(Date.now() / 3_600_000)}`;
  const dayKey = `ha:email-cap:d:${sender.id}:${Math.floor(Date.now() / 86_400_000)}`;

  const [h, d] = await redis.mget(hourKey, dayKey);
  if (hourCap > 0 && h && Number(h) >= hourCap) return false;
  if (dayCap > 0 && d && Number(d) >= dayCap) return false;

  const gLimit = Math.max(1, perSec);
  const dLimit = Math.min(gLimit, DOMAIN_PER_SEC);
  for (let i = 0; i < 200; i++) {
    const sec = Math.floor(Date.now() / 1000);
    const gKey = `ha:email-rate:${campaignId}:${sec}`;
    const gn = await redis.incr(gKey);
    if (gn === 1) await redis.expire(gKey, 2);
    let ok = gn <= gLimit;
    if (ok && domain) {
      const dKey = `ha:email-drate:${domain}:${sec}`;
      const dn = await redis.incr(dKey);
      if (dn === 1) await redis.expire(dKey, 2);
      ok = dn <= dLimit;
    }
    if (ok) {
      // Charge the hourly/daily caps for the send we're about to make.
      const hn = await redis.incr(hourKey);
      if (hn === 1) await redis.expire(hourKey, 3700);
      const dn = await redis.incr(dayKey);
      if (dn === 1) await redis.expire(dayKey, 90_000);
      return true;
    }
    await sleep(50);
  }
  return true; // spun out — allow (best-effort) rather than stall the batch
}

/** Bounce/complaint circuit-breaker: auto-pause a campaign whose rates spike. */
async function checkCircuitBreaker(campaignId: string): Promise<boolean> {
  const c = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    select: { sentCount: true, bouncedCount: true, complainedCount: true },
  });
  if (!c || c.sentCount < CB_MIN_SAMPLE) return false;
  if (c.bouncedCount / c.sentCount > CB_BOUNCE_RATE) {
    await pauseCampaign(campaignId, 'bounce_rate').catch(() => {});
    logger.warn(`Email campaign ${campaignId} auto-paused: bounce rate exceeded`);
    emitEmail('email:alert', {
      type: 'circuit_breaker',
      campaignId,
      reason: 'bounce_rate',
      rate: c.bouncedCount / c.sentCount,
    });
    return true;
  }
  if (c.complainedCount / c.sentCount > CB_COMPLAINT_RATE) {
    await pauseCampaign(campaignId, 'complaint_rate').catch(() => {});
    logger.warn(`Email campaign ${campaignId} auto-paused: complaint rate exceeded`);
    emitEmail('email:alert', {
      type: 'circuit_breaker',
      campaignId,
      reason: 'complaint_rate',
      rate: c.complainedCount / c.sentCount,
    });
    return true;
  }
  return false;
}

export function createEmailCampaignWorker(): Worker<CampaignBatchJobData> {
  const worker = new Worker<CampaignBatchJobData>(
    EMAIL_CAMPAIGN_QUEUE_NAME,
    async (job: Job<CampaignBatchJobData>) => {
      const traceCtx = (job.data as any)?._traceContext || {};
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          const campaign = await prisma.emailCampaign.findUnique({
            where: { id: job.data.campaignId },
          });
          if (!campaign || campaign.status !== 'RUNNING') return { skipped: true };
          if (!campaign.templateId) return { skipped: true };

          const [template, sender, settingsRow] = await Promise.all([
            prisma.emailTemplate.findUnique({ where: { id: campaign.templateId } }),
            prisma.emailSender.findUnique({ where: { id: campaign.senderId } }),
            getEmailSettings(),
          ]);
          if (!template || !sender) return { skipped: true };

          const settings = {
            trackOpens: settingsRow.trackOpens,
            trackClicks: settingsRow.trackClicks,
            footerAddress: settingsRow.footerAddress,
            footerHtml: settingsRow.footerHtml,
            marketingCapPer24h: settingsRow.marketingCapPer24h ?? 1,
          };
          // Warm-up ramp: cap today's sends for a cold sending IP.
          const warmupDayCap = warmupDailyCap(settingsRow.warmupSchedule, sender.warmupDay);

          // Resolve the per-recipient template body once (variants handled per-recipient).
          const baseTemplate: DispatchTemplate = {
            subject: template.subject,
            htmlBody: template.htmlBody,
            textBody: template.textBody,
            preheader: template.preheader,
            category: template.category,
            footerSnippetHtml: await resolveFooterSnippet(template.footerSnippetId),
          };

          // Campaign-level attachments — loaded once from R2, attached to every send.
          const campaignAttachments = await resolveOutboundAttachments(
            toAttachmentRefs(campaign.attachments)
          ).catch((e) => {
            logger.error(`Campaign ${campaign.id} attachment load failed: ${(e as Error).message}`);
            return [];
          });

          for (const recipientId of job.data.recipientIds) {
            const live = await prisma.emailCampaign.findUnique({
              where: { id: campaign.id },
              select: { status: true },
            });
            if (live?.status !== 'RUNNING') break;

            if (await checkCircuitBreaker(campaign.id)) break;

            const recipient = await prisma.emailCampaignRecipient.findUnique({
              where: { id: recipientId },
            });
            if (!recipient || recipient.status !== 'PENDING') continue;

            const domain = recipient.email.split('@')[1] || '';
            const proceed = await acquireSendSlot(
              campaign.id,
              campaign.sendRate,
              domain,
              { id: sender.id, hourlyCap: sender.hourlyCap, dailyCap: sender.dailyCap },
              warmupDayCap
            );
            if (!proceed) break; // hourly/daily cap hit — leave the rest PENDING

            // Atomic claim PENDING -> SENT (idempotent across retries / leader flips).
            const claim = await prisma.emailCampaignRecipient.updateMany({
              where: { id: recipient.id, status: 'PENDING' },
              data: { status: 'SENT', sentAt: new Date() },
            });
            if (claim.count === 0) continue;

            // A/B: send the assigned variant's template/subject when set.
            let dispatchTemplate = baseTemplate;
            let subjectOverride = campaign.subjectOverride;
            if (recipient.variantId) {
              const variant = await prisma.emailCampaignVariant.findUnique({
                where: { id: recipient.variantId },
              });
              if (variant) {
                if (variant.subjectOverride) subjectOverride = variant.subjectOverride;
                if (variant.templateId) {
                  const vt = await prisma.emailTemplate.findUnique({
                    where: { id: variant.templateId },
                  });
                  if (vt) {
                    dispatchTemplate = {
                      subject: vt.subject,
                      htmlBody: vt.htmlBody,
                      textBody: vt.textBody,
                      preheader: vt.preheader,
                      category: vt.category,
                      footerSnippetHtml: await resolveFooterSnippet(vt.footerSnippetId),
                    };
                  }
                }
              }
            }

            try {
              const result = await dispatchRecipient({
                campaignId: campaign.id,
                recipient: {
                  id: recipient.id,
                  email: recipient.email,
                  contactId: recipient.contactId,
                  trackingToken: recipient.trackingToken,
                  variables: recipient.variables,
                },
                template: dispatchTemplate,
                subjectOverride,
                sender: {
                  fromEmail: sender.fromEmail,
                  fromName: sender.fromName,
                  replyTo: sender.replyTo,
                  domain: sender.domain,
                },
                settings,
                attachments: campaignAttachments,
                utm: campaignUtm(campaign),
                fromNameOverride: campaign.fromNameOverride,
                replyToOverride: campaign.replyToOverride,
              });

              if (result.outcome === 'sent') {
                await prisma.emailCampaignRecipient.update({
                  where: { id: recipient.id },
                  data: {
                    status: 'SENT',
                    sentAt: new Date(),
                    providerMessageId: result.providerMessageId,
                    errorMessage: null,
                  },
                });
              } else if (result.outcome === 'skipped') {
                await prisma.emailCampaignRecipient.update({
                  where: { id: recipient.id },
                  data: { status: 'SKIPPED', errorMessage: result.reason ?? null },
                });
              } else {
                const retry = isRetryableSendReason(result.reason);
                await prisma.emailCampaignRecipient.update({
                  where: { id: recipient.id },
                  data: retry
                    ? { status: 'PENDING', sentAt: null, errorMessage: result.reason ?? null }
                    : { status: 'FAILED', errorMessage: result.reason ?? null },
                });
              }
            } catch (err: any) {
              const message = err?.message ?? 'send error';
              await prisma.emailCampaignRecipient
                .update({
                  where: { id: recipient.id },
                  data: isRetryableSendReason(message)
                    ? { status: 'PENDING', sentAt: null, errorMessage: message }
                    : { status: 'FAILED', errorMessage: message },
                })
                .catch(() => {});
            }
          }

          await recomputeCampaignCounters(campaign.id);

          const remaining = await prisma.emailCampaignRecipient.count({
            where: { campaignId: campaign.id, status: 'PENDING' },
          });
          if (remaining === 0) {
            const fresh = await prisma.emailCampaign.findUnique({
              where: { id: campaign.id },
              select: { status: true, recurrenceDays: true },
            });
            if (fresh?.status === 'RUNNING') {
              const completedAt = new Date();
              const nextRunAt =
                fresh.recurrenceDays && fresh.recurrenceDays > 0
                  ? new Date(completedAt.getTime() + fresh.recurrenceDays * 24 * 60 * 60 * 1000)
                  : null;
              await prisma.emailCampaign
                .update({
                  where: { id: campaign.id },
                  data: { status: 'COMPLETED', completedAt, nextRunAt },
                })
                .catch(() => {});
            }
          }

          const progress = await prisma.emailCampaign.findUnique({
            where: { id: campaign.id },
            select: {
              id: true,
              status: true,
              totalRecipients: true,
              sentCount: true,
              deliveredCount: true,
              openedCount: true,
              clickedCount: true,
              bouncedCount: true,
              failedCount: true,
              skippedCount: true,
            },
          });
          if (progress) emitEmail('email:campaign', progress);

          return { processed: job.data.recipientIds.length, sentCount: progress?.sentCount ?? 0 };
        }
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_EMAIL_CAMPAIGN_CONCURRENCY, 10) || 1,
      lockDuration: 600_000,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(`Email campaign batch ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
