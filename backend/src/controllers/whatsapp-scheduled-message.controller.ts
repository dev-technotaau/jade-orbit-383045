import type { Request, Response, NextFunction } from 'express';
import {
  scheduleMessage,
  listScheduled,
  cancelScheduled,
} from '../services/whatsapp-scheduled-message.service';

export const schedule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await scheduleMessage({
      ...req.body,
      conversationId: String(req.params.id),
      sendAt: new Date(req.body.sendAt),
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await listScheduled(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
};

export const cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await cancelScheduled(String(req.params.msgId)) });
  } catch (e) {
    next(e);
  }
};
