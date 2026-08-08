import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import logger from '../config/logger';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';
import {
  INVOICE_GENERATION_QUEUE_NAME,
  type InvoiceGenerationJobData,
} from './invoice-generation.queue';
import { generateAndUploadInvoicePdf } from '../services/invoice.service';

export function createInvoiceGenerationWorker(): Worker<InvoiceGenerationJobData> {
  const worker = new Worker<InvoiceGenerationJobData>(
    INVOICE_GENERATION_QUEUE_NAME,
    async (job: Job<InvoiceGenerationJobData>) => {
      const traceCtx =
        (job.data as InvoiceGenerationJobData & { _traceContext?: Record<string, string> })
          ._traceContext ?? {};
      return withExtractedContext(
        traceCtx,
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => {
          logger.info(`Invoice generation job ${job.id} starting`, {
            invoiceId: job.data.invoiceId,
          });
          await generateAndUploadInvoicePdf(job.data.invoiceId);
        }
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_INVOICE_GEN_CONCURRENCY, 10),
      lockDuration: 120_000,
      limiter: { max: 10, duration: 1000 },
    }
  );

  worker.on('completed', (job) =>
    logger.info(`Invoice generation job ${job.id} completed`, { invoiceId: job.data?.invoiceId })
  );
  worker.on('failed', (job, err) =>
    logger.error(`Invoice generation job ${job?.id} failed: ${err.message}`)
  );
  return worker;
}
