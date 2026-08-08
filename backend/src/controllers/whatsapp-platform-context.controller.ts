import type { Request, Response, NextFunction } from 'express';
import * as platformContextService from '../services/whatsapp-platform-context.service';

export const getContext = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await platformContextService.getPlatformContext(String(req.params.id));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};
