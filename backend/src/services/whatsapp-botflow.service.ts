import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { Prisma } from '@prisma/client';
import type { WaBotFlow, WaBotStep } from '@prisma/client';

/**
 * Conversational bot flows — the stateful half of the automation tier.
 *
 * The engine could only do "one keyword in, one canned message out": nothing
 * carried state between two messages, so capturing a name and then an email,
 * qualifying a lead before routing it, or a menu that branches on the previous
 * answer were all impossible, and an operator comparing this console against a
 * WATI/Interakt-class product found the whole automation tier missing.
 *
 * A flow is a small graph of steps (WaBotStep) belonging to a WaBotFlow. The
 * customer's position in it — the current step and every answer captured so far
 * — lives on `WaConversation.flowState`, so a session survives across messages,
 * across workers and across a restart, which a memory-resident session store
 * would not.
 *
 * This module owns BOTH the CRUD the console edits flows through and the runtime
 * the auto-reply engine calls. They are together because the runtime's rules
 * (which step kinds exist, how `nextStepKey` resolves, what a slot is) are the
 * validation the editor has to enforce, and splitting them is how the two drift.
 */

/* ── Step kinds ───────────────────────────────────────────────────────────── */

/**
 * The step kinds the engine implements.
 *
 *  - `message`       say something and move on
 *  - `ask`           say something and WAIT for a typed answer, saved to a slot
 *  - `choice`        offer up to 3 quick replies and wait for one; branches
 *  - `set_attribute` write a captured value onto the contact (no message)
 *  - `send_template` send an approved template (works outside the 24h window)
 *  - `handoff`       route the thread to a human and end the flow
 *  - `end`           finish, optionally with a closing message
 */
export const WA_BOT_STEP_KINDS = [
  'message',
  'ask',
  'choice',
  'set_attribute',
  'send_template',
  'handoff',
  'end',
] as const;
export type WaBotStepKind = (typeof WA_BOT_STEP_KINDS)[number];

/** Validators an `ask` step can apply to the answer before accepting it. */
export const WA_BOT_VALIDATIONS = ['text', 'number', 'email', 'phone'] as const;
export type WaBotValidation = (typeof WA_BOT_VALIDATIONS)[number];

/** One option on a `choice` step. */
export interface WaBotChoice {
  label: string;
  /** Stored in the slot when chosen; defaults to the label. */
  value?: string;
  /** Step to jump to; falls back to the step's `nextStepKey`. */
  next?: string;
}

/**
 * A live session, as persisted on `WaConversation.flowState`.
 *
 * Deliberately small and self-describing: it is read back by a different process
 * than the one that wrote it, possibly after a deploy that changed the flow, so
 * every field it needs to recover from that is here.
 */
export interface WaFlowState {
  flowId: string;
  /** Step the customer is currently waiting on. */
  stepKey: string;
  /** Answers captured so far, keyed by each step's `saveAs`. */
  slots: Record<string, string>;
  startedAt: string;
  /** Consecutive validation failures on the current step. */
  retries?: number;
}

/* ── CRUD ─────────────────────────────────────────────────────────────────── */

export function listBotFlows() {
  return prisma.waBotFlow.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    include: { steps: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } },
  });
}

export async function getBotFlow(id: string) {
  const flow = await prisma.waBotFlow.findUnique({
    where: { id },
    include: { steps: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } },
  });
  if (!flow) throw new AppError('Bot flow not found', 404, 'WA_BOT_FLOW_NOT_FOUND');
  return flow;
}

export interface BotFlowInput {
  name: string;
  description?: string | null;
  isActive?: boolean;
  triggerType?: string;
  triggerKeywords?: string[];
  triggerMatchType?: string;
  entryStepKey?: string | null;
  timeoutMinutes?: number;
  escapeKeywords?: string[];
  cancelMessage?: string | null;
  createdBy?: string | null;
}

export function createBotFlow(input: BotFlowInput) {
  return prisma.waBotFlow.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.triggerType !== undefined ? { triggerType: input.triggerType } : {}),
      ...(input.triggerKeywords !== undefined ? { triggerKeywords: input.triggerKeywords } : {}),
      ...(input.triggerMatchType !== undefined ? { triggerMatchType: input.triggerMatchType } : {}),
      ...(input.entryStepKey !== undefined ? { entryStepKey: input.entryStepKey } : {}),
      ...(input.timeoutMinutes !== undefined ? { timeoutMinutes: input.timeoutMinutes } : {}),
      ...(input.escapeKeywords !== undefined ? { escapeKeywords: input.escapeKeywords } : {}),
      ...(input.cancelMessage !== undefined ? { cancelMessage: input.cancelMessage } : {}),
      createdBy: input.createdBy ?? null,
    },
    include: { steps: true },
  });
}

