import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { assertTemplateSendableWithBodyParamsOnly } from './whatsapp-template.service';
import { Prisma, type WaKeywordMatchType } from '@prisma/client';

/**
 * Keyword auto-responder rules. Evaluated highest-priority-first against inbound
 * text / button replies; ties broken by insertion order (createdAt asc).
 */
export async function listKeywordRules() {
  return prisma.waKeywordRule.findMany({
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function createKeywordRule(input: {
  name: string;
  match: string;
  matchType?: WaKeywordMatchType;
  replyText?: string | null;
  replyTemplateId?: string | null;
  replyVariables?: string[] | null;
  /** 'reply' (default) answers the customer; 'handoff' routes the thread instead. */
  action?: string;
  handoffAssignee?: string | null;
  handoffLabel?: string | null;
  handoffStatus?: string | null;
  isActive?: boolean;
  priority?: number;
  createdBy?: string | null;
}) {
  // A rule carries a template id and an ordered list of {{n}} values — there is
  // no field on it for a header, a link value, a coupon or an offer expiry, so a
  // template that needs one of those answers every matching customer with
  // nothing at all: the auto-reply send is refused by Meta with (#131008) and
  // the failure surfaces only as the rule's `lastError`. Named here, while the
  // operator is still looking at the template picker.
  if (input.replyTemplateId) {
    await assertTemplateSendableWithBodyParamsOnly(input.replyTemplateId, 'a keyword rule');
  }
  return prisma.waKeywordRule.create({
    data: {
      name: input.name,
      match: input.match,
      ...(input.matchType !== undefined ? { matchType: input.matchType } : {}),
      ...(input.replyText !== undefined ? { replyText: input.replyText } : {}),
      ...(input.replyTemplateId !== undefined ? { replyTemplateId: input.replyTemplateId } : {}),
      // A nullable Json column: Prisma will not accept a bare null here, so an
      // explicit clear has to go through Prisma.DbNull.
      ...(input.replyVariables !== undefined
        ? { replyVariables: input.replyVariables ?? Prisma.DbNull }
        : {}),
      ...(input.action !== undefined ? { action: input.action } : {}),
      ...(input.handoffAssignee !== undefined ? { handoffAssignee: input.handoffAssignee } : {}),
      ...(input.handoffLabel !== undefined ? { handoffLabel: input.handoffLabel } : {}),
      ...(input.handoffStatus !== undefined ? { handoffStatus: input.handoffStatus } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {}),
    },
  });
}

/**
 * Patch a rule.
 *
 * The whole request body used to be cast straight into Prisma's update input.
 * That had two consequences: the per-rule telemetry (hitCount, lastError…) was
 * writable from the client, and clearing the template parameters — which the rule
 * editor does on every save of a free-text rule — sent a bare `null` into the
 * nullable Json column, which Prisma rejects. Editing ANY rule from the console
 * therefore failed with an opaque 500.
 */
export async function updateKeywordRule(
  id: string,
  patch: {
    name?: string;
    match?: string;
    matchType?: WaKeywordMatchType;
    replyText?: string | null;
    replyTemplateId?: string | null;
    replyVariables?: string[] | null;
    action?: string;
    handoffAssignee?: string | null;
    handoffLabel?: string | null;
    handoffStatus?: string | null;
    isActive?: boolean;
    priority?: number;
  }
) {
  // Same gate as create: swapping in an unsendable template through an edit is
  // exactly as silent as choosing one at creation.
  if (patch.replyTemplateId) {
    await assertTemplateSendableWithBodyParamsOnly(patch.replyTemplateId, 'a keyword rule');
  }
  try {
    return await prisma.waKeywordRule.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.match !== undefined ? { match: patch.match } : {}),
        ...(patch.matchType !== undefined ? { matchType: patch.matchType } : {}),
        ...(patch.replyText !== undefined ? { replyText: patch.replyText } : {}),
        ...(patch.replyTemplateId !== undefined ? { replyTemplateId: patch.replyTemplateId } : {}),
        // Nullable Json: an explicit clear has to go through Prisma.DbNull.
        ...(patch.replyVariables !== undefined
          ? { replyVariables: patch.replyVariables ?? Prisma.DbNull }
          : {}),
        ...(patch.action !== undefined ? { action: patch.action } : {}),
        ...(patch.handoffAssignee !== undefined ? { handoffAssignee: patch.handoffAssignee } : {}),
        ...(patch.handoffLabel !== undefined ? { handoffLabel: patch.handoffLabel } : {}),
        ...(patch.handoffStatus !== undefined ? { handoffStatus: patch.handoffStatus } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new AppError('Keyword rule not found', 404, 'WA_KEYWORD_RULE_NOT_FOUND');
    }
    throw err;
  }
}

export async function deleteKeywordRule(id: string) {
  try {
    return await prisma.waKeywordRule.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new AppError('Keyword rule not found', 404, 'WA_KEYWORD_RULE_NOT_FOUND');
    }
    throw err;
  }
}
