import type { Request, Response, NextFunction } from 'express';
import { savedCandidateService } from '../services/saved-candidate.service';
import { AppError } from '../middleware/error';

// ===============================
// Toggle Save Candidate
// ===============================
export const toggleSave = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const candidateId = req.params.id as string;
    const { notes } = req.body;

    const result = await savedCandidateService.toggleSaveCandidate(req.user.id, candidateId, notes);

    res.status(200).json({
      status: 'success',
      message: result.saved ? 'Candidate saved' : 'Candidate unsaved',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// List Saved Candidates
// ===============================
export const listSaved = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    const result = await savedCandidateService.getSavedCandidates(req.user.id, page, limit);

    // Flatten SavedCandidate → CandidateProfile shape for frontend
    const items = result.savedCandidates.map((sc: any) => ({
      ...(sc.candidate?.candidateProfile || {}),
      id: sc.candidateId,
      user: {
        id: sc.candidate?.id,
        firstName: sc.candidate?.firstName,
        lastName: sc.candidate?.lastName,
        email: sc.candidate?.email,
        avatar: sc.candidate?.avatar,
        isEmailVerified: sc.candidate?.isEmailVerified ?? false,
        isMobileVerified: sc.candidate?.isMobileVerified ?? false,
        isWhatsappVerified: sc.candidate?.isWhatsappVerified ?? false,
        mobileNumber: sc.candidate?.mobileNumber ?? null,
        whatsappNumber: sc.candidate?.whatsappNumber ?? null,
        lastActiveAt: sc.candidate?.lastActiveAt ?? null,
      },
      savedAt: sc.savedAt,
      notes: sc.notes,
      contactUnlocked: sc.contactUnlocked ?? false,
    }));

    res.status(200).json({
      status: 'success',
      data: {
        items,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ===============================
// Update Notes on Saved Candidate
// ===============================
export const updateNotes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authorized', 401);
    }

    const candidateId = req.params.id as string;
    const { notes } = req.body;

    const updated = await savedCandidateService.updateNotes(req.user.id, candidateId, notes);

    res.status(200).json({
      status: 'success',
      message: 'Notes updated successfully',
      data: { savedCandidate: updated },
    });
  } catch (error) {
    next(error);
  }
};
