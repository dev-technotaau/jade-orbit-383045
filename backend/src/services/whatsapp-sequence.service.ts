import { prisma } from '../config/prisma';
import type { Prisma, WaStepCondition } from '@prisma/client';
import logger from '../config/logger';
import { getOrCreateConversation } from './whatsapp-conversation.service';
import { sendTemplateToConversation } from './whatsapp-send.service';
import {
  resolveTemplateVars,
  completeCampaign,
  assertTemplatesApproved,
} from './whatsapp-campaign.service';
import { nextOpenAt } from '../utils/whatsapp-business-hours';
import { withLock } from '../utils/distributed-lock';
import { isRetryableErrorCode, isTerminalStepErrorCode } from './whatsapp-error-codes';
import { acquireChannelSendSlot } from '../jobs/whatsapp-campaign.worker';
import { appendRecipientToken, getCampaignLinkCodes } from './whatsapp-shortlink.service';

const HOUR_MS = 60 * 60 * 1000;
/** Backoff before a recipient whose step send threw is retried. */
const RETRY_DELAY_MS = 15 * 60 * 1000;
/**
 * How many times one step may fail before the recipient is retired as FAILED.
 *
 * Six attempts at the 15-minute backoff is about 90 minutes — long enough to ride
 * out a Meta wobble or a rate-limit window, short enough that a genuinely broken
 * step stops instead of hammering the Graph API forever. Retrying without a bound
 * was the bug: nothing ever terminated, and the campaign's own counters never
 * showed a failure, so the loop was invisible.
 */
const MAX_STEP_ATTEMPTS = 6;
/** Max recipients advanced per cron tick — bounds DB + Cloud API load per run. */
const ADVANCE_CAP = 500;

interface SequenceStepInput {
  stepOrder: number;
  templateId: string;
  delayHours: number;
  condition?: WaStepCondition;
  /** Per-step {{n}} mapping; resolved per recipient at send time. */
  variableMapping?: string[];
}

/**
 * Replace all steps for a SEQUENCE campaign in one transaction
 * (deleteMany + createMany). Steps are keyed by stepOrder, so a full
 * replace keeps the @@unique([campaignId, stepOrder]) constraint clean.
 */
