import { prisma } from '../config/prisma';
import type { FormDraftType } from '@prisma/client';
import { AppError } from '../middleware/error';

const MAX_DRAFTS_PER_FORM_TYPE = 10;

class DraftService {
  /**
   * Save (upsert) a form draft.
   * Limits to MAX_DRAFTS_PER_FORM_TYPE drafts per user per formType.
   */
  async saveDraft(userId: string, formType: FormDraftType, data: any, name?: string) {
    // Check if user already has too many drafts for this formType
    const existingCount = await prisma.formDraft.count({
      where: { userId, formType },
    });

    // If this is a new draft (no matching unique key), enforce the limit
    const existingDraft = await prisma.formDraft.findUnique({
      where: {
        userId_formType_name: {
          userId,
          formType,
          name: (name ?? null) as string,
        },
      },
    });

    if (!existingDraft && existingCount >= MAX_DRAFTS_PER_FORM_TYPE) {
      throw new AppError(
        `Maximum of ${MAX_DRAFTS_PER_FORM_TYPE} drafts allowed per form type. Please delete an existing draft first.`,
        400
      );
    }

    const draft = await prisma.formDraft.upsert({
      where: {
        userId_formType_name: {
          userId,
          formType,
          name: (name ?? null) as string,
        },
      },
      create: {
        userId,
        formType,
        data,
        name,
      },
      update: {
        data,
      },
    });

    return draft;
  }

  /**
   * List user's drafts, optionally filtered by formType
   */
  async getDrafts(userId: string, formType?: FormDraftType) {
    const where: any = { userId };
    if (formType) {
      where.formType = formType;
    }

    return prisma.formDraft.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Get a specific draft by ID, verifying ownership
   */
  async getDraft(userId: string, draftId: string) {
    const draft = await prisma.formDraft.findUnique({
      where: { id: draftId },
    });

    if (!draft) {
      throw new AppError('Draft not found', 404);
    }

    if (draft.userId !== userId) {
      throw new AppError('Not authorized to access this draft', 403);
    }

    return draft;
  }

  /**
   * Delete a specific draft by ID, verifying ownership
   */
  async deleteDraft(userId: string, draftId: string): Promise<void> {
    const draft = await prisma.formDraft.findUnique({
      where: { id: draftId },
    });

    if (!draft) {
      throw new AppError('Draft not found', 404);
    }

    if (draft.userId !== userId) {
      throw new AppError('Not authorized to delete this draft', 403);
    }

    await prisma.formDraft.delete({ where: { id: draftId } });
  }
}

export const draftService = new DraftService();
