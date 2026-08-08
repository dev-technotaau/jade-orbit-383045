import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { EMAIL_QUEUE_NAME } from './email.queue';
import { sendEmail } from '../services/email.service';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';

interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export function createEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobData>) => {
      const traceCtx = (job.data as Record<string, any>)?._traceContext || {};
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          const TIMEOUT_MS = 30_000;
          const timeoutId = setTimeout(() => {
            /* safety net; AbortSignal is primary */
          }, TIMEOUT_MS);
          try {
            logger.info(`Processing email job ${job.id} to ${job.data.to}`);

            await Promise.race([
              sendEmail(job.data),
              new Promise((_resolve, reject) =>
                setTimeout(() => reject(new Error('Email worker timeout after 30s')), TIMEOUT_MS)
              ),
            ]);
            logger.info(`Email sent to ${job.data.to}`);
            return { sent: true, messageId: 'mock-id' };
          } catch (error) {
            logger.error(`Failed to send email to ${job.data.to}:`, error);
            throw error;
          } finally {
            clearTimeout(timeoutId);
          }
        }
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_EMAIL_CONCURRENCY, 10),
      lockDuration: 30000,
      limiter: {
        max: 10,
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info(`Email job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Email job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
