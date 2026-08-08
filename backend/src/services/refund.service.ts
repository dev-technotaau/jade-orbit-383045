/**
 * Refund engine.
 *
 *   - `initiateRefund({...})` — calls Razorpay refund API + persists Refund row
 *     (status = PENDING). Webhook `refund.processed` flips it to PROCESSED.
 *   - Webhook handlers: refund.created / processed / failed / speed_changed
 *   - On PROCESSED: release entitlement resources, reverse coupon redemption,
 *     update Order status (REFUNDED / PARTIALLY_REFUNDED), update Invoice
 *     refundedPaise, write BillingLedger entry, send notifications.
 *
 * Refund window: enforced via `env.BILLING_REFUND_WINDOW_DAYS` (= 2 days
 * per the user's decision).
 */
import { prisma } from '../config/prisma';
import type { Prisma } from '@prisma/client';
import {
  RefundStatus,
  RefundReason,
  OrderStatus,
  PaymentStatus,
  InvoiceStatus,
  LedgerEntryType,
  type Refund,
  type Payment,
} from '@prisma/client';
import { getRazorpayClient, withRazorpaySpan } from '../config/razorpay';
import { releaseResource } from './entitlement.service';
import { reverseRedemption } from './coupon.service';
import { env } from '../config/env';
import { AppError, NotFoundError, BadRequestError } from '../exceptions';
import { billingRefundsTotal } from '../routes/metrics.routes';
import logger from '../config/logger';
import type { RazorpayWebhookPayload } from './razorpay-webhook.service';
import { billingBreadcrumb } from '../utils/sentry-billing';

// =====================================================================
// Initiate
// =====================================================================

export interface InitiateRefundArgs {
  /** Either paymentId (internal Payment.id) OR razorpayPaymentId. */
  paymentId?: string;
  razorpayPaymentId?: string;
  /** Amount in paise. Omit for full refund. */
  amountPaise?: number;
  reason: RefundReason;
  notes?: string;
  /** Razorpay refund speed: 'normal' (3-5 days, free) or 'optimum' (instant, fee). */
  speed?: 'normal' | 'optimum';
  initiatedBy?: string;
  /** Bypass refund window check (super-admin only). */
  bypassWindow?: boolean;
}

export interface InitiateRefundResult {
  refund: Refund;
  razorpayRefundId: string;
}

