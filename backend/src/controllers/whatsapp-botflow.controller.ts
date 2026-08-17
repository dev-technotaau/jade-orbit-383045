import type { Request, Response, NextFunction } from 'express';
import * as flowService from '../services/whatsapp-botflow.service';

/**
 * CRUD for conversational bot flows (WaBotFlow + WaBotStep).
 *
 * The runtime lives in whatsapp-autoreply.service; this is only the editing
 * surface the console drives. Steps are addressed under their flow
 * (`/bot-flows/:id/steps/:stepId`) so a step id belonging to another flow 404s
 * rather than being edited through the wrong flow's audit entry.
 */

export const list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await flowService.listBotFlows() });
  } catch (e) {
    next(e);
  }
};

export const get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await flowService.getBotFlow(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await flowService.createBotFlow({ ...req.body, createdBy: req.user?.id ?? null });
    res.status(201).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await flowService.updateBotFlow(String(req.params.id), req.body);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await flowService.deleteBotFlow(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
};

export const createStep = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await flowService.createBotStep(String(req.params.id), req.body);
    res.status(201).json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

export const updateStep = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await flowService.updateBotStep(
      String(req.params.id),
      String(req.params.stepId),
      req.body
    );
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

export const removeStep = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await flowService.deleteBotStep(String(req.params.id), String(req.params.stepId));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};