export async function setSequenceSteps(
  campaignId: string,
  steps: SequenceStepInput[],
  opts: { validateTemplates?: boolean } = {}
): Promise<void> {
  // Refuse a step whose template Meta will not send, at the point the operator
  // chose it. Previously nothing checked a step template until the send itself,
  // which on this path was caught and retried forever.
  if (opts.validateTemplates !== false) {
    await assertTemplatesApproved(
      steps.map((st) => ({ id: st.templateId, label: `step ${st.stepOrder}` }))
    );
  }
  await prisma.$transaction([
    prisma.waCampaignStep.deleteMany({ where: { campaignId } }),
    prisma.waCampaignStep.createMany({
      data: steps.map((s) => ({
        campaignId,
        stepOrder: s.stepOrder,
        templateId: s.templateId,
        delayHours: s.delayHours,
        condition: s.condition ?? 'any',
        variableMapping: (s.variableMapping as Prisma.InputJsonValue) ?? undefined,
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
 * Launch a SEQUENCE campaign: arm every NOT-YET-STARTED recipient at step 0 so
 * the first step fires once step 1's own delay has elapsed (immediately when
 * that delay is 0, which is the default).
 *
 * The where-clause is load-bearing. This used to be an unfiltered
 * `updateMany({ where: { campaignId } })` writing `currentStep: 0`, and
 * `resumeCampaign` routes through `launchCampaign` — so resuming a paused drip
 * rewound EVERY recipient to step 0 and armed them immediately. A five-step
 * sequence paused on day three replayed steps 1-3 to the whole audience, billed
 * as fresh marketing conversations, with no confirmation and no undo.
 *
 * Only untouched recipients are armed now: `currentStep: 0` excludes anyone who
 * has advanced, and `nextStepAt: null` excludes anyone already armed or
 * in-flight (the cron claims a recipient by nulling `nextStepAt`, so a claimed
 * recipient must not be re-armed underneath it).
 */
export async function startSequence(campaignId: string): Promise<void> {
  // Step 1's configured delay is honoured here. Launch used to arm every
  // recipient at `new Date()` outright, so a first step deliberately set to
  // "+24h" — the usual shape of a drip meant to land a day after the operator
  // kicks it off — went out to the whole audience the instant the campaign
  // started, a day early, with nothing to recall it.
  const firstStep = await prisma.waCampaignStep.findFirst({
    where: { campaignId },
    orderBy: { stepOrder: 'asc' },
    select: { delayHours: true },
  });
  const armAt = new Date(Date.now() + Math.max(0, firstStep?.delayHours ?? 0) * HOUR_MS);

  await prisma.waCampaignRecipient.updateMany({
    where: {
      campaignId,
      currentStep: 0,
      nextStepAt: null,
      status: { notIn: ['FAILED', 'SKIPPED'] },
    },
    data: { nextStepAt: armAt },
  });
}

/**
 * Resume a PAUSED SEQUENCE campaign WITHOUT rewinding anyone.
 *
 * Pausing only flips `WaCampaign.status`; the drip cron filters on
 * `status: 'RUNNING'`, so recipients keep whatever `nextStepAt` they had and
 * simply stop being advanced. Flipping the campaign back to RUNNING is therefore
 * enough for every healthy recipient — this function exists solely to repair the
 * ones that were STRANDED.
 *
 * A recipient is stranded when it holds the claim (`nextStepAt = null`) but has
 * not finished the sequence, which happens if the process died between the claim
 * and the post-send update. Those are re-armed at now. `currentStep` is never
 * written, so nobody is rewound and nobody receives a step twice.
 */
export async function resumeSequence(campaignId: string): Promise<number> {
  const stepCount = await prisma.waCampaignStep.count({ where: { campaignId } });
  if (stepCount === 0) return 0;

  const { count } = await prisma.waCampaignRecipient.updateMany({
    where: {
      campaignId,
      nextStepAt: null,
      currentStep: { lt: stepCount },
      status: { notIn: ['FAILED', 'SKIPPED'] },
    },
    data: { nextStepAt: new Date() },
  });

  if (count > 0) {
    logger.info(
      `WhatsApp sequence ${campaignId}: re-armed ${count} stranded recipient(s) on resume ` +
        '(claimed but never advanced); step progress left untouched'
    );
  }
  return count;
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
      select: {
        id: true,
        channelId: true,
        createdBy: true,
        throttlePerSec: true,
        respectBusinessHours: true,
      },
    });

    // Read once for the whole sweep rather than per campaign: this runs every
    // minute and the grid is a singleton row.
    const businessHours = campaigns.some((c) => c.respectBusinessHours)
      ? ((
          await prisma.waSettings.findUnique({
            where: { id: 'default' },
            select: { businessHours: true },
          })
        )?.businessHours ?? null)
      : null;

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

        // BUSINESS-HOURS GATE (opt-in per campaign). A drip step whose delay
        // lands at 03:00 used to fire at 03:00, because `nextStepAt` is a plain
        // "previous step + delayHours" instant with no notion of when the desk
        // is open. Every due recipient is re-armed for the next open minute
        // instead — pushed forward, never dropped, so the sequence resumes in
        // order rather than skipping the step.
        if (campaign.respectBusinessHours) {
          const now = new Date();
          const opensAt = nextOpenAt(businessHours, now);
          if (!opensAt || opensAt.getTime() > now.getTime()) {
            // No open window within a week means the grid says "closed all week";
            // hold for an hour rather than re-arming everything to a date that
            // may never arrive.
            const deferTo = opensAt ?? new Date(now.getTime() + HOUR_MS);
            const { count } = await prisma.waCampaignRecipient.updateMany({
              where: {
                campaignId: campaign.id,
                nextStepAt: { lte: now, not: null },
                status: { notIn: ['FAILED', 'SKIPPED'] },
              },
              data: { nextStepAt: deferTo },
            });
            if (count > 0) {
              logger.info(
                `WhatsApp sequence ${campaign.id}: outside business hours — ` +
                  `${count} due recipient(s) deferred to ${deferTo.toISOString()}`
              );
            }
            return;
          }
        }

        // Short links get the same per-recipient `?r=` token the broadcast worker
        // appends, so a drip step's clicks are attributable too. Loaded once per
        // campaign tick, not per recipient.
        const linkCodes = await getCampaignLinkCodes(campaign.id);

        const now = new Date();
        const due = await prisma.waCampaignRecipient.findMany({
          where: {
            campaignId: campaign.id,
            nextStepAt: { lte: now, not: null },
            status: { notIn: ['FAILED', 'SKIPPED'] },
          },
          // Needed to resolve {{name}}/{{phone}}/{{attr.…}} in the step mapping.
          include: { contact: { select: { name: true, phone: true, attributes: true } } },
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
            // Per-step parameters. Drip steps used to send NONE, so any step whose
            // template carried placeholders went out blank, or was rejected by Meta
            // outright when those placeholders were required.
            const stepMapping = Array.isArray(nextStep.variableMapping)
              ? (nextStep.variableMapping as string[])
              : undefined;
            // Same cluster-wide token bucket the broadcast path uses. The drip loop
            // had NO rate gate: ADVANCE_CAP is 500, so a single tick could fire 500
            // back-to-back Graph calls at a number whose limit the operator had
            // carefully set to 15/s.
            await acquireChannelSendSlot(campaign.channelId, campaign.throttlePerSec);
            const message = await sendTemplateToConversation(
              conversation.id,
              campaign.createdBy ?? null,
              {
                templateId: nextStep.templateId,
                bodyParams: resolveTemplateVars(stepMapping, recipient.contact).map((v) =>
                  appendRecipientToken(v, recipient.contactId, linkCodes)
                ),
                campaignId: campaign.id,
              }
            );

            // A Meta rejection does NOT throw: dispatchOutbound persists a row with
            // status FAILED and an errorCode and returns it. Advancing regardless
            // marched the recipient through the whole sequence as though every step
            // had been delivered, so a customer silently received nothing while the
            // campaign reported progress.
            if (message.status === 'FAILED') {
              // Retryable, but only while attempts remain. A rate limit that never
              // clears is still a loop, and an unbounded one costs a Graph call per
              // recipient every 15 minutes with nothing to show for it.
              const attempts = recipient.stepAttempts + 1;
              const retryable =
                isRetryableErrorCode(message.errorCode) && attempts < MAX_STEP_ATTEMPTS;
              await prisma.waCampaignRecipient.update({
                where: { id: recipient.id },
                data: retryable
                  ? // Transient: re-arm the SAME step behind the backoff.
                    { nextStepAt: new Date(Date.now() + RETRY_DELAY_MS), stepAttempts: attempts }
                  : // Terminal (or out of attempts): stop the sequence and record why.
                    {
                      status: 'FAILED',
                      errorCode: message.errorCode,
                      nextStepAt: null,
                      stepAttempts: attempts,
                    },
              });
              logger.warn(
                `WhatsApp sequence: step ${recipient.currentStep + 1} failed for recipient ` +
                  `${recipient.id} (${message.errorCode ?? 'unknown'}) - ` +
                  `${retryable ? `retrying (attempt ${attempts}/${MAX_STEP_ATTEMPTS})` : 'sequence stopped'}`
              );
              continue;
            }

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
              //
              // `status` and `wamid` matter just as much. This path left every drip
              // recipient at the PENDING default with a null wamid, so
              // recomputeCampaignCounters (which groups by status) reported 0 sent /
              // 0 delivered / 0 read forever, and reconcileRecipientStatus — which
              // looks recipients up BY wamid — returned early for every delivery and
              // read receipt. A drip campaign was statistically invisible.
              data: {
                currentStep: newCurrentStep,
                nextStepAt,
                sentAt: now,
                // The counter is per-STEP, so a step that finally sends clears the
                // budget the next step gets to spend on its own retries.
                stepAttempts: 0,
                // FAILED is handled (and `continue`d) above, so anything reaching here
                // was accepted by Meta.
                status: 'SENT',
                ...(message.wamid ? { wamid: message.wamid } : {}),
                ...(message.errorCode ? { errorCode: message.errorCode } : {}),
              },
            });
          } catch (err) {
            // Classify the throw. This used to re-arm with a backoff no matter what
            // went wrong, so a permanent refusal — an unapproved template, a blocked
            // or opted-out contact — retried every 15 minutes forever: a background
            // loop against the Graph API that never reached a FAILED state, never
            // moved the campaign's counters, and showed up nowhere but a warn log.
            const code = (err as { code?: string } | null)?.code ?? null;
            const attempts = recipient.stepAttempts + 1;
            const terminal = isTerminalStepErrorCode(code) || attempts >= MAX_STEP_ATTEMPTS;
            await prisma.waCampaignRecipient
              .update({
                where: { id: recipient.id },
                data: terminal
                  ? // Stop this recipient's sequence and say why, so the failure is
                    // visible in the recipients table and the campaign counters.
                    {
                      status: 'FAILED',
                      errorCode: code ?? 'WA_STEP_FAILED',
                      nextStepAt: null,
                      stepAttempts: attempts,
                    }
                  : // Transient: the claim above disarmed this recipient, so without
                    // a re-arm they would be stranded mid-drip — and re-arming at
                    // `now` would hot-loop the failure every minute instead.
                    { nextStepAt: new Date(Date.now() + RETRY_DELAY_MS), stepAttempts: attempts },
              })
              .catch(() => {});
            logger.warn(
              `WhatsApp sequence: failed to advance recipient ${recipient.id} ` +
                `(campaign ${campaign.id})${code ? ` [${code}]` : ''}: ` +
                `${terminal ? `sequence stopped after ${attempts} attempt(s)` : `retrying in ${RETRY_DELAY_MS / 60000}m`} - ` +
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
          // Same reason as the recovery cron: this path never armed the next
          // recurrence, so a recurring drip retired itself permanently.
          await completeCampaign(campaign.id);
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
