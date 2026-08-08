import type { Request, Response, NextFunction } from 'express';
import { webhookService } from '../services/webhook.service';

/**
 * POST /api/v1/webhooks
 */
export const createWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = (req as any).user;
    const { url, events, description } = req.body;

    const webhook = await webhookService.register(user.id, url, events, description);

    res.status(201).json({
      status: 'success',
      message: 'Webhook created successfully',
      data: {
        id: webhook.id,
        url: webhook.url,
        secret: webhook.secret,
        events: webhook.events,
        isActive: webhook.isActive,
        description: webhook.description,
        createdAt: webhook.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/webhooks
 */
export const listWebhooks = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = (req as any).user;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const data = await webhookService.list(user.id, page, limit);

    res.status(200).json({
      status: 'success',
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/webhooks/:id
 */
export const getWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = (req as any).user;
    const webhookId = req.params.id as string;

    const webhook = await webhookService.getById(user.id, webhookId);

    res.status(200).json({
      status: 'success',
      data: webhook,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/webhooks/:id
 */
export const updateWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = (req as any).user;
    const webhookId = req.params.id as string;

    const webhook = await webhookService.update(user.id, webhookId, req.body);

    res.status(200).json({
      status: 'success',
      message: 'Webhook updated successfully',
      data: webhook,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/webhooks/:id
 */
export const deleteWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = (req as any).user;
    const webhookId = req.params.id as string;

    await webhookService.delete(user.id, webhookId);

    res.status(200).json({
      status: 'success',
      message: 'Webhook deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/webhooks/:id/deliveries
 */
export const getDeliveries = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = (req as any).user;
    const webhookId = req.params.id as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const deliveries = await webhookService.getDeliveries(webhookId, user.id, page, limit);

    res.status(200).json({
      status: 'success',
      data: deliveries,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/webhooks/:id/test
 */
export const testWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = (req as any).user;
    const webhookId = req.params.id as string;

    const result = await webhookService.testWebhook(user.id, webhookId);

    res.status(200).json({
      status: 'success',
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};
