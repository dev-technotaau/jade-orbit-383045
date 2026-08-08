/**
 * Razorpay webhook ingestion + async processing.
 *
 * Two-phase flow:
 *   1. **Sync ingest** (controller): verify HMAC, persist a `RazorpayWebhookEvent`
 *      row keyed by Razorpay's `event.id` (dedup), enqueue a BullMQ job, return 200.
 *   2. **Async dispatch** (worker): load event row, route to per-event handler,
 *      update status, retry on transient errors.
 *
 * Webhook is the source of truth — payment captures, refunds, subscription
 * lifecycle changes all converge here.
 */
import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { RazorpayWebhookStatus, type RazorpayWebhookEvent, type Prisma } from '@prisma/client';
import { verifyWebhookSignature } from '../config/razorpay';
import { recordPayment, type RazorpayPaymentSnapshot } from './payment.service';
import { handleSubscriptionEvent } from './webhook-handlers/subscription.handler';
import { handleMandateEvent } from './webhook-handlers/mandate.handler';
import { handleRefundEvent } from './refund.service';
import { handleDisputeEvent } from './dispute.service';
import { handleSettlementEvent } from './settlement.service';
import logger from '../config/logger';
import { billingBreadcrumb, billingException } from '../utils/sentry-billing';

// =====================================================================
// Razorpay event envelope (the parts we use)
// =====================================================================
export interface RazorpayWebhookPayload {
  /** Razorpay event id — globally unique. Used for dedup. */
  id?: string;
  event: string;
  contains?: string[];
  account_id?: string;
  created_at?: number;
  payload: {
    payment?: { entity: RazorpayPaymentSnapshot };
    order?: { entity: { id: string; status?: string; amount?: number } };
    refund?: { entity: { id: string; payment_id: string; amount: number; status?: string } };
    subscription?: { entity: { id: string; status?: string } };
    invoice?: { entity: { id: string; status?: string } };
    dispute?: { entity: { id: string; payment_id: string; amount?: number; status?: string } };
    settlement?: { entity: { id: string; amount?: number } };
    [key: string]: unknown;
  };
}

// =====================================================================
// Sync ingest — called from the webhook controller
// =====================================================================

export interface IngestArgs {
  rawBody: Buffer;
  signature: string;
  parsed?: RazorpayWebhookPayload; // already parsed by raw-body middleware
}

export interface IngestResult {
  /** Internal id of the persisted event row. */
  id: string;
  /** Razorpay event id (or our fallback). */
  razorpayEventId: string;
  /** Whether HMAC matched. */
  signatureValid: boolean;
  /** True if this event was already seen (dedup). */
  duplicate: boolean;
}

export async function ingestWebhook(args: IngestArgs): Promise<IngestResult> {
  const signatureValid = verifyWebhookSignature({
    rawBody: args.rawBody,
    signature: args.signature,
  });

  // Razorpay webhooks now include `id` at the top level for some events.
  // For older events without an id, derive a deterministic one from the body
  // hash so we still de-duplicate on retries from Razorpay.
  const parsed: RazorpayWebhookPayload =
    args.parsed ?? (JSON.parse(args.rawBody.toString('utf8')) as RazorpayWebhookPayload);

  const payloadHash = crypto.createHash('sha256').update(args.rawBody).digest('hex');
  const razorpayEventId = parsed.id ?? `derived:${payloadHash}`;

  // Try to insert; if duplicate, return existing row.
  try {
    const created = await prisma.razorpayWebhookEvent.create({
      data: {
        razorpayEventId,
        event: parsed.event,
        accountId: parsed.account_id ?? null,
        signatureValid,
        status: signatureValid ? RazorpayWebhookStatus.RECEIVED : RazorpayWebhookStatus.FAILED,
        errorMessage: signatureValid ? null : 'Webhook signature invalid',
        payload: parsed as unknown as Prisma.InputJsonValue,
        payloadHash,
      },
    });
    return {
      id: created.id,
      razorpayEventId,
      signatureValid,
      duplicate: false,
    };
  } catch (err) {
    // Unique violation = already received
    const existing = await prisma.razorpayWebhookEvent.findUnique({
      where: { razorpayEventId },
    });
    if (existing) {
      return {
        id: existing.id,
        razorpayEventId,
        signatureValid: existing.signatureValid,
        duplicate: true,
      };
    }
    throw err;
  }
}

// =====================================================================
// Async dispatch — called from the worker
// =====================================================================

