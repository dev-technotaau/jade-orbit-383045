import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';
import { safeJobId } from './job-id';

export const WHATSAPP_AUTOREPLY_QUEUE_NAME = 'whatsapp-autoreply-queue';

export interface WhatsappAutoReplyJobData {
  /** WAMID of the inbound message that triggered this run — also the job id. */
  wamid: string;
  conversationId: string;
  contactId: string;
  channelId: string;
  text: string | null;
  buttonId?: string | null;
  /** The label the customer actually saw on the button they tapped. */
  buttonTitle?: string | null;
  isNewConversation: boolean;
}

/**
 * Inbound auto-reply queue (welcome / away / keyword rules / FAQ menu).
 *
 * The engine used to run inline in the inbound worker as
 * `handleInboundAutoReply(...).catch(() => {})`. That made every reply
 * best-effort at best: a Meta 500 or a Prisma pool timeout lost the customer's
 * reply permanently, because there was no job to retry and nothing but a log
 * line to notice it by. Owning a queue gives the reply durability, bounded
 * retries and the same queue-depth gauges every other worker has.
 */
export const whatsappAutoReplyQueue = new Queue<WhatsappAutoReplyJobData>(
  WHATSAPP_AUTOREPLY_QUEUE_NAME,
  {
    connection: redis,
    defaultJobOptions: {
      // Deliberately short and few (5s, then 10s). An auto-reply that lands
      // several minutes after the customer wrote in is worse than no auto-reply
      // — by then a human may already be on the thread — so this retries the
      // transient blip and then gives up rather than backing off for an hour.
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      // Completed jobs are kept for an hour rather than dropped on the spot: the
      // job id is the inbound WAMID, so a webhook Meta re-delivers within that
      // window is a no-op add instead of a second reply to the same message.
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
    },
  }
);

whatsappAutoReplyQueue.on('error', (err) => {
  logger.error('WhatsApp Auto-Reply Queue Error:', err);
});

logger.info(`WhatsApp Auto-Reply Queue initialized: ${WHATSAPP_AUTOREPLY_QUEUE_NAME}`);

export async function addWhatsappAutoReplyJob(data: WhatsappAutoReplyJobData) {
  return whatsappAutoReplyQueue.add(
    'inbound-auto-reply',
    { ...data },
    // Keyed on the WAMID (through safeJobId, since BullMQ reserves `:`) so two
    // deliveries of the same inbound message can only ever produce one reply.
    { jobId: safeJobId('wa-auto', data.wamid) }
  );
}
