import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';
import { RAZORPAY_WEBHOOK_QUEUE_NAME, type RazorpayWebhookJobData } from './razorpay-webhook.queue';
import { processWebhookEvent } from '../services/razorpay-webhook.service';

export function createRazorpayWebhookWorker(): Worker<RazorpayWebhookJobData> {
  const worker = new Worker<RazorpayWebhookJobData>(
    RAZORPAY_WEBHOOK_QUEUE_NAME,
    async (job: Job<RazorpayWebhookJobData>) => {
      const traceCtx =
        (job.data as RazorpayWebhookJobData & { _traceContext?: Record<string, string> })
          ._traceContext ?? {};
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          logger.info(
            `Razorpay webhook job ${job.id} processing event=${job.data.event} row=${job.data.eventRowId}`
          );
          await processWebhookEvent(job.data.eventRowId);
        }
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_RAZORPAY_WEBHOOK_CONCURRENCY, 10),
      lockDuration: 60_000,
      limiter: { max: 50, duration: 1000 },
    }
  );

  worker.on('completed', (job) => {
    logger.info(`Razorpay webhook job ${job.id} completed (event=${job.data?.event})`);
  });
  worker.on('failed', (job, err) => {
    logger.error(
      `Razorpay webhook job ${job?.id} failed (event=${job?.data?.event}): ${err.message}`
    );
  });
  return worker;
}