export async function initiateRefund(args: InitiateRefundArgs): Promise<InitiateRefundResult> {
  const payment = await findPayment(args);
  if (!payment) throw new NotFoundError('Payment not found');
  if (payment.status !== PaymentStatus.CAPTURED) {
    throw new BadRequestError(
      `Payment is ${payment.status} — only CAPTURED payments can be refunded`
    );
  }

  // Refund window guard (skip for super-admin via bypassWindow)
  if (!args.bypassWindow && payment.capturedAt) {
    const ageMs = Date.now() - payment.capturedAt.getTime();
    const windowMs = env.BILLING_REFUND_WINDOW_DAYS * 86_400_000;
    if (ageMs > windowMs) {
      throw new BadRequestError(
        `Refund window of ${env.BILLING_REFUND_WINDOW_DAYS} days has passed. Contact support for goodwill refunds.`
      );
    }
  }

  // Check existing refunds total
  const existingRefunds = await prisma.refund.findMany({
    where: {
      paymentId: payment.id,
      status: { in: [RefundStatus.PENDING, RefundStatus.PROCESSED] },
    },
  });
  const alreadyRefunded = existingRefunds.reduce((sum, r) => sum + r.amountPaise, 0);
  const refundable = payment.amountPaise - alreadyRefunded;
  if (refundable <= 0) {
    throw new BadRequestError('Payment is fully refunded');
  }

  const requestAmount = args.amountPaise ?? refundable;
  if (requestAmount > refundable) {
    throw new BadRequestError(
      `Refund amount ₹${requestAmount / 100} exceeds refundable balance ₹${refundable / 100}`
    );
  }

  const client = getRazorpayClient();
  if (!client) {
    throw new AppError('Razorpay not configured', 503, 'RAZORPAY_NOT_CONFIGURED');
  }

  const razorpayRefund = (await withRazorpaySpan(
    'payments.refund',
    async () =>
      client.payments.refund(payment.razorpayPaymentId, {
        amount: requestAmount,
        speed: args.speed ?? 'normal',
        notes: {
          reason: args.reason,
          ...(args.notes ? { reasonText: args.notes } : {}),
          ...(args.initiatedBy ? { initiatedBy: args.initiatedBy } : {}),
        },
      }),
    {
      paymentId: payment.razorpayPaymentId,
      amount: requestAmount,
      reason: args.reason,
    }
  )) as { id: string; status?: string; speed_processed?: string };

  if (!razorpayRefund?.id) {
    throw new AppError('Razorpay refund returned no id', 502, 'RAZORPAY_BAD_RESPONSE');
  }

  // Persist Refund row + ledger entry in transaction
  const refund = await prisma.$transaction(async (tx) => {
    const created = await tx.refund.create({
      data: {
        paymentId: payment.id,
        orderId: payment.orderId,
        razorpayRefundId: razorpayRefund.id,
        amountPaise: requestAmount,
        reason: args.reason,
        notes: args.notes ?? null,
        status: RefundStatus.PENDING,
        initiatedById: args.initiatedBy ?? null,
        raw: razorpayRefund as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.order.updateMany({
      where: { id: payment.orderId, status: OrderStatus.PAID },
      data: { status: OrderStatus.REFUND_PENDING },
    });
    return created;
  });

  logger.info('Refund initiated', {
    refundId: refund.id,
    razorpayRefundId: razorpayRefund.id,
    paymentId: payment.id,
    amountPaise: requestAmount,
    reason: args.reason,
  });

  // Phase 14: Prometheus
  billingRefundsTotal.inc({ reason: args.reason, status: 'initiated' });

  // Audit log
  void (async () => {
    const { AuditService } = await import('./audit.service');
    await AuditService.log({
      action: 'BILLING_REFUND_INITIATED',
      entity: 'Refund',
      entityId: refund.id,
      performedBy: args.initiatedBy ?? 'system',
      details: {
        paymentId: payment.id,
        amountPaise: requestAmount,
        reason: args.reason,
        razorpayRefundId: razorpayRefund.id,
      },
    });
  })();

  return { refund, razorpayRefundId: razorpayRefund.id };
}

async function findPayment(args: InitiateRefundArgs): Promise<Payment | null> {
  if (args.paymentId) {
    return prisma.payment.findUnique({ where: { id: args.paymentId } });
  }
  if (args.razorpayPaymentId) {
    return prisma.payment.findUnique({ where: { razorpayPaymentId: args.razorpayPaymentId } });
  }
  throw new BadRequestError('paymentId or razorpayPaymentId required');
}

// =====================================================================
// Webhook handler — refund.created / processed / failed / speed_changed
// =====================================================================

interface RazorpayRefundEntity {
  id: string;
  payment_id: string;
  amount: number;
  status?: 'pending' | 'processed' | 'failed';
  speed_processed?: string;
  speed_requested?: string;
  acquirer_data?: { rrn?: string };
  notes?: Record<string, string | number> | null;
  created_at?: number;
}

const RP_STATUS_MAP: Record<string, RefundStatus> = {
  created: RefundStatus.PENDING,
  pending: RefundStatus.PENDING,
  processed: RefundStatus.PROCESSED,
  failed: RefundStatus.FAILED,
};

export async function handleRefundEvent(
  event: string,
  payload: RazorpayWebhookPayload
): Promise<void> {
  const entity = payload.payload?.refund?.entity as RazorpayRefundEntity | undefined;
  if (!entity?.id) {
    logger.warn(`Refund event ${event} missing entity`);
    return;
  }

  // Find or create the local Refund row (handles refunds initiated from
  // Razorpay dashboard — not via our service).
  let refund = await prisma.refund.findUnique({ where: { razorpayRefundId: entity.id } });
  if (!refund) {
    const payment = await prisma.payment.findUnique({
      where: { razorpayPaymentId: entity.payment_id },
    });
    if (!payment) {
      logger.warn(`Refund webhook for unknown payment — ignoring`, {
        razorpayPaymentId: entity.payment_id,
      });
      return;
    }
    refund = await prisma.refund.create({
      data: {
        paymentId: payment.id,
        orderId: payment.orderId,
        razorpayRefundId: entity.id,
        amountPaise: entity.amount,
        reason: RefundReason.ADMIN_INITIATED,
        status: RefundStatus.PENDING,
        raw: entity as unknown as Prisma.InputJsonValue,
      },
    });
    logger.info('Refund row created from webhook (dashboard-initiated)', {
      refundId: refund.id,
    });
  }

  const newStatus = RP_STATUS_MAP[entity.status ?? ''] ?? refund.status;

  // Update raw + status
  await prisma.refund.update({
    where: { id: refund.id },
    data: {
      status: newStatus,
      processedAt: newStatus === RefundStatus.PROCESSED ? new Date() : refund.processedAt,
      raw: payload as unknown as Prisma.InputJsonValue,
    },
  });

  await billingBreadcrumb({
    message: `refund.${event}`,
    level: newStatus === RefundStatus.FAILED ? 'warning' : 'info',
    data: {
      refundId: refund.id,
      from: refund.status,
      to: newStatus,
      amountPaise: refund.amountPaise,
    },
  });

  if (newStatus === RefundStatus.PROCESSED && refund.status !== RefundStatus.PROCESSED) {
    await onRefundProcessed(refund.id);
    billingRefundsTotal.inc({ reason: refund.reason, status: 'processed' });
  }
  if (newStatus === RefundStatus.FAILED && refund.status !== RefundStatus.FAILED) {
    await onRefundFailed(refund.id);
    billingRefundsTotal.inc({ reason: refund.reason, status: 'failed' });
  }

  logger.info('Refund event processed', {
    event,
    refundId: refund.id,
    status: newStatus,
  });
}

async function onRefundProcessed(refundId: string): Promise<void> {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { payment: true, order: { include: { plan: true } } },
  });
  if (!refund) return;

  const order = refund.order;
  const totalRefundsForOrder = await prisma.refund.aggregate({
    where: {
      orderId: order.id,
      status: RefundStatus.PROCESSED,
    },
    _sum: { amountPaise: true },
  });
  const refundedTotal = totalRefundsForOrder._sum.amountPaise ?? 0;
  const fullyRefunded = refundedTotal >= order.totalPaise;

  await prisma.$transaction(async (tx) => {
    // Update Order status
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: fullyRefunded ? OrderStatus.REFUNDED : OrderStatus.PARTIALLY_REFUNDED,
        refundedAt: new Date(),
      },
    });

    // Update Payment status
    await tx.payment.update({
      where: { id: refund.paymentId },
      data: {
        status: fullyRefunded ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
      },
    });

    // Update Invoice refundedPaise (if invoice exists for this order)
    const invoice = await tx.invoice.findFirst({
      where: { orderId: order.id, type: 'TAX_INVOICE' },
    });
    if (invoice) {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          refundedPaise: refundedTotal,
          status: fullyRefunded ? InvoiceStatus.REFUNDED : invoice.status,
        },
      });
    }

    // BillingLedger entry — credit user account
    await tx.billingLedger.create({
      data: {
        userId: order.userId,
        type: LedgerEntryType.REFUND,
        amountPaise: -refund.amountPaise,
        currency: order.currency,
        refType: 'REFUND',
        refId: refund.id,
        orderId: order.id,
        narration: `Refund processed for order ${order.receiptNumber}`,
      },
    });
  });

  // Reverse coupon redemption (if any) — fire and forget, fail-safe
  if (order.couponId) {
    void reverseRedemption(order.id).catch((err) =>
      logger.warn('Coupon reversal on refund failed', { err })
    );
  }

  // Entitlement clawback. Full refund → cancel the whole entitlement.
  // Partial refund → claw back the refunded fraction of the purchased
  // credits (cumulative-target math in the entitlement service, so
  // repeated webhook deliveries and successive partial refunds converge
  // instead of double-clawing).
  if (!fullyRefunded) {
    const { clawbackResourcesForRefund } = await import('./entitlement.service');
    await clawbackResourcesForRefund({
      orderId: order.id,
      refundedTotalPaise: refundedTotal,
      orderTotalPaise: order.totalPaise,
      refundId: refund.id,
      receiptNumber: order.receiptNumber,
    }).catch((err) =>
      logger.warn('Partial refund clawback failed', {
        refundId: refund.id,
        orderId: order.id,
        err: err instanceof Error ? err.message : err,
      })
    );
  }

  if (fullyRefunded) {
    const ent = await prisma.entitlement.findFirst({
      where: { sourceOrderId: order.id },
      include: { resources: true },
    });
    if (ent) {
      // Mark entitlement cancelled — released resources stop being available.
      await prisma.entitlement.update({
        where: { id: ent.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      for (const r of ent.resources) {
        const consumed = r.consumed;
        if (consumed > 0) {
          // Restore in the ledger so the audit trail stays intact (full units
          // returned to the void via REFUND_RESTORE entry).
          await releaseResource({
            userId: order.userId,
            unit: r.unit,
            amount: consumed,
            refType: 'REFUND',
            refId: refund.id,
            notes: `Refund of order ${order.receiptNumber}`,
          }).catch((err) =>
            logger.warn('Refund release on consumed quota failed', {
              err,
              entitlementResourceId: r.id,
            })
          );
        }
      }
    }
  }

  // Notify user
  void notifyUserOfRefund(order.userId, refund.id).catch((err) =>
    logger.warn('Refund notification failed', { err })
  );

  // Kafka fan-out for the order-refunded transition (downstream services).
  void (async () => {
    const { publishEvent } = await import('../kafka/producer');
    const { KafkaTopics } = await import('../kafka/topics');
    await publishEvent(KafkaTopics.BILLING_ORDER_REFUNDED, order.id, {
      orderId: order.id,
      userId: order.userId,
      refundId: refund.id,
      amountPaise: refund.amountPaise,
      currency: order.currency,
      fullyRefunded,
    }).catch(() => {});
  })();
}

async function onRefundFailed(refundId: string): Promise<void> {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { order: true },
  });
  if (!refund) return;
  // Roll order status back to PAID — refund didn't go through
  await prisma.order.updateMany({
    where: { id: refund.orderId, status: OrderStatus.REFUND_PENDING },
    data: { status: OrderStatus.PAID },
  });
  logger.warn('Refund failed — order status rolled back to PAID', {
    refundId,
    orderId: refund.orderId,
  });
}

