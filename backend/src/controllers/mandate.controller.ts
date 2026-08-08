import type { Request, Response, NextFunction } from 'express';
import * as MandateService from '../services/mandate.service';
import { success } from '../utils/response';

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const items = await MandateService.listMandatesForUser({ userId: req.user!.id });
    success(res, items, 'Mandates fetched');
  } catch (err) {
    next(err);
  }
};

export const get = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const item = await MandateService.getMandate({
      userId: req.user!.id,
      mandateId: req.params.id,
    });
    success(res, item, 'Mandate fetched');
  } catch (err) {
    next(err);
  }
};

export const cancel = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const item = await MandateService.cancelMandate({
      userId: req.user!.id,
      mandateId: req.params.id,
    });
    success(res, item, 'Mandate cancelled');
  } catch (err) {
    next(err);
  }
};
