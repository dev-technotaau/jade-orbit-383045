import { prisma } from '../config/prisma';
import { withinBusinessHours } from '../utils/whatsapp-business-hours';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { waAutomationTotal } from '../utils/whatsapp-metrics';
import { emitWa } from '../utils/whatsapp-realtime';
import { windowOpen } from './whatsapp-conversation.service';
import {
  sendSessionMessage,
  sendTemplateToConversation,
  sendInteractiveMessage,
} from './whatsapp-send.service';
import { resolveTemplateVars } from './whatsapp-campaign.service';
import { listActiveFaqsForMenu } from './whatsapp-faq.service';
import { isRetryableErrorCode } from './whatsapp-error-codes';
import {
  readFlowState,
  saveFlowState,
  interpolate,
  validateAnswer,
  entryStep,
  stepChoices,
} from './whatsapp-botflow.service';
import { hasContactTokens, resolveContactTokens } from '../utils/wa-contact-tokens';
import type { WaFlowState } from './whatsapp-botflow.service';
import type { WaBotFlow, WaBotStep } from '@prisma/client';

/**
 * Expand `{{name}}`-style tokens in a keyword rule's reply.
 *
 * The rule's text was sent verbatim, so a reply written as "Hi {{name}}, your
 * order is on the way" reached the customer with the braces intact — the
 * operator's own personalisation rendered to them as markup.
 *
 * The contact is fetched only when the text actually carries a token, so the
 * overwhelmingly common plain reply costs no extra round trip.
 */
