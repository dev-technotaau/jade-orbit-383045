import type { Request, Response, NextFunction } from 'express';
import { getWaSettings, updateWaSettings } from '../services/whatsapp-settings.service';

export const getSettings = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({ success: true, data: await getWaSettings() });
  } catch (e) {
    next(e);
  }
};

export const updateSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    res.json({ success: true, data: await updateWaSettings(req.body) });
  } catch (e) {
    next(e);
  }
};
