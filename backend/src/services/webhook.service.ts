import crypto from 'crypto';
import prisma from '../config/prisma';
import logger from '../config/logger';
import { webhookQueue } from '../jobs/webhook.queue';
import { AppError } from '../middleware/error';
import { isFeatureEnabled } from '../config/feature-flags';

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
      data,
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
        secret: true,
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
    if (!(await isFeatureEnabled('enableWebhooks'))) {
      logger.debug('Webhooks disabled via feature flag — skipping dispatch');
      return;
    }

    try {
      const webhooks = await prisma.webhookEndpoint.findMany({
        where: {
          isActive: true,
          events: { has: event },
        },
      });

      for (const webhook of webhooks) {
        await webhookQueue.add(`webhook-${webhook.id}-${event}`, {
          webhookId: webhook.id,
          url: webhook.url,
          secret: webhook.secret,
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
      url: webhook.url,
      secret: webhook.secret,
      event: 'test',
      payload: {
        event: 'test',
        timestamp: new Date().toISOString(),
        message: 'This is a test webhook delivery from Hire Adda.',
      },
    });

    return { message: 'Test webhook queued for delivery' };
  },

  generateSignature(secret: string, payload: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  },
};
