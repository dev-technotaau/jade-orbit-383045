import type { Job } from 'bullmq';
import { Worker } from 'bullmq';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { OrderStatus } from '@prisma/client';
import logger from '../config/logger';
import { withExtractedContext, SpanKind } from '../utils/trace-propagation';
import {
  PAYMENT_STATUS_POLL_QUEUE_NAME,
  enqueuePaymentStatusPoll,
} from './payment-status-poll.queue';
import { fetchOrder } from '../config/razorpay';
import { recordPayment, type RazorpayPaymentSnapshot } from '../services/payment.service';

interface PollJobData {
  orderId: string;
  attempt: number;
}

/**
 * Polls Razorpay for the latest payments on a given order. If we find a
 * captured payment we don't yet have locally, we record it via the same
 * `recordPayment(...)` path the webhook uses — so the order finalises
 * (invoice + entitlement + notifications) automatically.
 */
async function pollOrder(orderId: string, attempt: number): Promise<{ resolved: boolean }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      razorpayOrderId: true,
      userId: true,
    },
  });
  if (!order) return { resolved: true }; // gone
  if (
    order.status !== OrderStatus.CREATED &&
    order.status !== OrderStatus.ATTEMPTED &&
    order.status !== OrderStatus.FAILED
  ) {
    return { resolved: true }; // already finalised
  }
  if (!order.razorpayOrderId) return { resolved: true };

  let payments: RazorpayPaymentSnapshot[] = [];
  try {
    const fetched = (await fetchOrder(order.razorpayOrderId)) as {
      payments?: { items?: RazorpayPaymentSnapshot[] };
    } | null;
    payments = fetched?.payments?.items ?? [];
    if (payments.length === 0) {
      // SDK older than v2.10 may not include nested payments — try
      // dedicated fetchPayments. Best-effort.
      const Razorpay = await import('../config/razorpay');
      const client = Razorpay.getRazorpayClient();
      if (client) {
        try {
          const res = (await client.orders.fetchPayments(order.razorpayOrderId)) as unknown as {
            items?: RazorpayPaymentSnapshot[];
          };
          payments = res?.items ?? [];
        } catch {
          /* not critical */
        }
      }
    }
  } catch (err) {
    logger.warn('payment-status-poll: fetch failed', {
      orderId,
      err: err instanceof Error ? err.message : err,
    });
    return { resolved: false };
  }

  let resolved = false;
  for (const snap of payments) {
    if (!snap?.id) continue;
    const existing = await prisma.payment.findUnique({
      where: { razorpayPaymentId: snap.id },
    });
    if (existing) {
      // already recorded; if its order is paid we're done
      if (existing.status === 'CAPTURED') resolved = true;
      continue;
    }
    try {
      await recordPayment(snap, { source: 'webhook' });
      if (snap.status === 'captured') resolved = true;
    } catch (err) {
      logger.warn('payment-status-poll: recordPayment failed', {
        orderId,
        razorpayPaymentId: snap.id,
        err: err instanceof Error ? err.message : err,
      });
    }
  }

  // Re-enqueue if not resolved and within the 30-min window
  if (!resolved && attempt < 59) {
    await enqueuePaymentStatusPoll({ orderId, attempt: attempt + 1, delayMs: 30_000 });
  }
  return { resolved };
}

/**
 * Cron sweeper — runs every 5 min via the scheduler queue
 * ('payment-status-sweep'). Finds CREATED/ATTEMPTED orders older than 60s
 * and enqueues a per-order poll for each (no-op if already in flight via
 * BullMQ deduplication on jobId).
 */
export async function handlePaymentStatusSweep(job: Job): Promise<{ swept: number }> {
  const cutoff = new Date(Date.now() - 60_000);
  const overdue = await prisma.order.findMany({
    where: {
      status: { in: [OrderStatus.CREATED, OrderStatus.ATTEMPTED] },
      createdAt: { lte: cutoff },
      // Skip orders already past the 30-min poll window
      expiresAt: { gte: new Date() },
    },
    select: { id: true },
    take: 200,
  });
  for (const o of overdue) {
    await enqueuePaymentStatusPoll({ orderId: o.id, attempt: 0, delayMs: 0 });
  }
  logger.info(`payment-status-sweep ${job.id} — enqueued ${overdue.length} orders`);
  return { swept: overdue.length };
}

export function createPaymentStatusPollWorker(): Worker {
  const worker = new Worker<PollJobData>(
    PAYMENT_STATUS_POLL_QUEUE_NAME,
    async (job) => {
      const traceCtx = (job.data as unknown as Record<string, unknown>)._traceContext as
        | Record<string, string>
        | undefined;
      return withExtractedContext(
        traceCtx ?? {},
        `bullmq.process ${job.name}`,
        SpanKind.CONSUMER,
        async () => pollOrder(job.data.orderId, job.data.attempt ?? 0)
      );
    },
    {
      connection: redis,
      concurrency: parseInt(env.BULLMQ_PAYMENT_STATUS_POLL_CONCURRENCY ?? '2', 10),
      lockDuration: 60_000,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(`payment-status-poll job ${job?.id} failed: ${err.message}`, {
      orderId: job?.data?.orderId,
      attempt: job?.data?.attempt,
    });
  });
  return worker;
}