async function expandRuleText(text: string, conversationId: string): Promise<string> {
  if (!hasContactTokens(text)) return text;
  const conv = await prisma.waConversation
    .findUnique({
      where: { id: conversationId },
      select: {
        contact: { select: { name: true, profileName: true, phone: true, attributes: true } },
      },
    })
    .catch(() => null);
  return resolveContactTokens(text, conv?.contact ?? null);
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Fallback away debounce, used only when the settings row carries no
 * `awayDebounceMinutes` (a fresh install, or a row written before the column
 * existed). The operator-facing value lives on WaSettings: 30 minutes is far too
 * long for a busy desk and far too short for a number that is staffed weekly,
 * and it used to be this constant with no way to see or change it.
 */
const AWAY_DEBOUNCE_MINUTES_DEFAULT = 30;

/** Never let the configured interval go below a minute — see awayDebounceSeconds. */
const AWAY_DEBOUNCE_MIN_SECONDS = 60;

/**
 * The away debounce for this settings row, in seconds.
 *
 * Floored at 60s deliberately: the claim is also what stops two messages that
 * arrive together from both being answered, so a zero/negative interval would
 * turn every inbound burst into a burst of identical away replies.
 */
function awayDebounceSeconds(settings: { awayDebounceMinutes?: number | null }): number {
  const minutes = settings.awayDebounceMinutes ?? AWAY_DEBOUNCE_MINUTES_DEFAULT;
  return Math.max(AWAY_DEBOUNCE_MIN_SECONDS, Math.round(minutes * 60));
}

/** How recently a human reply suppresses the bot on that thread. */
const AGENT_ACTIVE_MS = 30 * 60 * 1000;

/**
 * How long a 'handoff' rule silences the bot on the thread it escalated.
 *
 * Escalating and then immediately answering the next message with a canned reply
 * is worse than not escalating at all — the customer has been told a human is
 * coming and the bot keeps talking over them. Long enough for an agent to pick
 * the thread up; an agent reply extends it via the recent-reply guard anyway.
 */
const HANDOFF_PAUSE_MS = 60 * 60 * 1000;

/**
 * Loop protection.
 *
 * The engine had exactly one throttle — a 30-minute debounce on the AWAY branch —
 * and none at all on the FAQ menu or on keyword rules. Two automated systems
 * talking to each other (an IVR bridge, a shared inbox with its own bot, a
 * customer's out-of-office) therefore ping-ponged indefinitely: each inbound
 * produced an outbound, which produced an inbound. Every message is billable and
 * counts toward the number's quality rating.
 *
 * Fails OPEN on a Redis error — the same trade the inbound dedup makes: missing a
 * throttle is better than dropping every automated reply.
 */
const AUTO_REPLY_PER_10MIN = 5;
const AUTO_REPLY_PER_DAY = 20;
const RULE_COOLDOWN_SECONDS = 60;

async function allowAutoReply(conversationId: string, ruleKey?: string): Promise<boolean> {
  try {
    const bucket = Math.floor(Date.now() / 600_000);
    const shortKey = `wa:auto:${conversationId}:${bucket}`;
    const shortCount = await redis.incr(shortKey);
    await redis.expire(shortKey, 900);
    if (shortCount > AUTO_REPLY_PER_10MIN) return false;

    const day = new Date().toISOString().slice(0, 10);
    const dayKey = `wa:auto:day:${conversationId}:${day}`;
    const dayCount = await redis.incr(dayKey);
    await redis.expire(dayKey, 86_400);
    if (dayCount > AUTO_REPLY_PER_DAY) return false;

    if (ruleKey) {
      const claimed = await redis.set(
        `wa:auto:rule:${ruleKey}:${conversationId}`,
        '1',
        'EX',
        RULE_COOLDOWN_SECONDS,
        'NX'
      );
      if (!claimed) return false;
    }
    return true;
  } catch {
    return true;
  }
}

/** DECR a spent budget counter, deleting it at zero so it never outlives its TTL. */
async function unspend(key: string): Promise<void> {
  if ((await redis.decr(key)) <= 0) await redis.del(key);
}

/**
 * Hand back the loop-protection budget an attempt spent when it turned out to
 * send nothing.
 *
 * The claims above are taken BEFORE the send, which is the only way two inbound
 * messages arriving together cannot both reply. That is only safe if a failed
 * attempt gives them back: this now runs as a BullMQ job that retries within
 * seconds, and a rule still sitting on the 60s cooldown its own failed attempt
 * took would answer the retry with "throttled" — the retry would look like a
 * success while the customer went on waiting for a reply that was never sent.
 */
async function releaseAutoReply(conversationId: string, ruleKey?: string): Promise<void> {
  try {
    if (ruleKey) await redis.del(`wa:auto:rule:${ruleKey}:${conversationId}`);
    // Recomputed rather than remembered: an attempt that straddles a bucket
    // boundary refunds the new bucket instead, which costs at most one extra
    // allowed reply in that window.
    await unspend(`wa:auto:${conversationId}:${Math.floor(Date.now() / 600_000)}`);
    await unspend(`wa:auto:day:${conversationId}:${new Date().toISOString().slice(0, 10)}`);
  } catch {
    // Best-effort, like the claim itself: a stale claim costs one throttled retry.
  }
}

/**
 * Claim the right to send THE away message on this conversation for the next
 * `ttlSeconds`. False means someone else already holds it.
 *
 * This replaced a read of persisted state — "is there any OUTBOUND row in the
 * last 30 minutes?" — which was wrong in both directions. It only became true
 * once a send had been written, so two messages landing together (the inbound
 * worker runs at concurrency 10) both saw an empty window and both sent the away
 * message; and because a failed send persists a FAILED row too, one Graph hiccup
 * suppressed the away reply for the next half hour and the customer got silence.
 * SET NX is decided by Redis, so exactly one caller can win.
 *
 * The TTL comes from WaSettings rather than a module constant, so the interval is
 * whatever the operator set on the Auto-reply card.
 */
async function claimAwayReply(conversationId: string, ttlSeconds: number): Promise<boolean> {
  try {
    const claimed = await redis.set(`wa:away:${conversationId}`, '1', 'EX', ttlSeconds, 'NX');
    return claimed !== null;
  } catch {
    return true; // fails OPEN, the same trade allowAutoReply makes
  }
}

/** Give the away claim back when the reply did not actually go out. */
async function releaseAwayReply(conversationId: string): Promise<void> {
  try {
    await redis.del(`wa:away:${conversationId}`);
  } catch {
    // Best-effort — worst case the next away waits out the 30-minute TTL.
  }
}

/**
 * Turn a transient send failure into a throw.
 *
 * `dispatchOutbound` persists a FAILED WaMessage and RETURNS it rather than
 * throwing, so from in here a Meta 500 or a 15s Graph timeout was
 * indistinguishable from a delivered reply. Now that the engine runs as a queued
 * job, throwing is what buys the retry — without this the one reply the customer
 * was owed is dropped on the first blip and nothing ever tries again. Permanent
 * errors are deliberately NOT thrown: re-sending those cannot succeed.
 */
function assertDelivered(kind: string, sent: { status?: string; errorCode?: string | null }): void {
  if (sent?.status === 'FAILED' && isRetryableErrorCode(sent.errorCode)) {
    throw new Error(`${kind} failed transiently (${sent.errorCode})`);
  }
}

/**
 * Send the FAQ interactive list (one row per active FAQ). Returns false when
 * there are no FAQs to show. WhatsApp caps list-row titles at 24 chars, so the
 * (short) question is the title and its longer form goes into the description.
 *
 * `known` lets a caller that has already read the live list hand it over rather
 * than pay for the same query twice — handleMissingFaq reads it to decide
 * whether there is anything left to offer at all.
 */
async function sendFaqMenu(
  conversationId: string,
  known?: Awaited<ReturnType<typeof listActiveFaqsForMenu>>
): Promise<boolean> {
  const faqs = known ?? (await listActiveFaqsForMenu());
  if (faqs.length === 0) return false;
  const sent = await sendInteractiveMessage(conversationId, null as any, {
    kind: 'list',
    bodyText: 'Frequently asked questions — tap a topic and we’ll reply right away.',
    listButton: 'View topics',
    sections: [
      {
        title: 'FAQs',
        rows: faqs.map((f) => ({
          id: `faq_${f.id}`,
          title: f.question.slice(0, 24),
          ...(f.question.length > 24 ? { description: f.question.slice(0, 72) } : {}),
        })),
      },
    ],
  });
  assertDelivered('WhatsApp FAQ menu', sent);
  return true;
}

/** Said when a customer taps an FAQ row the operator has retired, and no
 *  replacement sentence is configured. */
const FAQ_MISSING_FALLBACK =
  'Sorry — that topic is no longer available. Here are the ones we can help with right now.';

/**
 * Answer a tap on an FAQ row that no longer exists (deleted) or has been
 * switched off, and say how it went.
 *
 * Returns false only when there is genuinely nothing to say — no fallback text
 * and no active FAQs left — so the caller can fall through to the rest of the
 * ladder instead of ending the pass in the same silence this exists to remove.
 */
async function handleMissingFaq(
  conversationId: string,
  settings: { faqFallbackMessage?: string | null } | null
): Promise<boolean> {
  const configured = settings?.faqFallbackMessage?.trim();
  // What is left to offer, read BEFORE allowAutoReply: that call INCRs the
  // thread's budget counters, so spending it here and then handing the pass
  // back would silence the keyword or away reply we are handing it back TO.
  const liveFaqs = await listActiveFaqsForMenu();
  // Nothing to say at all. FAQ_MISSING_FALLBACK ends by promising the topics
  // that ARE available, so sending it once every FAQ has been retired leaves
  // the customer reading "here are the ones we can help with right now" with
  // nothing after it — a worse answer than the away message or a keyword rule,
  // which is what the ladder below will now get to give them. Counted so an
  // operator can still see stale-menu taps the FAQ layer could not answer.
  if (!configured && liveFaqs.length === 0) {
    waAutomationTotal.inc({ kind: 'faq_answer', outcome: 'unanswered' });
    return false;
  }
  const text = configured || FAQ_MISSING_FALLBACK;
  if (!(await allowAutoReply(conversationId, 'faq_missing'))) {
    waAutomationTotal.inc({ kind: 'faq_answer', outcome: 'throttled' });
    return true; // budget spent talking on this thread already — say nothing more
  }
  try {
    const sent = await sendSessionMessage(conversationId, null as any, { type: 'text', text });
    assertDelivered('WhatsApp FAQ fallback', sent);
    // Counted separately from a served answer: a menu whose rows point at
    // retired topics is an operator problem, and without this the miss looked
    // exactly like nothing having happened at all.
    waAutomationTotal.inc({ kind: 'faq_answer', outcome: 'missing' });
    // Re-offer the live list, reusing the rows read above. Best-effort — the
    // apology has already landed, and failing the job here would re-send it on
    // the retry. Skipped outright when the operator's own sentence is standing
    // in for an empty list, which is the one case that gets this far with none.
    if (liveFaqs.length > 0) await sendFaqMenu(conversationId, liveFaqs).catch(() => false);
    return true;
  } catch (e) {
    waAutomationTotal.inc({ kind: 'faq_answer', outcome: 'failed' });
    logger.warn(`WhatsApp FAQ fallback failed: ${(e as Error).message}`);
    await releaseAutoReply(conversationId, 'faq_missing');
    throw e;
  }
}

/**
 * Route a conversation to a human: set the status the rule asks for, assign it,
 * apply the triage label and silence the bot on the thread.
 *
 * The bot had no way to escalate at all. A customer typing "agent" got whatever
 * canned sentence the rule carried and the thread was left exactly as it was —
 * unassigned, unlabelled, indistinguishable in the queue from one nobody had
 * asked about. The `wa:conversation` emit is what makes the routed thread appear
 * in the agent's inbox immediately rather than on their next refresh.
 */
async function handOffToHuman(
  conversationId: string,
  currentLabels: string[],
  rule: {
    handoffAssignee: string | null;
    handoffLabel: string | null;
    handoffStatus: string | null;
  }
): Promise<void> {
  const label = rule.handoffLabel?.trim();
  const conversation = await prisma.waConversation.update({
    where: { id: conversationId },
    data: {
      ...(rule.handoffStatus === 'OPEN' || rule.handoffStatus === 'PENDING'
        ? { status: rule.handoffStatus }
        : {}),
      ...(rule.handoffAssignee?.trim() ? { assignedTo: rule.handoffAssignee.trim() } : {}),
      ...(label && !currentLabels.includes(label) ? { labels: [...currentLabels, label] } : {}),
      botPausedUntil: new Date(Date.now() + HANDOFF_PAUSE_MS),
    },
  });
  emitWa('wa:conversation', { conversationId, conversation }, conversationId);
}

/* ── Bot flows ────────────────────────────────────────────────────────────── */

/**
 * Steps executed in one turn before the engine gives up.
 *
 * `nextStepKey` is operator-authored and nothing stops it pointing backwards, so
 * a flow can contain a cycle of `message` steps that never waits for input. A
 * bound turns that authoring mistake into one truncated conversation and a log
 * line, instead of an unbounded loop billing a message per iteration.
 */
const MAX_FLOW_STEPS_PER_TURN = 12;

/** Interpolate an operator-authored line with everything captured so far. */
function flowText(raw: string | null | undefined, slots: Record<string, string>): string {
  return raw ? interpolate(raw, slots).trim() : '';
}

/** Finish a session: clear the state and, when it ran to the end, count it. */
async function endFlow(conversationId: string, flowId: string, completed: boolean): Promise<void> {
  await saveFlowState(conversationId, null);
  if (!completed) return;
  void prisma.waBotFlow
    .update({ where: { id: flowId }, data: { completedCount: { increment: 1 } } })
    .catch(() => {});
}

/**
 * Run a flow from `startStep` until it needs the customer to say something.
 *
 * Everything that does NOT wait for input (message, set_attribute,
 * send_template) is executed in this one turn, which is what makes "thanks —
 * one moment" followed by a template feel like a single reply rather than three
 * messages spread across three inbound messages the customer never sent.
 *
 * Sends inside a flow are exempt from the per-rule cooldown but NOT from the
 * per-conversation budget: `allowAutoReply` is taken once for the turn by the
 * caller, so a flow cannot become the loop the throttle exists to prevent.
 */
async function runFlow(
  conversationId: string,
  contactId: string,
  labels: string[],
  flow: WaBotFlow & { steps: WaBotStep[] },
  state: WaFlowState,
  startStep: WaBotStep | null
): Promise<void> {
  let step: WaBotStep | null = startStep;
  let guard = 0;
  while (step) {
    if (++guard > MAX_FLOW_STEPS_PER_TURN) {
      logger.warn(
        `WhatsApp bot flow ${flow.id} exceeded ${MAX_FLOW_STEPS_PER_TURN} steps in one turn ` +
          `(a nextStepKey cycle?) — the session was ended at step "${step.key}"`
      );
      await endFlow(conversationId, flow.id, false);
      return;
    }
    const nextOf = (s: WaBotStep): WaBotStep | null =>
      s.nextStepKey ? (flow.steps.find((x) => x.key === s.nextStepKey) ?? null) : null;

    switch (step.kind) {
      case 'ask': {
        const prompt = flowText(step.prompt, state.slots);
        if (prompt) {
          const sent = await sendSessionMessage(conversationId, null as any, {
            type: 'text',
            text: prompt,
          });
          assertDelivered(`WhatsApp bot flow ${flow.id}`, sent);
        }
        // Parked. The state is written AFTER the send so a failed send (which
        // throws for the retry) cannot leave the customer waiting on a question
        // they were never asked.
        await saveFlowState(conversationId, { ...state, stepKey: step.key, retries: 0 });
        return;
      }
      case 'choice': {
        const choices = stepChoices(step).slice(0, 3);
        const sent = await sendInteractiveMessage(conversationId, null as any, {
          kind: 'button',
          bodyText: flowText(step.prompt, state.slots) || 'Please choose:',
          // The id encodes the step, so an answer to a question asked ten
          // minutes ago cannot be applied to whatever step the customer is on
          // now — WhatsApp buttons stay tappable in the chat history.
          buttons: choices.map((c, i) => ({
            id: `flow_${step!.key}_${i}`,
            title: c.label.slice(0, 20),
          })),
        });
        assertDelivered(`WhatsApp bot flow ${flow.id}`, sent);
        await saveFlowState(conversationId, { ...state, stepKey: step.key, retries: 0 });
        return;
      }
      case 'set_attribute': {
        const key = step.saveAs?.trim();
        if (key) {
          const value = flowText(step.value, state.slots);
          // Read-modify-write on a jsonb column the import path also writes.
          // Merged rather than replaced: a flow that captured an email must not
          // erase the tags and attributes an import put there.
          const contact = await prisma.waContact.findUnique({
            where: { id: contactId },
            select: { attributes: true },
          });
          const attrs =
            contact?.attributes && typeof contact.attributes === 'object'
              ? (contact.attributes as Record<string, unknown>)
              : {};
          await prisma.waContact.update({
            where: { id: contactId },
            data: { attributes: { ...attrs, [key]: value } as any },
          });
        }
        step = nextOf(step);
        continue;
      }
      case 'send_template': {
        if (step.templateId) {
          const mapping = Array.isArray(step.templateVariables)
            ? (step.templateVariables as string[])
            : [];
          // Template parameters come from the slots this session captured, so a
          // flow can hand what it just collected straight to an approved
          // template — the only way to say anything once the 24h window shuts.
          const sent = await sendTemplateToConversation(conversationId, null, {
            templateId: step.templateId,
            bodyParams: mapping.map((m) => interpolate(String(m), state.slots)),
          });
          assertDelivered(`WhatsApp bot flow ${flow.id}`, sent);
        }
        step = nextOf(step);
        continue;
      }
      case 'handoff': {
        await handOffToHuman(conversationId, labels, {
          handoffAssignee: step.handoffAssignee,
          handoffLabel: step.handoffLabel,
          handoffStatus: step.handoffStatus,
        });
        const bye = flowText(step.prompt, state.slots);
        if (bye) {
          const sent = await sendSessionMessage(conversationId, null as any, {
            type: 'text',
            text: bye,
          });
          assertDelivered(`WhatsApp bot flow ${flow.id}`, sent);
        }
        // Reaching a human IS the successful outcome of a qualification flow.
        await endFlow(conversationId, flow.id, true);
        return;
      }
      case 'end':
      case 'message':
      default: {
        const line = flowText(step.prompt, state.slots);
        if (line) {
          const sent = await sendSessionMessage(conversationId, null as any, {
            type: 'text',
            text: line,
          });
          assertDelivered(`WhatsApp bot flow ${flow.id}`, sent);
        }
        if (step.kind === 'end') {
          await endFlow(conversationId, flow.id, true);
          return;
        }
        step = nextOf(step);
        continue;
      }
    }
  }
  // Ran off the end of the graph — a step with no `nextStepKey` finishes the
  // flow, which is how a simple linear script terminates without an `end` step.
  await endFlow(conversationId, flow.id, true);
}

/**
 * Apply the customer's message to the flow they are already in.
 *
 * Returns false when nothing was running (or the session had gone stale), which
 * tells the caller to carry on down the normal ladder.
 */
async function advanceBotFlow(opts: {
  conversationId: string;
  contactId: string;
  labels: string[];
  state: WaFlowState;
  text: string | null;
  buttonId?: string | null;
  buttonTitle?: string | null;
}): Promise<boolean> {
  const flow = await prisma.waBotFlow.findUnique({
    where: { id: opts.state.flowId },
    include: { steps: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } },
  });
  // The flow was deleted or switched off underneath a live session. Ending it
  // silently is the only safe move: every further message would otherwise be
  // read as an answer to a question that no longer exists.
  if (!flow || !flow.isActive) {
    await saveFlowState(opts.conversationId, null);
    return false;
  }
  const step = flow.steps.find((s) => s.key === opts.state.stepKey) ?? null;
  if (!step) {
    await saveFlowState(opts.conversationId, null);
    return false;
  }

  const answerRaw = (opts.buttonTitle || opts.text || '').trim();

  // ESCAPE. A flow with no way out is a trap: without this, every message the
  // customer sends is swallowed as an answer and they cannot reach the FAQ menu,
  // a keyword rule or a human — they are stuck talking to a form.
  if (
    answerRaw &&
    (flow.escapeKeywords ?? []).some((kw) => keywordMatches('exact', kw, answerRaw))
  ) {
    await saveFlowState(opts.conversationId, null);
    const bye = flowText(flow.cancelMessage, opts.state.slots);
    if (bye) {
      const sent = await sendSessionMessage(opts.conversationId, null as any, {
        type: 'text',
        text: bye,
      });
      assertDelivered(`WhatsApp bot flow ${flow.id}`, sent);
    }
    waAutomationTotal.inc({ kind: 'bot_flow', outcome: 'sent' });
    return true;
  }

  if (step.kind === 'choice') {
    const choices = stepChoices(step);
    // Three ways to answer a button: tap it (the id we minted), type the label,
    // or type its position. Customers do all three, and only the first one used
    // to be conceivable at all.
    const byId = opts.buttonId?.startsWith(`flow_${step.key}_`)
      ? choices[Number(opts.buttonId.slice(`flow_${step.key}_`.length))]
      : undefined;
    const byText =
      byId ??
      choices.find(
        (c) =>
          keywordMatches('exact', c.label, answerRaw) ||
          (c.value ? keywordMatches('exact', c.value, answerRaw) : false)
      ) ??
      (/^[1-9]$/.test(answerRaw) ? choices[Number(answerRaw) - 1] : undefined);
    if (!byText) {
      // Unrecognised: re-offer rather than guess. Guessing is worse than asking
      // again — it silently routes the customer down a branch they did not pick.
      const retry = flowText(step.retryMessage, opts.state.slots);
      const sent = await sendInteractiveMessage(opts.conversationId, null as any, {
        kind: 'button',
        bodyText: retry || flowText(step.prompt, opts.state.slots) || 'Please choose:',
        buttons: choices
          .slice(0, 3)
          .map((c, i) => ({ id: `flow_${step.key}_${i}`, title: c.label.slice(0, 20) })),
      });
      assertDelivered(`WhatsApp bot flow ${flow.id}`, sent);
      waAutomationTotal.inc({ kind: 'bot_flow', outcome: 'sent' });
      return true;
    }
    const slots = { ...opts.state.slots };
    if (step.saveAs) slots[step.saveAs] = byText.value ?? byText.label;
    const next =
      (byText.next ? flow.steps.find((s) => s.key === byText.next) : null) ??
      (step.nextStepKey ? (flow.steps.find((s) => s.key === step.nextStepKey) ?? null) : null);
    await runFlow(
      opts.conversationId,
      opts.contactId,
      opts.labels,
      flow,
      { ...opts.state, slots },
      next
    );
    waAutomationTotal.inc({ kind: 'bot_flow', outcome: 'sent' });
    return true;
  }

  // `ask` — everything else is executed without waiting, so a session can only
  // ever be parked on `ask` or `choice`.
  if (!validateAnswer(step.validation, answerRaw)) {
    const retries = (opts.state.retries ?? 0) + 1;
    await saveFlowState(opts.conversationId, { ...opts.state, retries });
    const retry =
      flowText(step.retryMessage, opts.state.slots) ||
      'Sorry, that does not look right — could you try again?';
    const sent = await sendSessionMessage(opts.conversationId, null as any, {
      type: 'text',
      text: retry,
    });
    assertDelivered(`WhatsApp bot flow ${flow.id}`, sent);
    waAutomationTotal.inc({ kind: 'bot_flow', outcome: 'sent' });
    return true;
  }

  const slots = { ...opts.state.slots };
  if (step.saveAs) slots[step.saveAs] = answerRaw;
  const next = step.nextStepKey
    ? (flow.steps.find((s) => s.key === step.nextStepKey) ?? null)
    : null;
  await runFlow(
    opts.conversationId,
    opts.contactId,
    opts.labels,
    flow,
    { ...opts.state, slots },
    next
  );
  waAutomationTotal.inc({ kind: 'bot_flow', outcome: 'sent' });
  return true;
}

