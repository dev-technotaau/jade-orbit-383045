import type { Job } from 'bullmq';
import { RazorpayWebhookStatus } from '@prisma/client';
import prisma from '../config/prisma';
import logger from '../config/logger';
import { razorpayWebhookQueue } from './razorpay-webhook.queue';
import { injectTraceContext } from '../utils/trace-propagation';

/**
 * Cap on total processing attempts (BullMQ attempts + sweep re-enqueues
 * combined). The webhook queue defaults to 5 BullMQ attempts before the
 * row lands in FAILED, then this sweep gives it up to 5 more attempts
 * (one per 5-minute tick) before giving up entirely. Manual super-admin
 * replay still works after the cap.
 */
const MAX_TOTAL_ATTEMPTS = 10;

/**
 * Maximum FAILED rows to resurrect per tick — keeps a sudden Razorpay
 * outage from creating a queue stampede when 100+ webhooks fail at once.
 */
const SWEEP_BATCH_SIZE = 50;

/**
 * Sweep handler. Runs in `scheduler.worker.ts`.
 *
 * Selects FAILED `RazorpayWebhookEvent` rows where `retryCount <
 * MAX_TOTAL_ATTEMPTS` and re-enqueues them. We do NOT bump `retryCount`
 * here — `processWebhookEvent` increments it on every call, which gives
 * us natural progress tracking.
 *
 * Plan §3.7 line 267.
 */
export async function handleWebhookRetrySweep(
  _job: Job
): Promise<{ resurrected: number; skipped: number }> {
  const candidates = await prisma.razorpayWebhookEvent.findMany({
    where: {
      status: RazorpayWebhookStatus.FAILED,
      retryCount: { lt: MAX_TOTAL_ATTEMPTS },
      signatureValid: true,
    },
    select: { id: true, event: true, retryCount: true },
    orderBy: { receivedAt: 'asc' },
    take: SWEEP_BATCH_SIZE,
  });

  let resurrected = 0;
  for (const row of candidates) {
    try {
      await razorpayWebhookQueue.add(
        'razorpay-webhook',
        {
          eventRowId: row.id,
          event: row.event,
          _traceContext: injectTraceContext(),
        },
        {
          // Unique jobId so BullMQ dedup doesn't reject the re-enqueue
          // (the original jobId === row.id was used by the first run).
          // EXACTLY two colons — see the note in review-aggregate.queue.ts.
          // Adding a segment here would throw at enqueue time; use safeJobId().
          jobId: `sweep:${row.id}:r${row.retryCount + 1}`,
        }
      );
      resurrected += 1;
    } catch (err) {
      logger.warn('webhook-retry-sweep — failed to re-enqueue', {
        eventRowId: row.id,
        err: err instanceof Error ? err.message : err,
      });
    }
  }

  if (resurrected > 0) {
    logger.info(
      `webhook-retry-sweep — resurrected ${resurrected}/${candidates.length} FAILED webhook events`
    );
  }

  return {
    resurrected,
    skipped: candidates.length - resurrected,
  };
}
