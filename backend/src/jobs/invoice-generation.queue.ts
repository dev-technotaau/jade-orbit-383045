import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { registerInvoicePdfEnqueuer } from '../services/invoice.service';
import { safeJobId } from './job-id';

export const INVOICE_GENERATION_QUEUE_NAME = 'invoice-generation';

export interface InvoiceGenerationJobData {
  invoiceId: string;
}

export const invoiceGenerationQueue = new Queue<InvoiceGenerationJobData>(
  INVOICE_GENERATION_QUEUE_NAME,
  {
    connection: redis,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  }
);

invoiceGenerationQueue.on('error', (err) => {
  logger.error('Invoice generation queue error', err);
});

// Register the enqueue function with the service so it can dispatch async
// after issuing the invoice row.
registerInvoicePdfEnqueuer((invoiceId) =>
  invoiceGenerationQueue.add(
    'generate-pdf',
    { invoiceId },
    { jobId: safeJobId('invoice', invoiceId) }
  )
);

logger.info(`Invoice generation queue initialized: ${INVOICE_GENERATION_QUEUE_NAME}`);