/**
 * Start a flow whose trigger keywords match this message, if any.
 *
 * Returns false when nothing matched, so the caller falls through to the keyword
 * rules below. Ordering against those rules is deliberate and documented on the
 * ladder: a flow is a longer, more specific interaction than a one-shot rule, so
 * it wins on the words the operator gave it.
 */
async function tryStartBotFlow(opts: {
  conversationId: string;
  contactId: string;
  labels: string[];
  candidates: string[];
}): Promise<boolean> {
  const flows = await prisma.waBotFlow.findMany({
    where: { isActive: true, triggerType: 'keyword' },
    include: { steps: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } },
    orderBy: { createdAt: 'asc' },
  });
  for (const flow of flows) {
    const matched = (flow.triggerKeywords ?? []).some((kw) =>
      opts.candidates.some((c) => keywordMatches(flow.triggerMatchType, kw, c))
    );
    if (!matched) continue;
    const first = entryStep(flow);
    // A flow with no steps matches its keyword and then has nothing to say. It
    // must not swallow the message: falling through lets a keyword rule or the
    // away message answer instead of the customer getting silence.
    if (!first) continue;
    const state: WaFlowState = {
      flowId: flow.id,
      stepKey: first.key,
      slots: {},
      startedAt: new Date().toISOString(),
      retries: 0,
    };
    await runFlow(opts.conversationId, opts.contactId, opts.labels, flow, state, first);
    void prisma.waBotFlow
      .update({
        where: { id: flow.id },
        data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
      })
      .catch(() => {});
    waAutomationTotal.inc({ kind: 'bot_flow', outcome: 'sent' });
    return true;
  }
  return false;
}

