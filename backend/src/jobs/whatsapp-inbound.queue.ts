import { Queue } from 'bullmq';
import { redis } from '../config/redis';
import logger from '../config/logger';

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
    // Bounded, not `false`. Failed jobs are worth keeping to diagnose a bad
    // run, but `false` keeps them FOREVER — in Redis, the one datastore here
    // with no retention story and the tightest memory budget. A week and a
    // thousand jobs is enough to investigate anything anyone will actually
    // investigate.
    removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
  },
});

whatsappInboundQueue.on('error', (err) => {
  logger.error('WhatsApp Inbound Queue Error:', err);
});

logger.info(`WhatsApp Inbound Queue initialized: ${WHATSAPP_INBOUND_QUEUE_NAME}`);

export async function addWhatsappInboundJob(data: { eventRowId: string }) {
  return whatsappInboundQueue.add(
    'process-webhook-event',
    { ...data },
    { jobId: data.eventRowId } // dedup at the queue layer (one job per event row)
  );
}

/**
 * Re-enqueue an event whose job already exists in the queue.
 *
 * `addWhatsappInboundJob` pins `jobId` to the event row id for dedup, and this
 * queue keeps failed jobs (`removeOnFail: false`) for forensics. BullMQ treats an
 * `add` with an existing jobId as a no-op — it returns the *old* job without
 * scheduling anything. So the event-recovery cron, whose entire purpose is to
 * rescue events whose job died after exhausting its 5 attempts, could never
 * actually rescue one: the corpse of the failed job blocked every re-add, the
 * cron logged "re-enqueued N/N" every 5 minutes, and the messages stayed lost.
 *
 * Clear the spent job first, then add a fresh one. Live jobs (waiting/active/
 * delayed) are left strictly alone — those are still going to run on their own.
 */
export async function requeueWhatsappInboundJob(eventRowId: string) {
  const existing = await whatsappInboundQueue.getJob(eventRowId);
  if (existing) {
    const state = await existing.getState();
    if (state !== 'completed' && state !== 'failed' && state !== 'unknown') {
      return null; // already queued or running — nothing to recover
    }
    try {
      await existing.remove();
    } catch (e) {
      // Raced with the worker picking it up; the live job wins.
      logger.debug(
        `WhatsApp inbound requeue: could not remove job ${eventRowId}: ${(e as Error).message}`
      );
      return null;
    }
  }
  return addWhatsappInboundJob({ eventRowId });
}
