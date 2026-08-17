import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';

export const WHATSAPP_IMPORT_QUEUE_NAME = 'whatsapp-import-queue';

export interface WhatsappImportJobData {
  /** WaImportJob row this run reports progress into. */
  jobId: string;
  rows: Array<{
    phone: string;
    name?: string;
    tags?: string[];
    /** Unmapped import columns (city, order id, plan…) used for personalisation. */
    attributes?: Record<string, string>;
  }>;
  optIn: boolean;
  replaceTags: boolean;
}

/**
 * Bulk contact-import queue.
 *
 * The import used to run inside the HTTP request. At the advertised 5000 rows it
 * could not finish inside the 30s request budget, so the operator got a 408
 * while the loop kept committing rows — a partial, untracked write whose only
 * recovery was to re-upload the file. Off the request path it can take as long
 * as it takes, and the modal watches the WaImportJob row instead of a socket.
 */
export const whatsappImportQueue = new Queue<WhatsappImportJobData>(WHATSAPP_IMPORT_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    // Two attempts, not more: the work is idempotent per row (existing contacts
    // are updated, not duplicated), but a retry re-walks rows that already
    // landed, so this is a safety net for a transient database blip rather than
    // a backoff schedule to lean on.
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
    // The payload carries the whole file, so finished jobs must not linger in
    // Redis — the WaImportJob row is the durable record.
    removeOnComplete: true,
    removeOnFail: { age: 24 * 3600, count: 50 },
  },
});

whatsappImportQueue.on('error', (err) => {
  logger.error('WhatsApp Import Queue Error:', err);
});

logger.info(`WhatsApp Import Queue initialized: ${WHATSAPP_IMPORT_QUEUE_NAME}`);

export async function addWhatsappImportJob(data: WhatsappImportJobData) {
  return whatsappImportQueue.add('import-contacts', data, { jobId: `wa-import-${data.jobId}` });
}