/**
 * Business-hours logic lives in a dependency-free util now.
 *
 * Re-exported rather than moved outright: the campaign worker and the drip loop
 * both need to ask "is the desk open?", and importing this service to get it
 * closed a cycle (campaign.service -> sequence.service -> here -> campaign.service).
 * The pure-logic suite asserts them through this module, which keeps working.
 */
export {
  parseHmToMinutes,
  nowInTz,
  withinBusinessHours,
  nextOpenAt,
} from '../utils/whatsapp-business-hours';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Longest inbound message we will run a rule pattern against (ReDoS bound). */
const MAX_MATCH_LEN = 4000;

/** Every matchType the engine implements — mirrored by the zod enums. */
const VALID_MATCH_TYPES = ['exact', 'contains', 'starts', 'substring', 'regex'] as const;
/** Bad matchType values already reported, so the warn is once per value, not per message. */
const warnedMatchTypes = new Set<string>();

/**
 * Match an inbound message against one rule.
 *
 * Normalisation matters more than it looks: WhatsApp clients emit full-width and
 * composed forms freely, and `exact` compared raw strings — so a customer whose
 * keyboard produced "ＳＴＯＰ", or who typed "price?" instead of "price", simply
 * never matched a rule the operator had tested by hand.
 *
 * `contains` is now word-boundary aware. It used to be a bare `includes`, so a
 * rule on "no" fired on "notes", "now" and "another" — and because the loop
 * returns after the first hit, a single over-broad rule silently shadowed every
 * rule below it. The old permissive behaviour is still available, explicitly, as
 * `substring`.
 */
