import type { Request, Response, NextFunction } from 'express';
import {
  listSuppressions,
  addSuppression,
  removeSuppression,
} from '../services/whatsapp-suppression.service';

export const list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await listSuppressions() });
  } catch (e) {
    next(e);
  }
};

export const add = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const suppression = await addSuppression({
      phone: req.body.phone,
      reason: req.body.reason,
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data: suppression });
  } catch (e) {
    next(e);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await removeSuppression(String(req.params.id));
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};
