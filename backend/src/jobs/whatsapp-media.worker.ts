import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { prisma } from '../config/prisma';
import logger from '../config/logger';
import { WHATSAPP_MEDIA_QUEUE_NAME } from './whatsapp-media.queue';
import { archiveInboundMedia } from '../services/whatsapp-media.service';

interface WhatsappMediaJobData {
  messageId: string;
  mediaId: string;
  mime: string;
}

/**
 * Downloads inbound WhatsApp media from Meta and durably archives it to R2,
 * then stamps the originating message's `mediaUrl` with the R2 key. Throws when
 * archival returns null so BullMQ retries (exponential backoff) within Meta's
 * ~30-day media window — the inbox stays responsive because this is decoupled
 * from the inbound webhook worker.
 */
export function createWhatsappMediaWorker(): Worker<WhatsappMediaJobData> {
  const worker = new Worker<WhatsappMediaJobData>(
    WHATSAPP_MEDIA_QUEUE_NAME,
    async (job: Job<WhatsappMediaJobData>) => {
      return (async () => {
          const { messageId, mediaId, mime } = job.data;
          const key = await archiveInboundMedia(mediaId, mime || 'application/octet-stream');
          if (!key) {
            // null = R2 unconfigured OR a transient fetch failure. Throw so
            // BullMQ retries within Meta's ~30-day media availability window.
            throw new Error(`WhatsApp media archival returned no key for mediaId=${mediaId}`);
          }
          await prisma.waMessage.update({
            where: { id: messageId },
            data: { mediaUrl: key },
          });
          return { archived: true, key };
        })();
    },
    {
      connection: redis,
      concurrency: 4,
      lockDuration: 120000, // media downloads can be slow/large
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(`WhatsApp media job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
