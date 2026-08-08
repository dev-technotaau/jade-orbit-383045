import type { Request, Response, NextFunction } from 'express';
import * as PaymentMethodService from '../services/payment-method.service';
import { success, noContent } from '../utils/response';

export const listMethods = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const items = await PaymentMethodService.listPaymentMethods(req.user!.id);
    success(res, items, 'Payment methods fetched');
  } catch (err) {
    next(err);
  }
};

export const setDefault = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const updated = await PaymentMethodService.setDefaultMethod(req.user!.id, req.params.id);
    success(res, updated, 'Default updated');
  } catch (err) {
    next(err);
  }
};

export const remove = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await PaymentMethodService.removeMethod(req.user!.id, req.params.id);
    noContent(res);
  } catch (err) {
    next(err);
  }
};
