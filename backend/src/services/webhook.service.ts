import crypto from 'crypto';
import prisma from '../config/prisma';
import logger from '../config/logger';
import { webhookQueue } from '../jobs/webhook.queue';
import { AppError } from '../middleware/error';

export const webhookService = {
  async register(userId: string, url: string, events: string[], description?: string) {
    const secret = crypto.randomBytes(32).toString('hex');

    const webhook = await prisma.webhookEndpoint.create({
      data: {
        userId,
        url,
        secret,
        events,
        description,
      },
    });

    logger.info(`Webhook registered for user ${userId}: ${webhook.id}`);
    return webhook;
  },

  async update(
    userId: string,
    webhookId: string,
    data: {
      url?: string;
      events?: string[];
      description?: string;
      isActive?: boolean;
    }
  ) {
    const webhook = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, userId },
    });

    if (!webhook) {
      throw new AppError('Webhook not found', 404, 'WEBHOOK_NOT_FOUND');
    }

    return prisma.webhookEndpoint.update({
      where: { id: webhookId },
      data: {
        ...data,
        // Re-enabling clears the strike count. `failureCount` was only ever
        // reset by a SUCCESSFUL delivery, so an endpoint auto-disabled at 10
        // failures came back with the counter still at 10 — the very next failed
        // event tripped the threshold again and disabled it immediately. From
        // the operator's side the toggle simply did not work.
        ...(data.isActive === true ? { failureCount: 0 } : {}),
      },
      // Same field list as the read above, and for the same reason: an update
      // with no `select` returns the whole row, so editing a description handed
      // back the signing secret.
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        description: true,
        failureCount: true,
        lastTriggeredAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  async delete(userId: string, webhookId: string) {
    const webhook = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, userId },
    });

    if (!webhook) {
      throw new AppError('Webhook not found', 404, 'WEBHOOK_NOT_FOUND');
    }

    await prisma.webhookEndpoint.delete({ where: { id: webhookId } });
    logger.info(`Webhook deleted for user ${userId}: ${webhookId}`);
  },

  async list(userId: string, page = 1, limit = 20) {
    const cappedLimit = Math.min(limit, 100);
    const skip = (page - 1) * cappedLimit;

    const [items, total] = await Promise.all([
      prisma.webhookEndpoint.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: cappedLimit,
        select: {
          id: true,
          url: true,
          events: true,
          isActive: true,
          description: true,
          failureCount: true,
          lastTriggeredAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.webhookEndpoint.count({ where: { userId } }),
    ]);

    const totalPages = Math.ceil(total / cappedLimit) || 1;
    return { items, total, page, limit: cappedLimit, totalPages, hasMore: page < totalPages };
  },

  async getById(userId: string, webhookId: string) {
    const webhook = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, userId },
      select: {
        id: true,
        url: true,
        // NOT `secret`. The contract this file states is that the signing
        // secret is shown once, on create — but GET returned it on every read,
        // so it sat in the browser cache, in any HAR capture, and in the console
        // of anyone who opened the endpoint detail. `register` stays the sole
        // emitter; recovering a lost one is a rotation, which is a new secret
        // and an audit row rather than a quiet re-read.
        events: true,
        isActive: true,
        description: true,
        failureCount: true,
        lastTriggeredAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!webhook) {
      throw new AppError('Webhook not found', 404, 'WEBHOOK_NOT_FOUND');
    }

    return webhook;
  },

  async getDeliveries(webhookId: string, userId: string, page: number = 1, limit: number = 20) {
    const webhook = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, userId },
    });

    if (!webhook) {
      throw new AppError('Webhook not found', 404, 'WEBHOOK_NOT_FOUND');
    }

    const [items, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where: { webhookId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.webhookDelivery.count({ where: { webhookId } }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      items,
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    };
  },

  async dispatch(event: string, payload: Record<string, unknown>) {
    try {
      const webhooks = await prisma.webhookEndpoint.findMany({
        where: {
          isActive: true,
          events: { has: event },
        },
        // Ids only. The worker reads the url and the secret itself, so there is
        // no longer any reason to pull every subscriber's signing key into this
        // process on every single event.
        select: { id: true },
      });

      for (const webhook of webhooks) {
        // Id only — see the note on `webhookQueue` job data in webhook.worker.ts.
        // The url and the signing secret used to be copied in here, one full
        // plaintext copy per queued event, sitting in Redis for up to seven days
        // on the failure path; and because the copy was taken at dispatch time,
        // rotating a leaked secret or correcting a mistyped URL did nothing to
        // the thousands of events already queued against the old ones.
        await webhookQueue.add(`webhook-${webhook.id}-${event}`, {
          webhookId: webhook.id,
          event,
          payload,
        });
      }

      if (webhooks.length > 0) {
        logger.debug(`Dispatched ${event} to ${webhooks.length} webhooks`);
      }
    } catch (error) {
      logger.error('Failed to dispatch webhook event', error);
    }
  },

  async testWebhook(userId: string, webhookId: string) {
    const webhook = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, userId },
    });

    if (!webhook) {
      throw new AppError('Webhook not found', 404, 'WEBHOOK_NOT_FOUND');
    }

    await webhookQueue.add(`webhook-test-${webhook.id}`, {
      webhookId: webhook.id,
      event: 'test',
      // BARE payload, like every real event. The worker adds the
      // { event, timestamp, data } envelope, so pre-wrapping here made a test
      // delivery a different shape from the thing it is meant to be testing.
      payload: { message: 'This is a test webhook delivery.' },
    });

    return { message: 'Test webhook queued for delivery' };
  },

  /**
   * Replay a past delivery.
   *
   * The stored `payload` is the exact signed envelope `{ event, timestamp, data }`,
   * so the inner `data` is unwrapped back to the bare payload the queue expects —
   * the worker re-wraps it and re-signs it with a fresh timestamp, which any
   * replay-window check on the subscriber side requires.
   */
  async replayDelivery(userId: string, webhookId: string, deliveryId: string) {
    const webhook = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, userId },
    });

    if (!webhook) {
      throw new AppError('Webhook not found', 404, 'WEBHOOK_NOT_FOUND');
    }

    const delivery = await prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, webhookId },
    });

    if (!delivery) {
      throw new AppError('Delivery not found', 404, 'WEBHOOK_DELIVERY_NOT_FOUND');
    }

    const envelope = (delivery.payload ?? {}) as { data?: Record<string, unknown> };
    await webhookQueue.add(`webhook-replay-${webhook.id}-${delivery.id}`, {
      webhookId: webhook.id,
      event: delivery.event,
      payload: envelope.data ?? {},
    });

    logger.info(`Webhook delivery ${deliveryId} queued for replay to ${webhook.url}`);
    return { message: 'Delivery queued for replay' };
  },

  /**
   * The string that gets signed: `${unix-seconds}.${body}`.
   *
   * A bare body HMAC with no timestamp is replayable forever — anyone who ever
   * captured one valid request (a proxy log, a mirrored staging endpoint) could
   * resend it verbatim and the signature still verified. Binding the timestamp
   * into the signed string lets the subscriber reject anything outside a
   * tolerance window.
   */
  signaturePayload(timestamp: number, body: string): string {
    return `${timestamp}.${body}`;
  },

  generateSignature(secret: string, payload: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  },
};
