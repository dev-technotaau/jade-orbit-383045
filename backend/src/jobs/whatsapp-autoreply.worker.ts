import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import type { WhatsappAutoReplyJobData } from './whatsapp-autoreply.queue';
import { WHATSAPP_AUTOREPLY_QUEUE_NAME } from './whatsapp-autoreply.queue';
import { handleInboundAutoReply } from '../services/whatsapp-autoreply.service';

/**
 * Runs the inbound auto-reply engine (keyword rules, FAQ, welcome, away) for one
 * inbound message.
 *
 * Nothing is swallowed here on purpose: `handleInboundAutoReply` now propagates,
 * and every throw is a reply the customer did not get. Letting it fail is what
 * buys the retry, and a reply that keeps failing lands in the failed set where
 * an operator can actually see it — previously the only trace was one warn line
 * in the server log.
 */
export function createWhatsappAutoReplyWorker(): Worker<WhatsappAutoReplyJobData> {
  const worker = new Worker<WhatsappAutoReplyJobData>(
    WHATSAPP_AUTOREPLY_QUEUE_NAME,
    async (job: Job<WhatsappAutoReplyJobData>) => {
      await handleInboundAutoReply({
        conversationId: job.data.conversationId,
        contactId: job.data.contactId,
        channelId: job.data.channelId,
        text: job.data.text,
        buttonId: job.data.buttonId ?? null,
        buttonTitle: job.data.buttonTitle ?? null,
        isNewConversation: job.data.isNewConversation,
      });
    },
    {
      connection: redis,
      // Concurrent runs on the SAME conversation are safe: the welcome is
      // claimed with a guarded updateMany and the away/rule replies with Redis
      // SET NX, so only one of them can send.
      concurrency: 4,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(
      `WhatsApp auto-reply job ${job?.id} (conv ${job?.data.conversationId}) failed: ${err.message}`
    );
  });

  return worker;
}
