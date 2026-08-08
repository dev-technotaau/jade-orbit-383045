import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { WEB_PUSH_QUEUE_NAME } from './web-push.queue';
import { sendWebPushNotification } from '../services/web-push.service';
import { deviceService } from '../services/device.service';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';

interface WebPushJobData {
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  payload: string | Buffer | null;
}

export function createWebPushWorker(): Worker<WebPushJobData> {
  const worker = new Worker<WebPushJobData>(
    WEB_PUSH_QUEUE_NAME,
    async (job: Job<WebPushJobData>) => {
      const traceCtx = (job.data as Record<string, any>)?._traceContext || {};
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          const TIMEOUT_MS = 30_000;
          const timeoutId = setTimeout(() => {
            /* safety net */
          }, TIMEOUT_MS);
          try {
            logger.info(`Processing Web Push job ${job.id}`);

            await Promise.race([
              sendWebPushNotification(job.data.subscription, job.data.payload),
              new Promise<never>((_resolve, reject) =>
                setTimeout(() => reject(new Error('Web Push worker timeout after 30s')), TIMEOUT_MS)
              ),
            ]);
            logger.info(`Web Push notification sent`);
            return { sent: true };
          } catch (error: any) {
            // If subscription is expired, clean it up
            if (error.statusCode === 410 || error.statusCode === 404) {
              await deviceService.removePushSubscriptionByEndpoint(job.data.subscription.endpoint);
              logger.warn('Removed expired push subscription');
              return { sent: false, expired: true };
            }
            logger.error(`Failed to send Web Push notification:`, error);
            throw error;
          } finally {
            clearTimeout(timeoutId);
          }
        }
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_WEBPUSH_CONCURRENCY, 10),
      lockDuration: 60000,
      limiter: {
        max: 20,
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info(`Web Push job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Web Push job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
