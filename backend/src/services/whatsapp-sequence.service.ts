import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { getOrCreateConversation } from './whatsapp-conversation.service';
import { sendTemplateToConversation } from './whatsapp-send.service';

const HOUR_MS = 60 * 60 * 1000;
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
      try {
        const steps = await prisma.waCampaignStep.findMany({
          where: { campaignId: campaign.id },
          orderBy: { stepOrder: 'asc' },
        });
        if (steps.length === 0) continue;

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
          try {
            const nextStep = steps[recipient.currentStep];
            // Past the last step — sequence finished for this recipient.
            if (!nextStep) {
              await prisma.waCampaignRecipient.update({
                where: { id: recipient.id },
                data: { nextStepAt: null },
              });
              continue;
            }

            // Branch condition: drop out of the sequence if it isn't met.
            const conditionMet =
              nextStep.condition === 'replied'
                ? recipient.repliedAt != null
                : nextStep.condition === 'no_reply'
                  ? recipient.repliedAt == null
                  : true; // 'any' (or unknown) — always proceed
            if (!conditionMet) {
              await prisma.waCampaignRecipient.update({
                where: { id: recipient.id },
                data: { nextStepAt: null },
              });
              continue;
            }

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
              data: { currentStep: newCurrentStep, nextStepAt },
            });
          } catch (err) {
            logger.warn(
              `WhatsApp sequence: failed to advance recipient ${recipient.id} ` +
                `(campaign ${campaign.id}): ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      } catch (err) {
        logger.warn(
          `WhatsApp sequence: failed to process campaign ${campaign.id}: ` +
            `${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } catch (err) {
    logger.error(
      `WhatsApp sequence cron tick failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
