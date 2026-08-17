import type { Request, Response, NextFunction } from 'express';
import { webhookService } from '../services/webhook.service';

/**
 * Outbound webhook endpoints — the module's integration surface.
 *
 * `webhook.service.ts` has had full CRUD, HMAC signing, a delivery queue with
 * retries and a test-fire helper since the fork. None of it was reachable: there
 * was no controller, no route and no UI, so the only way to register a
 * subscriber was an INSERT by hand against the database. `emitWaEvent` therefore
 * fanned every WhatsApp event out to an empty list, and the whole integration
 * story — CRM sync, Zapier/Make, a customer's own backend — was dead on arrival.
 *
 * `userId` is the operator label rather than a real account (this module has a
 * single shared credential), which is what `req.user.id` resolves to everywhere
 * else in the codebase.
 */

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = parseInt(String(req.query.page ?? '1'), 10) || 1;
    const limit = Math.min(100, parseInt(String(req.query.limit ?? '20'), 10) || 20);
    res.json({ success: true, data: await webhookService.list(req.user!.id, page, limit) });
  } catch (e) {
    next(e);
  }
};

export const get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({
      success: true,
      data: await webhookService.getById(req.user!.id, String(req.params.id)),
    });
  } catch (e) {
    next(e);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const endpoint = await webhookService.register(
      req.user!.id,
      String(req.body.url),
      req.body.events as string[],
      req.body.description ? String(req.body.description) : undefined
    );
    // The signing secret is returned ONCE, on create. A subscriber cannot verify
    // signatures without it, and it is never echoed by list/get.
    res.status(201).json({ success: true, data: endpoint });
  } catch (e) {
    next(e);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const endpoint = await webhookService.update(req.user!.id, String(req.params.id), {
      ...(req.body.url !== undefined ? { url: String(req.body.url) } : {}),
      ...(req.body.events !== undefined ? { events: req.body.events as string[] } : {}),
      ...(req.body.description !== undefined ? { description: String(req.body.description) } : {}),
      ...(req.body.isActive !== undefined ? { isActive: Boolean(req.body.isActive) } : {}),
    });
    res.json({ success: true, data: endpoint });
  } catch (e) {
    next(e);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await webhookService.delete(req.user!.id, String(req.params.id));
    res.json({ success: true, data: { deleted: true } });
  } catch (e) {
    next(e);
  }
};

export const deliveries = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = parseInt(String(req.query.page ?? '1'), 10) || 1;
    const limit = Math.min(100, parseInt(String(req.query.limit ?? '20'), 10) || 20);
    res.json({
      success: true,
      data: await webhookService.getDeliveries(String(req.params.id), req.user!.id, page, limit),
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Re-queue a past delivery.
 *
 * Retries are bounded, so an event that failed while the subscriber was down was
 * simply lost — the delivery row recorded the loss and offered no way to undo it.
 */
export const replay = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({
      success: true,
      data: await webhookService.replayDelivery(
        req.user!.id,
        String(req.params.id),
        String(req.params.deliveryId)
      ),
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Fire a synthetic event at the endpoint so the operator can confirm the URL is
 * reachable and their signature check works BEFORE relying on it in production.
 */
export const test = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({
      success: true,
      data: await webhookService.testWebhook(req.user!.id, String(req.params.id)),
    });
  } catch (e) {
    next(e);
  }
};
