import type { Request, Response, NextFunction } from 'express';
import { unlockContact, listUnlockedCandidatesForEmployer } from '../services/cv-unlock.service';
import { success, created } from '../utils/response';

export const unlock = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await unlockContact({
      employerUserId: req.user!.id,
      candidateId: req.params.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    if (result.cached) {
      success(res, result, 'Contact already unlocked');
    } else {
      created(res, result, 'Contact unlocked — 1 CV unlock consumed');
    }
  } catch (err) {
    next(err);
  }
};

export const listUnlocked = async (
  req: Request<unknown, unknown, unknown, { page?: number; limit?: number }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await listUnlockedCandidatesForEmployer(req.user!.id, {
      page: req.query.page,
      limit: req.query.limit,
    });
    success(res, result, 'Unlocked candidates fetched');
  } catch (err) {
    next(err);
  }
};
