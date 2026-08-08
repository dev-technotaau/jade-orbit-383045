import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { injectTraceContext } from '../utils/trace-propagation';

export const WHATSAPP_CAMPAIGN_QUEUE_NAME = 'whatsapp-campaign-queue';

/**
 * Bulk WhatsApp campaign queue. Each job is a BATCH of recipient ids; the
 * worker sends an approved template to each at the campaign's throttle. Retry
 * is safe and idempotent — the worker atomically claims each recipient
 * (PENDING -> SENT) before sending, so a job retry or a leader flip can never
 * double-send a recipient that another run already claimed.
 */
export const whatsappCampaignQueue = new Queue(WHATSAPP_CAMPAIGN_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

whatsappCampaignQueue.on('error', (err) => {
  logger.error('WhatsApp Campaign Queue Error:', err);
});

logger.info(`WhatsApp Campaign Queue initialized: ${WHATSAPP_CAMPAIGN_QUEUE_NAME}`);

export async function addCampaignBatchJob(data: { campaignId: string; recipientIds: string[] }) {
  return whatsappCampaignQueue.add('send-batch', {
    ...data,
    _traceContext: injectTraceContext(),
  });
}
