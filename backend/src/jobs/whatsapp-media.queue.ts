import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { injectTraceContext } from '../utils/trace-propagation';

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
    attempts: 5,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: true,
    removeOnFail: 500,
  },
});

whatsappMediaQueue.on('error', (err) => {
  logger.error('WhatsApp Media Queue Error:', err);
});

logger.info(`WhatsApp Media Queue initialized: ${WHATSAPP_MEDIA_QUEUE_NAME}`);

export async function addWhatsappMediaJob(data: {
  messageId: string;
  mediaId: string;
  mime: string;
}) {
  return whatsappMediaQueue.add('archive-inbound-media', {
    ...data,
    _traceContext: injectTraceContext(),
  });
}
