import type { Request, Response, NextFunction } from 'express';
import { jobAlertService } from '../services/job-alert.service';
import { AppError } from '../middleware/error';

export const getAlerts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const alerts = await jobAlertService.getAlerts(req.user.id);
    res.status(200).json({ status: 'success', data: alerts });
  } catch (error) {
    next(error);
  }
};

export const createAlert = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const alert = await jobAlertService.createAlert(req.user.id, req.body);
    res.status(201).json({ status: 'success', data: alert });
  } catch (error) {
    next(error);
  }
};

export const updateAlert = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const alertId = req.params.id as string;
    const alert = await jobAlertService.updateAlert(req.user.id, alertId, req.body);
    res.status(200).json({ status: 'success', data: alert });
  } catch (error) {
    next(error);
  }
};

export const deleteAlert = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const alertId = req.params.id as string;
    await jobAlertService.deleteAlert(req.user.id, alertId);
    res.status(200).json({ status: 'success', message: 'Job alert deleted' });
  } catch (error) {
    next(error);
  }
};

export const getAlertMatches = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw new AppError('Not authorized', 401);
    const alertId = req.params.id as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await jobAlertService.getAlertMatches(req.user.id, alertId, page, limit);
    const total = result.pagination?.total ?? 0;
    const totalPages = result.pagination?.pages ?? 1;
    res.status(200).json({
      status: 'success',
      data: {
        items: result.jobs || [],
        total,
        page: result.pagination?.page ?? page,
        limit: result.pagination?.limit ?? limit,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};