export async function processWebhookEvent(eventRowId: string): Promise<void> {
  const row = await prisma.razorpayWebhookEvent.findUnique({ where: { id: eventRowId } });
  if (!row) {
    logger.warn('processWebhookEvent — row not found', { eventRowId });
    return;
  }
  if (!row.signatureValid) {
    await prisma.razorpayWebhookEvent.update({
      where: { id: row.id },
      data: { status: RazorpayWebhookStatus.SKIPPED, processedAt: new Date() },
    });
    return;
  }
  if (row.status === RazorpayWebhookStatus.PROCESSED) {
    return; // already done
  }

  await prisma.razorpayWebhookEvent.update({
    where: { id: row.id },
    data: { status: RazorpayWebhookStatus.PROCESSING, retryCount: { increment: 1 } },
  });

  try {
    await dispatch(row);
    await prisma.razorpayWebhookEvent.update({
      where: { id: row.id },
      data: {
        status: RazorpayWebhookStatus.PROCESSED,
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Razorpay webhook dispatch failed', {
      eventRowId,
      event: row.event,
      err: message,
    });
    await billingBreadcrumb({
      message: 'webhook.dispatch.failed',
      level: 'error',
      data: { eventRowId, event: row.event, err: message },
    });
    await billingException(err, { eventRowId, event: row.event });
    await prisma.razorpayWebhookEvent.update({
      where: { id: row.id },
      data: { status: RazorpayWebhookStatus.FAILED, errorMessage: message },
    });
    throw err; // bubble to BullMQ for retry
  }
}

async function dispatch(row: RazorpayWebhookEvent): Promise<void> {
  const payload = row.payload as unknown as RazorpayWebhookPayload;
  const event = row.event;

  // Phase 3 wires payment + order events. Subscription / refund / invoice /
  // dispute / settlement events are persisted but their full handlers land
  // in Phase 4-9.
  switch (event) {
    case 'payment.authorized':
    case 'payment.captured':
    case 'payment.failed': {
      const snapshot = payload.payload?.payment?.entity;
      if (!snapshot) throw new Error(`Missing payment entity in ${event}`);
      await recordPayment(snapshot, { source: 'webhook' });
      return;
    }

    case 'order.paid': {
      // Razorpay sometimes sends order.paid in addition to payment.captured.
      // We rely on payment.captured for state transition; this is a no-op.
      logger.debug('order.paid received — handled via payment.captured', {
        razorpayOrderId: payload.payload?.order?.entity?.id,
      });
      return;
    }

    case 'subscription.activated':
    case 'subscription.charged':
    case 'subscription.completed':
    case 'subscription.cancelled':
    case 'subscription.paused':
    case 'subscription.resumed':
    case 'subscription.pending':
    case 'subscription.halted':
    case 'subscription.charged_failed':
      await handleSubscriptionEvent(event, payload);
      return;

    case 'refund.created':
    case 'refund.processed':
    case 'refund.failed':
    case 'refund.speed_changed':
      await handleRefundEvent(event, payload);
      return;

    case 'invoice.paid':
    case 'invoice.expired':
    case 'invoice.partially_paid':
      await handleRazorpayInvoiceEvent(event, payload);
      return;

    case 'transfer.processed':
    case 'transfer.failed':
    case 'transfer.reversed':
      await handleTransferEvent(event, payload);
      return;

    case 'dispute.created':
    case 'dispute.won':
    case 'dispute.lost':
    case 'dispute.closed':
      await handleDisputeEvent(event, payload);
      return;

    case 'payout.processed':
    case 'payout.failed':
    case 'payout.reversed':
    case 'settlement.processed':
      await handleSettlementEvent(event, payload);
      return;

    case 'mandate.cancelled':
    case 'mandate.created':
    case 'mandate.confirmed':
    case 'mandate.failed':
    case 'token.confirmed':
    case 'token.cancelled':
    case 'token.failed':
      await handleMandateEvent(event, payload);
      return;

    default:
      logger.info('Unhandled Razorpay event — persisted only', { event });
      return;
  }
}

// =====================================================================
// Razorpay Invoice events — these are subscription invoice lifecycle
// updates emitted by Razorpay's hosted invoice flow. We persist a
// `SubscriptionEvent` row and bump `lastInvoiceId` on the parent sub.
// We do NOT generate a tax invoice here — that runs from
// `subscription.charged` → invoice.service.issueTaxInvoice().
// =====================================================================
async function handleRazorpayInvoiceEvent(
  event: string,
  payload: RazorpayWebhookPayload
): Promise<void> {
  const entity = payload.payload?.invoice?.entity as
    | { id: string; status?: string; subscription_id?: string; payment_id?: string }
    | undefined;
  if (!entity?.id) {
    logger.warn(`Razorpay ${event} missing invoice entity — skipping`);
    return;
  }
  if (entity.subscription_id) {
    const sub = await prisma.subscription.findFirst({
      where: { razorpaySubscriptionId: entity.subscription_id },
    });
    if (sub) {
      await prisma.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          kind: event,
          happenedAt: new Date(),
          payloadHash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
          raw: payload as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }
  logger.info('Razorpay invoice event persisted', { event, razorpayInvoiceId: entity.id });
}

// =====================================================================
// Transfer events — Razorpay marketplace / split-settlement payouts.
// Hire Adda doesn't use marketplace today, but persist for audit so the
// super-admin webhook viewer shows the full event history if it ever does.
// =====================================================================
async function handleTransferEvent(event: string, payload: RazorpayWebhookPayload): Promise<void> {
  const entity = (payload.payload as Record<string, unknown>).transfer as
    | { entity?: { id?: string; amount?: number; status?: string } }
    | undefined;
  logger.info('Razorpay transfer event received (no-op)', {
    event,
    transferId: entity?.entity?.id,
    amount: entity?.entity?.amount,
    status: entity?.entity?.status,
  });
}

// =====================================================================
// Replay — super-admin action to re-trigger processing of a stored event
// =====================================================================

export async function replayWebhookEvent(args: {
  eventRowId: string;
  triggeredById: string;
}): Promise<void> {
  const row = await prisma.razorpayWebhookEvent.findUnique({ where: { id: args.eventRowId } });
  if (!row) throw new Error(`Webhook event ${args.eventRowId} not found`);
  await prisma.razorpayWebhookEvent.update({
    where: { id: row.id },
    data: {
      status: RazorpayWebhookStatus.REPLAYED,
      replayCount: { increment: 1 },
      lastReplayedAt: new Date(),
      lastReplayedById: args.triggeredById,
    },
  });
  await processWebhookEvent(row.id);
}
