import type { Request, Response, NextFunction } from 'express';
import {
  listSegments,
  getSegment,
  createSegment,
  updateSegment,
  deleteSegment,
} from '../services/whatsapp-segment.service';

export const list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await listSegments() });
  } catch (e) {
    next(e);
  }
};

export const get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await getSegment(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const segment = await createSegment({
      name: req.body.name,
      description: req.body.description,
      filter: req.body.filter,
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data: segment });
  } catch (e) {
    next(e);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const segment = await updateSegment(String(req.params.id), req.body);
    res.json({ success: true, data: segment });
  } catch (e) {
    next(e);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await deleteSegment(String(req.params.id));
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};
