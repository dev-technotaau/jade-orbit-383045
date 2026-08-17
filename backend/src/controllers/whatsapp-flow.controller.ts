import type { Request, Response, NextFunction } from 'express';
import * as flowService from '../services/whatsapp-flow.service';

/**
 * WhatsApp Flows management.
 *
 * Sending a flow already worked; everything around it did not. Without these
 * routes an operator had to author in Meta's Flow Builder and copy ids across by
 * hand, with no local record of which flows existed or what state they were in.
 */

export const list = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await flowService.listFlows() });
  } catch (e) {
    next(e);
  }
};

export const get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await flowService.getFlow(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
};

export const sync = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await flowService.syncFlows() });
  } catch (e) {
    next(e);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const flow = await flowService.createFlow({
      name: String(req.body.name),
      categories: req.body.categories as string[],
      endpointUri: req.body.endpointUri ? String(req.body.endpointUri) : undefined,
    });
    res.status(201).json({ success: true, data: flow });
  } catch (e) {
    next(e);
  }
};

export const updateJson = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const flow = await flowService.updateFlowJson(String(req.params.id), req.body.flowJson);
    res.json({ success: true, data: flow });
  } catch (e) {
    next(e);
  }
};

/** Publish. One-way: a published flow can be deprecated, never returned to draft. */
export const publish = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await flowService.publishFlow(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
};

export const deprecate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await flowService.deprecateFlow(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await flowService.deleteFlow(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
};

/** Short-lived web preview so a flow can be reviewed without sending it to anyone. */
export const preview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await flowService.getFlowPreview(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
};

/** Submissions — the answers customers actually filled in. */
export const responses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = parseInt(String(req.query.page ?? '1'), 10) || 1;
    const limit = Math.min(100, parseInt(String(req.query.limit ?? '20'), 10) || 20);
    const flowId = req.params.id ? String(req.params.id) : undefined;
    res.json({ success: true, data: await flowService.listFlowResponses(flowId, page, limit) });
  } catch (e) {
    next(e);
  }
};