export function keywordMatches(matchType: string, keyword: string, haystack: string): boolean {
  const k = keyword.normalize('NFKC').trim().toLowerCase();
  if (!k) return false;
  const raw = haystack.normalize('NFKC').trim().toLowerCase().slice(0, MAX_MATCH_LEN);
  if (!raw) return false;
  // Strip framing punctuation so "price?" and "«price»" behave like "price".
  const h = raw.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
  switch (matchType) {
    case 'exact':
      return h === k;
    case 'starts':
      return h.startsWith(k);
    case 'substring':
      return raw.includes(k);
    case 'regex':
      try {
        // Bounded source length: a rule is operator-authored, but an unbounded
        // pattern over a 4k message is still a cheap way to stall the worker.
        if (k.length > 200) return false;
        return new RegExp(k, 'iu').test(raw);
      } catch {
        return false; // an invalid pattern must not take the engine down
      }
    case 'contains':
      try {
        return new RegExp(`(^|\\P{L})${escapeRegex(k)}(\\P{L}|$)`, 'iu').test(raw);
      } catch {
        return raw.includes(k);
      }
    default:
      // An unrecognised matchType must NOT quietly behave like `contains`: the
      // rule would then fire on inputs the operator never asked for while the
      // row on screen claimed something else. Refuse it and say so once per
      // distinct bad value (this runs per inbound message).
      if (!warnedMatchTypes.has(matchType)) {
        warnedMatchTypes.add(matchType);
        logger.warn(
          `WhatsApp keyword rule has an unknown matchType "${matchType}" — the rule is ignored. ` +
            `Valid values: ${VALID_MATCH_TYPES.join(', ')}.`
        );
      }
      return false;
  }
}

