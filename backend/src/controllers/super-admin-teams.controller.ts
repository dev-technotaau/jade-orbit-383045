import type { Request, Response, NextFunction } from 'express';
import * as svc from '../services/super-admin-team-vendor.service';
import { AppError } from '../exceptions';

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await svc.listTeams({
      query: typeof req.query.query === 'string' ? req.query.query : undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 25,
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const detail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await svc.getTeamDetail(String(req.params.companyId));
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
};

export const forceRevoke = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    await svc.forceRevokeMember({
      superAdminUserId: req.user.id,
      memberId: String(req.params.memberId),
      reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
    });
    res.status(200).json({ status: 'success' });
  } catch (err) {
    next(err);
  }
};