async function notifyUserOfRefund(userId: string, refundId: string): Promise<void> {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { order: { include: { plan: true } } },
  });
  if (!refund) return;
  const { sendBillingNotification, formatINR } = await import('./billing-notification.service');
  await sendBillingNotification({
    userId,
    kind: 'REFUND_PROCESSED',
    refType: 'REFUND',
    refId: refund.id,
    title: 'Refund processed',
    message: `Your refund of ${formatINR(refund.amountPaise)} for ${refund.order.plan.name} has been processed. It should reflect in 3-5 business days.`,
    link: `/billing/orders/${refund.orderId}`,
    metadata: {
      orderId: refund.orderId,
      planCode: refund.order.plan.code,
      amountPaise: refund.amountPaise,
    },
  });
}

// =====================================================================
// Read APIs
// =====================================================================

export async function listRefundsForOrder(orderId: string, userId: string): Promise<Refund[]> {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) throw new NotFoundError('Order not found');
  return prisma.refund.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listRefundsAdmin(args: {
  status?: RefundStatus;
  page?: number;
  limit?: number;
}): Promise<{ items: Refund[]; total: number }> {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));
  const where: Prisma.RefundWhereInput = {};
  if (args.status) where.status = args.status;
  const [items, total] = await prisma.$transaction([
    prisma.refund.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
      include: {
        payment: { select: { razorpayPaymentId: true, method: true } },
        order: { select: { receiptNumber: true, totalPaise: true, userId: true } },
      },
    }),
    prisma.refund.count({ where }),
  ]);
  return { items, total };
}

export { AppError };