/**
 * Inbound auto-reply engine, run as one BullMQ job per inbound message
 * (whatsapp-autoreply-queue).
 *
 * Failures PROPAGATE. It used to be fired and forgotten from the inbound worker
 * with every error caught and logged, so a Meta 500 or a Prisma pool timeout
 * lost the customer's reply for good and left one warn line behind; throwing is
 * what lets the job retry, and what puts a reply that keeps failing somewhere an
 * operator can see it.
 *
 * Priority — the ladder as the code below actually evaluates it. It is longer
 * than "keyword rules, then welcome, then away", and two of the steps are easy
 * to be surprised by, so it is spelled out in full:
 *
 *   0. Guards, any of which end the pass in silence: the contact opted out, the
 *      master `autoReplyEnabled` switch is off, the 24h session window is shut,
 *      or an agent paused the bot on this thread. The master switch gates
 *      EVERYTHING below it, keyword rules included — the note this block used to
 *      carry, that rules "fire even if autoReplyEnabled is off", describes
 *      behaviour that no longer exists. (With no WaSettings row at all there is
 *      no switch to be off, and the layers that do not read settings still run.)
 *   1. FAQ answer, when the inbound carries a `faq_`-prefixed button id. Answers
 *      and RETURNS — ahead of the agent-active guard below, because a tap on a
 *      menu the bot itself sent is a direct request. A tap on a topic that has
 *      since been deleted or deactivated gets the fallback sentence plus the
 *      current menu, and only falls through to the layers below when there is
 *      nothing left to offer at all.
 *   2. A recent human reply on the thread ends the pass (handoff).
 *   3. A bot-flow session already running on this thread is advanced with this
 *      message and the pass ends. It outranks everything below because the
 *      customer is mid-answer: reading "yes" as a keyword rule when it is the
 *      reply to the question the bot just asked is exactly the failure a
 *      stateful engine exists to prevent. An idle session past its flow's
 *      timeout, or one whose thread a human has taken over, is dropped instead.
 *   4. FAQ trigger keywords (`faqTriggerKeywords`, "menu"/"faq"/"help" by
 *      default) send the FAQ list and return, so a trigger word SHADOWS any
 *      keyword rule on the same word. The two are edited on different cards of
 *      the Settings page, which is why KeywordRulesManager states this order and
 *      KeywordRuleModal warns on the collision.
 *   5. Bot-flow trigger keywords START a flow, ahead of the keyword rules: a
 *      flow is the longer and more specific interaction on the same word.
 *   6. Active keyword rules, priority desc; the first match that is not on
 *      cooldown replies and returns.
 *   7. First contact -> welcome message (plus the FAQ list when it is enabled).
 *   8. Otherwise away message, when the away toggle is on or we are outside
 *      business hours, debounced by the operator's configured interval.
 *
 * At most one auto-reply is sent per inbound.
 */
