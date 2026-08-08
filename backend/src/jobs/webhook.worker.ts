import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import prisma from '../config/prisma';
import { WEBHOOK_QUEUE_NAME } from './webhook.queue';
import { webhookService } from '../services/webhook.service';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';

interface WebhookJobData {
  webhookId: string;
  url: string;
  secret: string;
  event: string;
  payload: Record<string, unknown>;
}

const MAX_FAILURE_COUNT = 10;

export function createWebhookWorker(): Worker<WebhookJobData> {
  const worker = new Worker<WebhookJobData>(
    WEBHOOK_QUEUE_NAME,
    async (job: Job<WebhookJobData>) => {
      const traceCtx = (job.data as Record<string, any>)?._traceContext || {};
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          const { webhookId, url, secret, event, payload } = job.data;

          logger.info(`Processing webhook delivery ${job.id} to ${url} for event ${event}`);

          const body = JSON.stringify({
            event,
            timestamp: new Date().toISOString(),
            data: payload,
          });

          const signature = webhookService.generateSignature(secret, body);

          let statusCode: number | undefined;
          let responseBody: string | undefined;
          let success = false;
          let error: string | undefined;

          try {
            // eslint-disable-next-line n/no-unsupported-features/node-builtins
            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-webhook-signature': signature,
                'x-webhook-event': event,
                'x-webhook-delivery': job.id || '',
              },
              body,
              signal: AbortSignal.timeout(10000), // eslint-disable-line n/no-unsupported-features/node-builtins
            });

            statusCode = response.status;
            responseBody = await response.text().catch(() => '');
            success = response.ok;

            if (!response.ok) {
              error = `HTTP ${response.status}: ${responseBody?.substring(0, 500)}`;
            }
          } catch (err) {
            error = err instanceof Error ? err.message : 'Unknown error';
            logger.error(`Webhook delivery failed to ${url}: ${error}`);
          }

          // Record delivery
          await prisma.webhookDelivery
            .create({
              data: {
                webhookId,
                event,
                payload: payload as any,
                statusCode,
                response: responseBody?.substring(0, 2000),
                success,
                attempt: job.attemptsMade + 1,
                error,
              },
            })
            .catch((err) => logger.error('Failed to record webhook delivery', err));

          // Update webhook metadata
          if (success) {
            await prisma.webhookEndpoint
              .update({
                where: { id: webhookId },
                data: {
                  lastTriggeredAt: new Date(),
                  failureCount: 0,
                },
              })
              .catch(() => {});
          } else {
            // Atomic increment to avoid TOCTOU race between concurrent workers
            const updated = await prisma.webhookEndpoint
              .update({
                where: { id: webhookId },
                data: {
                  failureCount: { increment: 1 },
                  lastTriggeredAt: new Date(),
                },
                select: { failureCount: true },
              })
              .catch(() => null);

            if (updated && updated.failureCount >= MAX_FAILURE_COUNT) {
              await prisma.webhookEndpoint
                .update({
                  where: { id: webhookId },
                  data: { isActive: false },
                })
                .catch(() => {});
              logger.warn(
                `Webhook ${webhookId} disabled after ${MAX_FAILURE_COUNT} consecutive failures`
              );
            }

            // Throw to trigger BullMQ retry
            throw new Error(error || 'Webhook delivery failed');
          }

          return { success, statusCode };
        }
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_WEBHOOK_CONCURRENCY, 10),
      lockDuration: 30000,
      limiter: {
        max: 20,
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info(`Webhook delivery ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Webhook delivery ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
