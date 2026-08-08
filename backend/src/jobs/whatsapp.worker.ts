import type { Job } from 'bullmq';
import { Worker, UnrecoverableError } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { WHATSAPP_QUEUE_NAME } from './whatsapp.queue';
import { sendWhatsAppMessage } from '../services/whatsapp.service';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';

interface WhatsAppJobData {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: any[];
  params?: string[];
}

/** Convert a flat params array to Meta WhatsApp components format */
function paramsToComponents(params: string[]): any[] {
  return [
    {
      type: 'body',
      parameters: params.map((text) => ({ type: 'text', text })),
    },
  ];
}

export function createWhatsappWorker(): Worker<WhatsAppJobData> {
  const worker = new Worker<WhatsAppJobData>(
    WHATSAPP_QUEUE_NAME,
    async (job: Job<WhatsAppJobData>) => {
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
            logger.info(`Processing WhatsApp job ${job.id} to ${job.data.to}`);

            const components =
              job.data.components ??
              (job.data.params ? paramsToComponents(job.data.params) : undefined);

            const sent = await Promise.race([
              sendWhatsAppMessage(
                job.data.to,
                job.data.templateName,
                job.data.languageCode || 'en',
                components
              ),
              new Promise<never>((_resolve, reject) =>
                setTimeout(() => reject(new Error('WhatsApp worker timeout after 30s')), TIMEOUT_MS)
              ),
            ]);
            if (!sent) {
              logger.warn(`WhatsApp not sent to ${job.data.to} - service may be unconfigured`);
            }
            return { sent };
          } catch (error) {
            logger.error(`Failed to send WhatsApp to ${job.data.to}:`, error);
            // Don't retry non-recoverable errors (4xx except 429 rate limit)
            if (error instanceof Error) {
              const statusMatch = error.message.match(/WhatsApp API (\d+)/);
              if (statusMatch) {
                const status = parseInt(statusMatch[1]);
                if (status >= 400 && status < 500 && status !== 429) {
                  throw new UnrecoverableError(error.message);
                }
              }
            }
            throw error;
          } finally {
            clearTimeout(timeoutId);
          }
        }
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_WHATSAPP_CONCURRENCY, 10),
      lockDuration: 60000,
      limiter: {
        max: 20,
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info(`WhatsApp job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`WhatsApp job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
