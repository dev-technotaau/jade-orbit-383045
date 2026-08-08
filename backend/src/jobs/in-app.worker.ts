import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { IN_APP_QUEUE_NAME } from './in-app.queue';
import { getIO } from '../socket';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';

interface InAppJobData {
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  link?: string;
}

export function createInAppWorker(): Worker<InAppJobData> {
  const worker = new Worker<InAppJobData>(
    IN_APP_QUEUE_NAME,
    async (job: Job<InAppJobData>) => {
      const traceCtx = (job.data as Record<string, any>)?._traceContext || {};
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          const TIMEOUT_MS = 15_000;
          const timeoutId = setTimeout(() => {
            /* safety net */
          }, TIMEOUT_MS);
          try {
            logger.info(`Processing In-App notification job ${job.id} for User ${job.data.userId}`);

            // Send via Socket.IO (Real-time)
            // Note: Notification record is already created by NotificationService.send()
            try {
              const io = getIO();
              io.to(`user:${job.data.userId}`).emit('notification', {
                title: job.data.title,
                message: job.data.message,
                type: job.data.type,
                link: job.data.link,
                createdAt: new Date().toISOString(),
              });
            } catch {
              // Socket.IO may not be initialized in worker process
              logger.debug('Socket.IO not available in worker - skipping real-time emit');
            }

            logger.info(`In-App notification processed for User ${job.data.userId}`);
            return { sent: true };
          } catch (error) {
            logger.error(
              `Failed to process In-App notification for User ${job.data.userId}:`,
              error
            );
            throw error;
          } finally {
            clearTimeout(timeoutId);
          }
        }
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_INAPP_CONCURRENCY, 10),
      lockDuration: 60000,
      limiter: { max: 50, duration: 1000 },
    }
  );

  worker.on('completed', (job) => {
    logger.info(`In-App job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`In-App job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
