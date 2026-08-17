import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { r2Client } from '../config/r2';

export const WHATSAPP_MEDIA_QUEUE_NAME = 'whatsapp-media-queue';

/**
 * Inbound WhatsApp media archival queue. Decoupled from the inbound webhook
 * worker so a slow/large media download never stalls inbox processing. Each job
 * downloads the media from Meta and durably archives it to R2, then stamps the
 * message's `mediaUrl`. Retried generously (exponential backoff) within Meta's
 * ~30-day media availability window on transient failure.
 */
export const whatsappMediaQueue = new Queue(WHATSAPP_MEDIA_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    // 12 attempts on a 30s exponential backoff — 11 waits totalling ~17 hours.
    //
    // This said 5 attempts at 30s exponential — about 8.5 minutes total — directly
    // beneath a comment claiming the retries were generous "within Meta’s ~30-day
    // media availability window". A brief R2 outage therefore lost the media
    // permanently, and the code read as though it could not.
    attempts: 12,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: true,
    removeOnFail: 500,
  },
});

whatsappMediaQueue.on('error', (err) => {
  logger.error('WhatsApp Media Queue Error:', err);
});

logger.info(`WhatsApp Media Queue initialized: ${WHATSAPP_MEDIA_QUEUE_NAME}`);

let loggedR2Unconfigured = false;

export async function addWhatsappMediaJob(data: {
  messageId: string;
  mediaId: string;
  mime: string;
}) {
  // Deployments without R2 are supported — there is simply nowhere to archive to,
  // so skip the enqueue rather than pay a job (and its whole retry envelope) per
  // media message to discover that. Media stays readable through the Meta proxy.
  if (!r2Client) {
    if (!loggedR2Unconfigured) {
      loggedR2Unconfigured = true;
      logger.info(
        'R2 not configured — skipping WhatsApp media archival; media is served via the Meta proxy for ~30 days'
      );
    }
    return null;
  }
  return whatsappMediaQueue.add('archive-inbound-media', {
    ...data,
  });
}
