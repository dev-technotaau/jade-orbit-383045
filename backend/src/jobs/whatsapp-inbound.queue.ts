import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { injectTraceContext } from '../utils/trace-propagation';

export const WHATSAPP_INBOUND_QUEUE_NAME = 'whatsapp-inbound-queue';

/**
 * Inbound WhatsApp webhook processing queue. Each job references a persisted
 * `WaWebhookEvent` row; the worker parses it (messages + statuses) into
 * conversations / messages and emits real-time updates. Retries generously
 * since reprocessing is idempotent (dedup on WAMID).
 */
export const whatsappInboundQueue = new Queue(WHATSAPP_INBOUND_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

whatsappInboundQueue.on('error', (err) => {
  logger.error('WhatsApp Inbound Queue Error:', err);
});

logger.info(`WhatsApp Inbound Queue initialized: ${WHATSAPP_INBOUND_QUEUE_NAME}`);

export async function addWhatsappInboundJob(data: { eventRowId: string }) {
  return whatsappInboundQueue.add(
    'process-webhook-event',
    { ...data, _traceContext: injectTraceContext() },
    { jobId: data.eventRowId } // dedup at the queue layer (one job per event row)
  );
}
