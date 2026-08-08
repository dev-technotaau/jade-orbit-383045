import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { getSender } from './email-sender.service';
import { getEmailSettings } from './email-settings.service';
import { getSuppressedEmailSet } from './email-suppression.service';
import { dispatchRecipient, type DispatchTemplate } from './email-dispatch.service';

/**
 * Drip (SEQUENCE) engine. A sequence campaign is NOT batch-blasted — every
 * recipient is armed at step 0 and the per-minute cron advances each recipient
 * through the ordered steps at their configured delays, honoring per-step
 * conditions (send only if opened / not opened / clicked / not clicked).
 */

const HOUR_MS = 60 * 60 * 1000;
const MAX_PER_CAMPAIGN_PER_TICK = 500;

function seqUtm(c: {
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

export interface StepInput {
  stepOrder: number;
  templateId?: string | null;
  subject?: string | null;
  delayHours?: number;
  condition?: string;
}

/** Replace all steps for a campaign (full-replace semantics). */
export async function setSequenceSteps(campaignId: string, steps: StepInput[]) {
  await prisma.emailCampaignStep.deleteMany({ where: { campaignId } });
  if (steps.length) {
    await prisma.emailCampaignStep.createMany({
      data: steps
        .slice()
        .sort((a, b) => a.stepOrder - b.stepOrder)
        .map((s, i) => ({
          campaignId,
          stepOrder: s.stepOrder ?? i,
          templateId: s.templateId ?? null,
          subject: s.subject ?? null,
          delayHours: s.delayHours ?? 24,
          condition: s.condition ?? 'any',
        })),
    });
  }
  return prisma.emailCampaignStep.findMany({
    where: { campaignId },
    orderBy: { stepOrder: 'asc' },
  });
}

export async function getSequenceSteps(campaignId: string) {
  return prisma.emailCampaignStep.findMany({
    where: { campaignId },
    orderBy: { stepOrder: 'asc' },
  });
}

/** Arm every PENDING recipient at step 0 (nextStepAt = now + step-0 delay). */
export async function startSequence(campaignId: string): Promise<void> {
  const steps = await getSequenceSteps(campaignId);
  if (!steps.length) return;
  const firstDelay = (steps[0].delayHours ?? 0) * HOUR_MS;
  const nextStepAt = new Date(Date.now() + firstDelay);
  await prisma.emailCampaignRecipient.updateMany({
    where: { campaignId, status: 'PENDING' },
    data: { currentStep: 0, nextStepAt },
  });
}

/** True when a step's condition is satisfied by the recipient's engagement. */
function conditionMet(condition: string, opened: boolean, clicked: boolean): boolean {
  switch (condition) {
    case 'opened':
      return opened;
    case 'no_open':
      return !opened;
    case 'clicked':
      return clicked;
    case 'no_click':
      return !clicked;
    case 'any':
    default:
      return true;
  }
}

/**
 * Advance all due recipients across running SEQUENCE campaigns. Returns the set
 * of touched campaign ids so the caller can recompute their counters (kept out
 * of here to avoid an import cycle with the campaign service).
 */
export async function advanceDripSteps(): Promise<{ processed: number; campaignIds: string[] }> {
  const now = new Date();
  const campaigns = await prisma.emailCampaign.findMany({
    where: { type: 'SEQUENCE', status: 'RUNNING' },
    select: {
      id: true,
      senderId: true,
      subjectOverride: true,
      templateId: true,
      fromNameOverride: true,
      replyToOverride: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      utmTerm: true,
      utmContent: true,
    },
  });
  const suppressed = await getSuppressedEmailSet();
  const settingsRow = await getEmailSettings();
  const settings = {
    trackOpens: settingsRow.trackOpens,
    trackClicks: settingsRow.trackClicks,
    footerAddress: settingsRow.footerAddress,
    footerHtml: settingsRow.footerHtml,
    marketingCapPer24h: settingsRow.marketingCapPer24h ?? 1,
  };

  const touched = new Set<string>();
  let processed = 0;

  for (const campaign of campaigns) {
    const steps = await getSequenceSteps(campaign.id);
    if (!steps.length) continue;
    const sender = await getSender(campaign.senderId).catch(() => null);
    if (!sender) continue;

    const due = await prisma.emailCampaignRecipient.findMany({
      where: {
        campaignId: campaign.id,
        nextStepAt: { lte: now, not: null },
        status: { notIn: ['FAILED', 'SKIPPED', 'BOUNCED', 'COMPLAINED'] },
      },
      take: MAX_PER_CAMPAIGN_PER_TICK,
    });
    if (!due.length) continue;
    touched.add(campaign.id);

    for (const recipient of due) {
      const stepIndex = recipient.currentStep;
      const step = steps[stepIndex];
      if (!step) {
        // Sequence complete for this recipient.
        await prisma.emailCampaignRecipient.update({
          where: { id: recipient.id },
          data: { nextStepAt: null },
        });
        continue;
      }

      const opened = !!recipient.openedAt;
      const clicked = !!recipient.clickedAt;
      const send = conditionMet(step.condition, opened, clicked);

      if (send) {
        const template = await loadStepTemplate(
          step.templateId ?? campaign.templateId,
          step.subject
        );
        if (template) {
          const result = await dispatchRecipient({
            campaignId: campaign.id,
            recipient: {
              id: recipient.id,
              email: recipient.email,
              contactId: recipient.contactId,
              trackingToken: recipient.trackingToken,
              variables: recipient.variables,
            },
            template,
            subjectOverride: step.subject || campaign.subjectOverride,
            sender: {
              fromEmail: sender.fromEmail,
              fromName: sender.fromName,
              replyTo: sender.replyTo,
              domain: sender.domain,
            },
            settings,
            suppressed: suppressed.has(recipient.email),
            fromNameOverride: campaign.fromNameOverride,
            replyToOverride: campaign.replyToOverride,
            utm: seqUtm(campaign),
          });
          processed++;
          await applyOutcome(recipient.id, result.outcome, result.providerMessageId);
          await prisma.emailCampaignStep
            .update({ where: { id: step.id }, data: { sentCount: { increment: 1 } } })
            .catch(() => {});
        }
      }

      // Advance to the next step (or finish).
      const next = steps[stepIndex + 1];
      await prisma.emailCampaignRecipient.update({
        where: { id: recipient.id },
        data: {
          currentStep: stepIndex + 1,
          nextStepAt: next ? new Date(Date.now() + (next.delayHours ?? 24) * HOUR_MS) : null,
        },
      });
    }
  }

  return { processed, campaignIds: Array.from(touched) };
}

async function loadStepTemplate(
  templateId: string | null,
  _subject: string | null
): Promise<DispatchTemplate | null> {
  if (!templateId) return null;
  const tpl = await prisma.emailTemplate.findUnique({ where: { id: templateId } });
  if (!tpl) return null;
  const footer = tpl.footerSnippetId
    ? await prisma.emailSnippet
        .findUnique({ where: { id: tpl.footerSnippetId }, select: { html: true } })
        .catch(() => null)
    : null;
  return {
    subject: tpl.subject,
    htmlBody: tpl.htmlBody,
    textBody: tpl.textBody,
    preheader: tpl.preheader,
    category: tpl.category,
    footerSnippetHtml: footer?.html ?? null,
  };
}

/** Move a drip recipient's status forward based on the send outcome. */
async function applyOutcome(
  recipientId: string,
  outcome: string,
  providerMessageId?: string
): Promise<void> {
  if (outcome === 'sent') {
    await prisma.emailCampaignRecipient
      .updateMany({
        where: { id: recipientId, status: { in: ['PENDING', 'SENT'] } },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          ...(providerMessageId ? { providerMessageId } : {}),
        },
      })
      .catch(() => {});
  } else if (outcome === 'skipped') {
    await prisma.emailCampaignRecipient
      .updateMany({ where: { id: recipientId, status: 'PENDING' }, data: { status: 'SKIPPED' } })
      .catch(() => {});
  } else {
    logger.debug(`drip send failed for recipient ${recipientId}`);
    await prisma.emailCampaignRecipient
      .updateMany({ where: { id: recipientId, status: 'PENDING' }, data: { status: 'FAILED' } })
      .catch(() => {});
  }
}
