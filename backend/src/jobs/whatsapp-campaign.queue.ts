import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';

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
    // Bounded, not `false`. Failed jobs are worth keeping to diagnose a bad
    // run, but `false` keeps them FOREVER — in Redis, the one datastore here
    // with no retention story and the tightest memory budget. A week and a
    // thousand jobs is enough to investigate anything anyone will actually
    // investigate.
    removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
  },
});

whatsappCampaignQueue.on('error', (err) => {
  logger.error('WhatsApp Campaign Queue Error:', err);
});

logger.info(`WhatsApp Campaign Queue initialized: ${WHATSAPP_CAMPAIGN_QUEUE_NAME}`);

export async function addCampaignBatchJob(data: { campaignId: string; recipientIds: string[] }) {
  return whatsappCampaignQueue.add('send-batch', {
    ...data,
  });
}
