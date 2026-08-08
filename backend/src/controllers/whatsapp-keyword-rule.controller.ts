import type { Request, Response, NextFunction } from 'express';
import {
  listKeywordRules,
  createKeywordRule,
  updateKeywordRule,
  deleteKeywordRule,
} from '../services/whatsapp-keyword-rule.service';

export const list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await listKeywordRules() });
  } catch (e) {
    next(e);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rule = await createKeywordRule({ ...req.body, createdBy: req.user!.id });
    res.status(201).json({ success: true, data: rule });
  } catch (e) {
    next(e);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rule = await updateKeywordRule(String(req.params.id), req.body);
    res.json({ success: true, data: rule });
  } catch (e) {
    next(e);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await deleteKeywordRule(String(req.params.id));
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};