/**
 * Patch a flow.
 *
 * The telemetry columns (hitCount, completedCount, lastHitAt) are deliberately
 * absent from the accepted patch: they are the engine's record of what actually
 * happened, and a console that could rewrite them would make "this flow has
 * never fired" a claim nobody can trust.
 */
export async function updateBotFlow(id: string, patch: Partial<BotFlowInput>) {
  await getBotFlow(id);
  const data: Prisma.WaBotFlowUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  if (patch.triggerType !== undefined) data.triggerType = patch.triggerType;
  if (patch.triggerKeywords !== undefined) data.triggerKeywords = { set: patch.triggerKeywords };
  if (patch.triggerMatchType !== undefined) data.triggerMatchType = patch.triggerMatchType;
  if (patch.entryStepKey !== undefined) data.entryStepKey = patch.entryStepKey;
  if (patch.timeoutMinutes !== undefined) data.timeoutMinutes = patch.timeoutMinutes;
  if (patch.escapeKeywords !== undefined) data.escapeKeywords = { set: patch.escapeKeywords };
  if (patch.cancelMessage !== undefined) data.cancelMessage = patch.cancelMessage;
  return prisma.waBotFlow.update({
    where: { id },
    data,
    include: { steps: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } },
  });
}

/**
 * Delete a flow and every session sitting inside it.
 *
 * The sessions matter: `flowState` names a flowId, and a conversation left
 * pointing at a deleted flow would have every subsequent message read as an
 * answer to a question that no longer exists — the customer's thread would go
 * silent, because the engine short-circuits on a live session before it reaches
 * any other layer.
 */
export async function deleteBotFlow(id: string) {
  await getBotFlow(id);
  await clearSessionsForFlow(id);
  await prisma.waBotFlow.delete({ where: { id } });
  return { id };
}

export interface BotStepInput {
  key: string;
  kind?: string;
  prompt?: string | null;
  saveAs?: string | null;
  validation?: string;
  choices?: WaBotChoice[] | null;
  retryMessage?: string | null;
  value?: string | null;
  templateId?: string | null;
  templateVariables?: string[] | null;
  handoffAssignee?: string | null;
  handoffLabel?: string | null;
  handoffStatus?: string | null;
  nextStepKey?: string | null;
  order?: number;
}

/** Reject a step the engine could not run, at the point the operator can fix it. */
function assertStepUsable(input: Partial<BotStepInput>): void {
  if (input.kind !== undefined && !WA_BOT_STEP_KINDS.includes(input.kind as WaBotStepKind)) {
    throw new AppError(
      `Unknown step kind "${input.kind}". Valid: ${WA_BOT_STEP_KINDS.join(', ')}`,
      400,
      'WA_BOT_STEP_KIND'
    );
  }
  if (
    input.validation !== undefined &&
    !WA_BOT_VALIDATIONS.includes(input.validation as WaBotValidation)
  ) {
    throw new AppError(
      `Unknown validation "${input.validation}". Valid: ${WA_BOT_VALIDATIONS.join(', ')}`,
      400,
      'WA_BOT_STEP_VALIDATION'
    );
  }
  // A choice step with no options is a dead end that swallows every reply: the
  // customer answers, nothing matches, and the step re-asks forever.
  if (input.kind === 'choice' && (!input.choices || input.choices.length === 0)) {
    throw new AppError('A choice step needs at least one option', 400, 'WA_BOT_STEP_CHOICES');
  }
  // WhatsApp accepts at most three quick-reply buttons on an interactive message.
  if (input.choices && input.choices.length > 3) {
    throw new AppError(
      'WhatsApp allows at most 3 quick replies on one message',
      400,
      'WA_BOT_STEP_CHOICES'
    );
  }
  if (input.kind === 'send_template' && !input.templateId) {
    throw new AppError('A send_template step needs a template', 400, 'WA_BOT_STEP_TEMPLATE');
  }
}

