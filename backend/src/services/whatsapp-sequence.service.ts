import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { getOrCreateConversation } from './whatsapp-conversation.service';
import { sendTemplateToConversation } from './whatsapp-send.service';
import { withLock } from '../utils/distributed-lock';

const HOUR_MS = 60 * 60 * 1000;
/** Backoff before a recipient whose step send threw is retried. */
const RETRY_DELAY_MS = 15 * 60 * 1000;
/** Max recipients advanced per cron tick — bounds DB + Cloud API load per run. */
const ADVANCE_CAP = 500;

interface SequenceStepInput {
  stepOrder: number;
  templateId: string;
  delayHours: number;
  condition?: string;
}

/**
 * Replace all steps for a SEQUENCE campaign in one transaction
 * (deleteMany + createMany). Steps are keyed by stepOrder, so a full
 * replace keeps the @@unique([campaignId, stepOrder]) constraint clean.
 */
export async function setSequenceSteps(
  campaignId: string,
  steps: SequenceStepInput[]
): Promise<void> {
  await prisma.$transaction([
    prisma.waCampaignStep.deleteMany({ where: { campaignId } }),
    prisma.waCampaignStep.createMany({
      data: steps.map((s) => ({
        campaignId,
        stepOrder: s.stepOrder,
        templateId: s.templateId,
        delayHours: s.delayHours,
        condition: s.condition ?? 'any',
      })),
    }),
  ]);
}

/** All steps for a campaign, ordered by stepOrder ascending. */
export async function getSequenceSteps(campaignId: string) {
  return prisma.waCampaignStep.findMany({
    where: { campaignId },
    orderBy: { stepOrder: 'asc' },
  });
}

/**
 * Launch a SEQUENCE campaign: arm every recipient at step 0 with
 * nextStepAt = now so the first step fires on the next cron tick.
 */
export async function startSequence(campaignId: string): Promise<void> {
  await prisma.waCampaignRecipient.updateMany({
    where: { campaignId },
    data: { currentStep: 0, nextStepAt: new Date() },
  });
}

/**
 * CRON TICK — advance every due recipient of every RUNNING SEQUENCE campaign
 * by one step. Never throws: per-recipient failures are caught and logged so a
 * single bad send can't stall the whole sweep.
 */
export async function advanceDueSequenceRecipients(): Promise<void> {
  try {
    const campaigns = await prisma.waCampaign.findMany({
      where: { type: 'SEQUENCE', status: 'RUNNING' },
      select: { id: true, channelId: true, createdBy: true },
    });

    for (const campaign of campaigns) {
      // One advance per campaign at a time, cluster-wide. The per-recipient
      // claim below already prevents double-sends; this additionally keeps the
      // completion check at the bottom from observing another tick's in-flight
      // claim window (every claimed recipient is briefly disarmed) and retiring
      // a campaign that is still running.
      await withLock(`wa:drip:${campaign.id}`, 600, async () => {
        const steps = await prisma.waCampaignStep.findMany({
          where: { campaignId: campaign.id },
          orderBy: { stepOrder: 'asc' },
        });
        if (steps.length === 0) return;

        const now = new Date();
        const due = await prisma.waCampaignRecipient.findMany({
          where: {
            campaignId: campaign.id,
            nextStepAt: { lte: now, not: null },
            status: { notIn: ['FAILED', 'SKIPPED'] },
          },
          take: ADVANCE_CAP,
        });

        for (const recipient of due) {
          // CLAIM. `nextStepAt` is the armed marker, so clearing it atomically is
          // the claim: the drip cron runs every minute at scheduler concurrency
          // 2 and a tick can take minutes of sequential Graph calls, so ticks
          // overlap. Without this, two ticks both saw the recipient as due and
          // both sent the same drip step to the same customer.
          const claim = await prisma.waCampaignRecipient.updateMany({
            where: { id: recipient.id, nextStepAt: { not: null } },
            data: { nextStepAt: null },
          });
          if (claim.count === 0) continue;

          try {
            const nextStep = steps[recipient.currentStep];
            // Past the last step — sequence finished for this recipient. The
            // claim already cleared nextStepAt, so there is nothing to write.
            if (!nextStep) continue;

            // Branch condition: drop out of the sequence if it isn't met.
            const conditionMet =
              nextStep.condition === 'replied'
                ? recipient.repliedAt != null
                : nextStep.condition === 'no_reply'
                  ? recipient.repliedAt == null
                  : true; // 'any' (or unknown) — always proceed
            // Dropped out of the sequence; the claim already disarmed it.
            if (!conditionMet) continue;

            const conversation = await getOrCreateConversation(
              campaign.channelId,
              recipient.contactId
            );
            await sendTemplateToConversation(conversation.id, campaign.createdBy ?? null, {
              templateId: nextStep.templateId,
              campaignId: campaign.id,
            });

            const newCurrentStep = recipient.currentStep + 1;
            const followingStep = steps[newCurrentStep];
            const nextStepAt = followingStep
              ? new Date(now.getTime() + followingStep.delayHours * HOUR_MS)
              : null;

            await prisma.waCampaignRecipient.update({
              where: { id: recipient.id },
              // `sentAt` is stamped so drip progress is observable at all: the
              // campaign-recovery cron's stall test counts recipients with a
              // recent `sentAt`, and nothing on this path used to write it.
              data: { currentStep: newCurrentStep, nextStepAt, sentAt: now },
            });
          } catch (err) {
            // Re-arm with a backoff. The claim above disarmed this recipient, so
            // without this a transient send failure would strand them mid-drip
            // forever — and re-arming at `now` would hot-loop the failure every
            // minute instead.
            await prisma.waCampaignRecipient
              .update({
                where: { id: recipient.id },
                data: { nextStepAt: new Date(Date.now() + RETRY_DELAY_MS) },
              })
              .catch(() => {});
            logger.warn(
              `WhatsApp sequence: failed to advance recipient ${recipient.id} ` +
                `(campaign ${campaign.id}), retrying in ${RETRY_DELAY_MS / 60000}m: ` +
                `${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
        // Completion. The campaign-recovery cron only heals BROADCASTs (a drip's
        // recipients sit PENDING by design, which that cron reads as "stalled"),
        // so a SEQUENCE has to retire itself. It is finished when no recipient
        // is still armed — every one has either walked off the end of the steps,
        // failed a branch condition, or terminated.
        const stillArmed = await prisma.waCampaignRecipient.count({
          where: {
            campaignId: campaign.id,
            nextStepAt: { not: null },
            status: { notIn: ['FAILED', 'SKIPPED'] },
          },
        });
        if (stillArmed === 0) {
          await prisma.waCampaign.update({
            where: { id: campaign.id },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
          logger.info(`WhatsApp sequence campaign ${campaign.id} COMPLETED (no armed recipients)`);
        }
      }).catch((err: unknown) => {
        logger.warn(
          `WhatsApp sequence: failed to process campaign ${campaign.id}: ` +
            `${err instanceof Error ? err.message : String(err)}`
        );
      });
    }
  } catch (err) {
    logger.error(
      `WhatsApp sequence cron tick failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
