import type { Request, Response, NextFunction } from 'express';
import { draftService } from '../services/draft.service';
import { AppError } from '../middleware/error';
import type { FormDraftType } from '@prisma/client';

// ===============================
// Save Draft
// ===============================
export const saveDraft = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const { formType, data, name } = req.body;

    const draft = await draftService.saveDraft(req.user.id, formType, data, name);

    res.status(200).json({
      status: 'success',
      message: 'Draft saved successfully',
      data: { draft },
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Get Drafts
// ===============================
export const getDrafts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const { formType } = req.query;

    const drafts = await draftService.getDrafts(req.user.id, formType as FormDraftType | undefined);

    res.status(200).json({
      status: 'success',
      data: {
        items: drafts,
        total: drafts.length,
        page: 1,
        limit: drafts.length || 20,
        totalPages: 1,
        hasMore: false,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Get Single Draft
// ===============================
export const getDraft = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const { id } = req.params;

    const draft = await draftService.getDraft(req.user.id, id as string);

    res.status(200).json({
      status: 'success',
      data: { draft },
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Delete Draft
// ===============================
export const deleteDraft = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const { id } = req.params;

    await draftService.deleteDraft(req.user.id, id as string);

    res.status(200).json({
      status: 'success',
      message: 'Draft deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