/**
 * Refuse a `send_template` step whose template the engine could not fill in.
 *
 * A bot step stores a template id and an ordered list of {{n}} values, so a
 * template that also needs a header, a link value, a coupon or an offer expiry
 * is answered by Meta with (#131008) and the customer, mid-flow, simply receives
 * nothing. Checked where the step is SAVED, which is the only point the operator
 * can still choose a different template.
 *
 * The template service is loaded on demand rather than imported at the top:
 * this module's pure helpers (`interpolate`, `validateAnswer`, `entryStep`) are
 * pulled into the inbound auto-reply engine, and a static import would drag the
 * Graph/template stack into every consumer of those.
 */
async function assertStepTemplateUsable(input: Partial<BotStepInput>): Promise<void> {
  if (input.kind !== 'send_template' || !input.templateId) return;
  const { assertTemplateSendableWithBodyParamsOnly } = await import('./whatsapp-template.service');
  await assertTemplateSendableWithBodyParamsOnly(input.templateId, 'a bot-flow step');
}

export async function createBotStep(flowId: string, input: BotStepInput) {
  await getBotFlow(flowId);
  assertStepUsable(input);
  await assertStepTemplateUsable(input);
  return prisma.waBotStep.create({
    data: {
      flowId,
      key: input.key,
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
      ...(input.saveAs !== undefined ? { saveAs: input.saveAs } : {}),
      ...(input.validation !== undefined ? { validation: input.validation } : {}),
      // Nullable Json: an explicit clear has to go through Prisma.DbNull.
      ...(input.choices !== undefined
        ? { choices: (input.choices ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue }
        : {}),
      ...(input.retryMessage !== undefined ? { retryMessage: input.retryMessage } : {}),
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
      ...(input.templateVariables !== undefined
        ? {
            templateVariables: (input.templateVariables ??
              Prisma.DbNull) as unknown as Prisma.InputJsonValue,
          }
        : {}),
      ...(input.handoffAssignee !== undefined ? { handoffAssignee: input.handoffAssignee } : {}),
      ...(input.handoffLabel !== undefined ? { handoffLabel: input.handoffLabel } : {}),
      ...(input.handoffStatus !== undefined ? { handoffStatus: input.handoffStatus } : {}),
      ...(input.nextStepKey !== undefined ? { nextStepKey: input.nextStepKey } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
    },
  });
}

export async function updateBotStep(flowId: string, stepId: string, patch: Partial<BotStepInput>) {
  const existing = await prisma.waBotStep.findFirst({ where: { id: stepId, flowId } });
  if (!existing) throw new AppError('Bot step not found', 404, 'WA_BOT_STEP_NOT_FOUND');
  // Validate the MERGED step, not the patch: a request that only flips `kind` to
  // `choice` has no `choices` of its own, and the row's existing options are
  // what the engine would actually run.
  const merged = {
    kind: patch.kind ?? existing.kind,
    validation: patch.validation ?? existing.validation,
    choices:
      patch.choices !== undefined ? patch.choices : (existing.choices as WaBotChoice[] | null),
    templateId: patch.templateId !== undefined ? patch.templateId : existing.templateId,
  };
  assertStepUsable(merged);
  // Only when the operator is actually CHOOSING the template — a new one, or a
  // step that has just become a `send_template`. The step editor has no template
  // picker (these are set through the API), so re-validating on every save would
  // let an unsendable template block edits to the prompt or the retry message
  // with no way to fix it from that screen.
  const choosingTemplate =
    (merged.kind === 'send_template' && existing.kind !== 'send_template') ||
    (patch.templateId !== undefined && patch.templateId !== existing.templateId);
  if (choosingTemplate) await assertStepTemplateUsable(merged);
  const data: Prisma.WaBotStepUpdateInput = {};
  if (patch.key !== undefined) data.key = patch.key;
  if (patch.kind !== undefined) data.kind = patch.kind;
  if (patch.prompt !== undefined) data.prompt = patch.prompt;
  if (patch.saveAs !== undefined) data.saveAs = patch.saveAs;
  if (patch.validation !== undefined) data.validation = patch.validation;
  if (patch.choices !== undefined) {
    data.choices = (patch.choices ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue;
  }
  if (patch.retryMessage !== undefined) data.retryMessage = patch.retryMessage;
  if (patch.value !== undefined) data.value = patch.value;
  if (patch.templateId !== undefined) data.templateId = patch.templateId;
  if (patch.templateVariables !== undefined) {
    data.templateVariables = (patch.templateVariables ??
      Prisma.DbNull) as unknown as Prisma.InputJsonValue;
  }
  if (patch.handoffAssignee !== undefined) data.handoffAssignee = patch.handoffAssignee;
  if (patch.handoffLabel !== undefined) data.handoffLabel = patch.handoffLabel;
  if (patch.handoffStatus !== undefined) data.handoffStatus = patch.handoffStatus;
  if (patch.nextStepKey !== undefined) data.nextStepKey = patch.nextStepKey;
  if (patch.order !== undefined) data.order = patch.order;
  return prisma.waBotStep.update({ where: { id: stepId }, data });
}

export async function deleteBotStep(flowId: string, stepId: string) {
  const existing = await prisma.waBotStep.findFirst({ where: { id: stepId, flowId } });
  if (!existing) throw new AppError('Bot step not found', 404, 'WA_BOT_STEP_NOT_FOUND');
  await prisma.waBotStep.delete({ where: { id: stepId } });
  // Anyone parked on the deleted step can no longer be advanced — their next
  // message would match no step and stall silently — so their session goes too.
  await clearSessionsForStep(flowId, existing.key);
  return { id: stepId };
}

/* ── Session bookkeeping ──────────────────────────────────────────────────── */

/**
 * Drop every live session belonging to a flow.
 *
 * Raw SQL because the predicate is inside a jsonb column, which Prisma's filter
 * builder cannot express against a nullable Json field, and this must be ONE
 * statement: iterating conversations to find the handful in a flow would scan
 * the whole table on any real deployment.
 */
async function clearSessionsForFlow(flowId: string): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "WaConversation"
       SET "flowState" = NULL, "flowStateUpdatedAt" = NULL
     WHERE "flowState" ->> 'flowId' = ${flowId}
  `;
}

/** Same, narrowed to the customers parked on one step. */
async function clearSessionsForStep(flowId: string, stepKey: string): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "WaConversation"
       SET "flowState" = NULL, "flowStateUpdatedAt" = NULL
     WHERE "flowState" ->> 'flowId' = ${flowId}
       AND "flowState" ->> 'stepKey' = ${stepKey}
  `;
}

/** Read a conversation's session back, or null when nothing is running. */
export function readFlowState(raw: unknown): WaFlowState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<WaFlowState>;
  if (typeof s.flowId !== 'string' || typeof s.stepKey !== 'string') return null;
  return {
    flowId: s.flowId,
    stepKey: s.stepKey,
    slots: (s.slots && typeof s.slots === 'object' ? s.slots : {}) as Record<string, string>,
    startedAt: typeof s.startedAt === 'string' ? s.startedAt : new Date().toISOString(),
    retries: typeof s.retries === 'number' ? s.retries : 0,
  };
}

export async function saveFlowState(
  conversationId: string,
  state: WaFlowState | null
): Promise<void> {
  await prisma.waConversation.update({
    where: { id: conversationId },
    data: {
      flowState: state === null ? Prisma.DbNull : (state as unknown as Prisma.InputJsonValue),
      flowStateUpdatedAt: state === null ? null : new Date(),
    },
  });
}

/* ── Runtime helpers ──────────────────────────────────────────────────────── */

/** Substitute `{{slot}}` references in operator-authored text. */
export function interpolate(text: string, slots: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, key: string) => slots[key] ?? '');
}