export async function handleInboundAutoReply(opts: {
  conversationId: string;
  contactId: string;
  channelId: string;
  text: string | null;
  buttonId?: string | null;
  /** The label the customer actually saw on the button they tapped. */
  buttonTitle?: string | null;
  isNewConversation: boolean;
}): Promise<void> {
  try {
    const settings = await prisma.waSettings.findUnique({ where: { id: 'default' } });

    const conv = await prisma.waConversation.findUnique({
      where: { id: opts.conversationId },
      select: {
        windowExpiresAt: true,
        botPausedUntil: true,
        labels: true,
        flowState: true,
        flowStateUpdatedAt: true,
        contact: { select: { optInStatus: true } },
      },
    });
    if (!conv) return;

    // CONSENT. Nothing proactive goes to someone who opted out.
    //
    // The only opt-out awareness lived in the caller, and only for the single
    // message that CONTAINED the keyword — so a customer who replied STOP kept
    // receiving welcome, away and keyword replies on every message after it.
    // optOutContact writes no WaSuppression row either, so the send-time
    // suppression check never caught them: the person had unsubscribed and the bot
    // carried on talking.
    if (conv.contact?.optInStatus === 'OPTED_OUT') return;

    // MASTER SWITCH. The UI presents one "Enable automatic replies" checkbox, but
    // keyword rules ran unconditionally and the FAQ menu gated only on its own
    // flag — so turning automation off left the bot answering. If the operator
    // says off, everything automatic is off.
    if (settings && settings.autoReplyEnabled === false) return;
    // Can't free-form (or send keyword text) outside the open 24h window.
    if (!windowOpen(conv.windowExpiresAt)) return;

    // HANDOFF. The bot had no concept of a human taking over: an agent could be
    // mid-escalation with an angry customer and a keyword rule would still cut in
    // with a canned answer. Two guards - an explicit pause an agent sets from the
    // inbox, and an implicit one whenever a human replied recently on this thread.
    if (conv.botPausedUntil && conv.botPausedUntil.getTime() > Date.now()) return;
    const recentAgentReply = await prisma.waMessage.findFirst({
      where: {
        conversationId: opts.conversationId,
        direction: 'OUTBOUND',
        sentByUserId: { not: null },
        createdAt: { gte: new Date(Date.now() - AGENT_ACTIVE_MS) },
      },
      select: { id: true },
    });

    // Candidates in precedence order: the button id (precise), then the button
    // TITLE, then the message text. Rules used to be matched against the id alone
    // whenever one was present, so a quick-reply labelled "Pricing" carrying the
    // composer-generated id `btn_1` could not be matched by any rule an operator
    // would think to write.
    const candidates = [opts.buttonId, opts.buttonTitle, opts.text]
      .map((v) => (v ?? '').trim())
      .filter(Boolean);

    // 0) FAQ answer — the customer tapped an FAQ row in the interactive list.
    //    Deliberately NOT suppressed by agent activity: this is a direct tap on a
    //    menu the bot itself sent, so answering it is what the customer asked for.
    if (opts.buttonId && opts.buttonId.startsWith('faq_')) {
      const faq = await prisma.waFaq.findUnique({ where: { id: opts.buttonId.slice(4) } });
      if (faq?.isActive) {
        if (!(await allowAutoReply(opts.conversationId))) {
          waAutomationTotal.inc({ kind: 'faq_answer', outcome: 'throttled' });
          return;
        }
        try {
          const sent = await sendSessionMessage(opts.conversationId, null as any, {
            type: 'text',
            text: faq.answer,
          });
          assertDelivered(`WhatsApp FAQ answer ${faq.id}`, sent);
          waAutomationTotal.inc({ kind: 'faq_answer', outcome: 'sent' });
          void prisma.waFaq
            .update({
              where: { id: faq.id },
              data: { hitCount: { increment: 1 }, lastHitAt: new Date() },
            })
            .catch(() => {});
        } catch (e) {
          waAutomationTotal.inc({ kind: 'faq_answer', outcome: 'failed' });
          logger.warn(`WhatsApp FAQ answer ${faq.id} failed: ${(e as Error).message}`);
          // Nothing was said, so hold nothing back from the retry.
          await releaseAutoReply(opts.conversationId);
          throw e;
        }
        return;
      }
      // The tapped topic is gone or switched off. WhatsApp list menus stay
      // tappable in the customer's chat history indefinitely, so a customer
      // scrolling back to last week's menu and tapping a topic the operator has
      // since retired used to get complete silence — the `return` was outside
      // this branch, so no fallback was sent and no lower layer was reached
      // either. Silence is the worst available answer to somebody who has just
      // visibly interacted, so say the topic is gone and re-offer what is left.
      if (await handleMissingFaq(opts.conversationId, settings)) return;
      // Nothing left to offer (every FAQ has been deleted and no fallback text
      // is configured): fall through to the normal ladder rather than going
      // quiet, so a keyword rule or the away message can still answer.
    }

    // 1) A BOT FLOW ALREADY RUNNING on this thread. It comes first because the
    //    customer is mid-answer: reading "yes" as a keyword rule when it is the
    //    reply to "shall I book that?" is the one failure a stateful engine
    //    exists to prevent.
    const flowState = readFlowState(conv.flowState);
    if (flowState) {
      const flowRow = await prisma.waBotFlow.findUnique({
        where: { id: flowState.flowId },
        select: { timeoutMinutes: true },
      });
      const idleMs = conv.flowStateUpdatedAt
        ? Date.now() - conv.flowStateUpdatedAt.getTime()
        : Infinity;
      const timeoutMs = (flowRow?.timeoutMinutes ?? 60) * 60_000;
      if (idleMs > timeoutMs) {
        // Abandoned. Somebody who walked away mid-flow must not have their next
        // message — days later, about something else entirely — read as the
        // answer to a question they have long forgotten.
        await saveFlowState(opts.conversationId, null);
      } else if (recentAgentReply) {
        // A human has taken the thread over. Resuming the script afterwards
        // would have the bot talking across an agent mid-conversation, so the
        // session is dropped rather than parked.
        await saveFlowState(opts.conversationId, null);
        return;
      } else {
        if (!(await allowAutoReply(opts.conversationId))) {
          waAutomationTotal.inc({ kind: 'bot_flow', outcome: 'throttled' });
          return;
        }
        try {
          if (
            await advanceBotFlow({
              conversationId: opts.conversationId,
              contactId: opts.contactId,
              labels: conv.labels,
              state: flowState,
              text: opts.text,
              buttonId: opts.buttonId,
              buttonTitle: opts.buttonTitle,
            })
          ) {
            return;
          }
        } catch (e) {
          waAutomationTotal.inc({ kind: 'bot_flow', outcome: 'failed' });
          logger.warn(`WhatsApp bot flow ${flowState.flowId} failed: ${(e as Error).message}`);
          await releaseAutoReply(opts.conversationId);
          throw e;
        }
        // advanceBotFlow returned false: the flow or its step is gone and the
        // session has been cleared, so this message falls through to the ladder
        // below rather than disappearing into a flow that no longer exists.
        await releaseAutoReply(opts.conversationId);
      }
    }

    if (recentAgentReply) return;

    // 1) FAQ menu — show the interactive FAQ list on a configured trigger keyword.
    if (settings?.faqMenuEnabled && candidates.length) {
      const triggers = settings.faqTriggerKeywords ?? [];
      const triggered = triggers.some((kw) =>
        candidates.some((c) => keywordMatches('contains', kw, c))
      );
      if (triggered) {
        if (!(await allowAutoReply(opts.conversationId, 'faq_menu'))) {
          waAutomationTotal.inc({ kind: 'faq_menu', outcome: 'throttled' });
          return;
        }
        try {
          if (await sendFaqMenu(opts.conversationId)) {
            waAutomationTotal.inc({ kind: 'faq_menu', outcome: 'sent' });
            return;
          }
        } catch (e) {
          waAutomationTotal.inc({ kind: 'faq_menu', outcome: 'failed' });
          logger.warn(`WhatsApp FAQ menu failed: ${(e as Error).message}`);
          await releaseAutoReply(opts.conversationId, 'faq_menu');
          throw e;
        }
      }
    }

    // 2) Bot flow triggers — start a multi-step conversation.
    //
    //    Ahead of the keyword rules deliberately: a flow is the longer, more
    //    specific interaction, and an operator who has built one on "book" means
    //    the booking script rather than whatever single canned line a rule on
    //    the same word would send.
    if (candidates.length) {
      if (!(await allowAutoReply(opts.conversationId, 'bot_flow'))) {
        waAutomationTotal.inc({ kind: 'bot_flow', outcome: 'throttled' });
        return;
      }
      try {
        if (
          await tryStartBotFlow({
            conversationId: opts.conversationId,
            contactId: opts.contactId,
            labels: conv.labels,
            candidates,
          })
        ) {
          return;
        }
        // Nothing matched, so nothing was said — hand the budget back before
        // the layers below try to spend it.
        await releaseAutoReply(opts.conversationId, 'bot_flow');
      } catch (e) {
        waAutomationTotal.inc({ kind: 'bot_flow', outcome: 'failed' });
        logger.warn(`WhatsApp bot flow start failed: ${(e as Error).message}`);
        await releaseAutoReply(opts.conversationId, 'bot_flow');
        throw e;
      }
    }

    // 3) Keyword rules. Gated by the master switch above, like everything else.
    if (candidates.length) {
      // Same tie-break as the management listing (whatsapp-keyword-rule.service.ts):
      // highest priority first, ties by insertion order. Ordering on priority alone
      // left equal-priority rules in whatever order Postgres happened to return, so
      // two matching rules at the same priority answered the SAME question with
      // different replies on different messages — and the rules screen showed an
      // order the engine did not follow.
      const rules = await prisma.waKeywordRule.findMany({
        where: { isActive: true },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
      for (const rule of rules) {
        if (!candidates.some((c) => keywordMatches(rule.matchType, rule.match, c))) continue;
        // A matching rule that is on cooldown falls through to the NEXT rule
        // rather than ending the pass, so one hot rule cannot mute the others.
        if (!(await allowAutoReply(opts.conversationId, rule.id))) {
          waAutomationTotal.inc({ kind: 'keyword', outcome: 'throttled' });
          continue;
        }
        try {
          if (rule.action === 'handoff') {
            // ESCALATION. Before this, no rule action could do anything except
            // talk: "talk to a human" got a canned sentence, the thread stayed
            // unassigned in the same status with no label, and no agent was ever
            // told a customer had asked for one.
            await handOffToHuman(opts.conversationId, conv.labels, rule);
            // An acknowledgement is optional — a handoff rule with no reply text
            // routes silently.
            if (rule.replyText) {
              const sent = await sendSessionMessage(opts.conversationId, null as any, {
                type: 'text',
                text: await expandRuleText(rule.replyText, opts.conversationId),
              });
              assertDelivered(`WhatsApp keyword rule ${rule.id}`, sent);
            }
          } else if (rule.replyTemplateId) {
            // Keyword template replies used to send zero parameters, so a rule
            // pointing at a parameterised template answered with blank placeholders.
            const ruleConv = await prisma.waConversation.findUnique({
              where: { id: opts.conversationId },
              select: { contact: { select: { name: true, phone: true, attributes: true } } },
            });
            const ruleMapping = Array.isArray(rule.replyVariables)
              ? (rule.replyVariables as string[])
              : undefined;
            const sent = await sendTemplateToConversation(opts.conversationId, null, {
              templateId: rule.replyTemplateId,
              bodyParams: ruleConv?.contact
                ? resolveTemplateVars(ruleMapping, ruleConv.contact)
                : [],
            });
            assertDelivered(`WhatsApp keyword rule ${rule.id}`, sent);
          } else if (rule.replyText) {
            const sent = await sendSessionMessage(opts.conversationId, null as any, {
              type: 'text',
              text: await expandRuleText(rule.replyText, opts.conversationId),
            });
            assertDelivered(`WhatsApp keyword rule ${rule.id}`, sent);
          }
          waAutomationTotal.inc({
            kind: rule.action === 'handoff' ? 'handoff' : 'keyword',
            outcome: 'sent',
          });
          void prisma.waKeywordRule
            .update({
              where: { id: rule.id },
              data: { hitCount: { increment: 1 }, lastHitAt: new Date(), lastError: null },
            })
            .catch(() => {});
        } catch (e) {
          // Recorded ON the rule. Failures used to fall through to one catch-all
          // logger.warn at the bottom of this function, so a rule pointing at a
          // template Meta had paused failed on every single inbound message and
          // the console showed nothing at all.
          const message = (e as Error).message ?? String(e);
          waAutomationTotal.inc({ kind: 'keyword', outcome: 'failed' });
          void prisma.waKeywordRule
            .update({
              where: { id: rule.id },
              data: { lastErrorAt: new Date(), lastError: message.slice(0, 300) },
            })
            .catch(() => {});
          logger.warn(`WhatsApp keyword rule ${rule.id} failed: ${message}`);
          // Refund the rule's cooldown: the retry lands inside the 60s window
          // this attempt claimed, and a "throttled" retry sends nothing at all.
          await releaseAutoReply(opts.conversationId, rule.id);
          throw e;
        }
        return; // one auto-reply max
      }
    }

    if (!settings) return;

    // 3) First contact — welcome (when auto-reply is on) + the FAQ menu (when enabled).
    if (opts.isNewConversation) {
      // Claim the welcome before sending it. The guarded updateMany is atomic in
      // Postgres, so of two workers processing two messages that arrived together
      // exactly one wins — the previous "this conversation has one message" test
      // was read AFTER the row was written and both observers could pass it. The
      // marker is per-CONTACT and permanent, so a dormant customer whose history
      // has aged out of retention is never welcomed a second time either.
      const claim = await prisma.waContact.updateMany({
        where: { id: opts.contactId, welcomedAt: null },
        data: { welcomedAt: new Date() },
      });
      if (claim.count === 1) {
        let sent = false;
        if (settings.autoReplyEnabled && settings.welcomeMessage) {
          try {
            const reply = await sendSessionMessage(opts.conversationId, null as any, {
              type: 'text',
              text: settings.welcomeMessage,
            });
            assertDelivered('WhatsApp welcome message', reply);
            waAutomationTotal.inc({ kind: 'welcome', outcome: 'sent' });
            sent = true;
          } catch (e) {
            waAutomationTotal.inc({ kind: 'welcome', outcome: 'failed' });
            logger.warn(`WhatsApp welcome message failed: ${(e as Error).message}`);
            // Give the claim back. `welcomedAt` means "this contact HAS been
            // welcomed", so leaving it stamped after a failed send retires the
            // greeting for good: the retry skips this branch, falls through to
            // the away message, and the customer is never actually greeted.
            await prisma.waContact
              .updateMany({ where: { id: opts.contactId }, data: { welcomedAt: null } })
              .catch(() => {});
            throw e;
          }
        }
        if (
          settings.faqMenuEnabled &&
          (await sendFaqMenu(opts.conversationId).catch(() => false))
        ) {
          sent = true;
        }
        if (sent) return;
      }
    }

    // 4) Away — manual away toggle OR outside business hours, debounced (auto-reply on).
    if (
      settings.autoReplyEnabled &&
      settings.awayMessage &&
      (settings.awayMode || !withinBusinessHours(settings.businessHours, new Date()))
    ) {
      // Debounced by an atomic claim taken BEFORE the send (see claimAwayReply),
      // not by asking the database whether we replied recently. The interval is
      // the operator's, not a constant baked into this file.
      if (!(await claimAwayReply(opts.conversationId, awayDebounceSeconds(settings)))) return;
      if (!(await allowAutoReply(opts.conversationId, 'away'))) {
        waAutomationTotal.inc({ kind: 'away', outcome: 'throttled' });
        await releaseAwayReply(opts.conversationId);
        return;
      }
      try {
        const sent = await sendSessionMessage(opts.conversationId, null as any, {
          type: 'text',
          text: settings.awayMessage,
        });
        assertDelivered('WhatsApp away message', sent);
        waAutomationTotal.inc({ kind: 'away', outcome: 'sent' });
      } catch (e) {
        waAutomationTotal.inc({ kind: 'away', outcome: 'failed' });
        logger.warn(`WhatsApp away message failed: ${(e as Error).message}`);
        await releaseAwayReply(opts.conversationId);
        await releaseAutoReply(opts.conversationId, 'away');
        throw e;
      }
    }
  } catch (err) {
    // Rethrown, not swallowed — see the contract above. Logged at debug because
    // whichever branch failed has already warned with the rule/FAQ it was on,
    // and the worker logs the failed job; this line only adds the conversation.
    logger.debug(
      `WhatsApp auto-reply failed conv=${opts.conversationId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    throw err;
  }
}
