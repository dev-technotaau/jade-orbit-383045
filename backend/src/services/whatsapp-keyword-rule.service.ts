import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { Prisma } from '@prisma/client';

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
  matchType?: string;
  replyText?: string | null;
  replyTemplateId?: string | null;
  isActive?: boolean;
  priority?: number;
  createdBy?: string | null;
}) {
  return prisma.waKeywordRule.create({
    data: {
      name: input.name,
      match: input.match,
      ...(input.matchType !== undefined ? { matchType: input.matchType } : {}),
      ...(input.replyText !== undefined ? { replyText: input.replyText } : {}),
      ...(input.replyTemplateId !== undefined ? { replyTemplateId: input.replyTemplateId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {}),
    },
  });
}

export async function updateKeywordRule(id: string, patch: Record<string, unknown>) {
  try {
    return await prisma.waKeywordRule.update({
      where: { id },
      data: patch as Prisma.WaKeywordRuleUpdateInput,
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
