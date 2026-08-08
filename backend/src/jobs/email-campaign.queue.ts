import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { injectTraceContext } from '../utils/trace-propagation';

export const EMAIL_CAMPAIGN_QUEUE_NAME = 'email-campaign-queue';

/**
 * Dedicated bulk email campaign queue — separate from the transactional
 * `email-queue` so a large blast never starves OTP / security emails. Each job
 * is a BATCH of recipient ids; the worker atomically claims each recipient
 * (PENDING -> SENT) before sending, so a retry or leader flip can never
 * double-send.
 */
export const emailCampaignQueue = new Queue(EMAIL_CAMPAIGN_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

emailCampaignQueue.on('error', (err) => {
  logger.error('Email Campaign Queue Error:', err);
});

logger.info(`Email Campaign Queue initialized: ${EMAIL_CAMPAIGN_QUEUE_NAME}`);

export async function addEmailCampaignBatchJob(data: {
  campaignId: string;
  recipientIds: string[];
}) {
  return emailCampaignQueue.add('send-batch', { ...data, _traceContext: injectTraceContext() });
}