/** Does an answer satisfy the step's validator? */
export function validateAnswer(validation: string, answer: string): boolean {
  const v = answer.trim();
  if (!v) return false;
  switch (validation) {
    case 'number':
      return /^-?\d+(\.\d+)?$/.test(v);
    case 'email':
      // Deliberately permissive: the point is to catch "no thanks" typed into an
      // email question, not to adjudicate RFC 5322.
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
    case 'phone':
      return /^\+?[\d\s()-]{7,20}$/.test(v);
    default:
      return true;
  }
}

/** The step a flow starts at: its declared entry, else the lowest-ordered one. */
export function entryStep(flow: WaBotFlow & { steps: WaBotStep[] }): WaBotStep | null {
  if (flow.entryStepKey) {
    const named = flow.steps.find((s) => s.key === flow.entryStepKey);
    if (named) return named;
  }
  return flow.steps[0] ?? null;
}

/** Read a step's options back off the jsonb column, defensively. */
export function stepChoices(step: WaBotStep): WaBotChoice[] {
  const raw = step.choices;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) =>
      entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : null
    )
    .filter((c): c is Record<string, unknown> => c !== null && !Array.isArray(c))
    .map((c) => ({
      label: String(c.label ?? ''),
      value: c.value === undefined || c.value === null ? undefined : String(c.value),
      next: c.next === undefined || c.next === null ? undefined : String(c.next),
    }))
    .filter((c) => c.label);
}
