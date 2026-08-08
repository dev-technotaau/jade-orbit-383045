/**
 * Payment service — owns the `Payment` row lifecycle.
 *
 * Triggered from two places:
 *   1. Razorpay webhook (`payment.captured`, `payment.authorized`,
 *      `payment.failed`) — the source of truth.
 *   2. Frontend `/verify` callback — fast path for instant UX.
 *
 * Both call `recordPayment(...)` which is idempotent on `razorpayPaymentId`.
 */
import { prisma } from '../config/prisma';
import {
  PaymentStatus,
  PaymentMethod,
  OrderStatus,
  type Payment,
  type Prisma,
} from '@prisma/client';
import { cardFingerprint } from '../config/razorpay';
import { issueInvoiceForOrder } from './invoice.service';
import { grantEntitlementForOrder } from './entitlement.service';
import {
  billingPaymentsTotal,
  billingRevenuePaiseTotal,
  billingPaymentDurationSeconds,
} from '../routes/metrics.routes';
import logger from '../config/logger';

// =====================================================================
// Razorpay payment shape (subset we actually use). Razorpay's TS types
// from the SDK are loose, so we re-declare what we read.
// =====================================================================
export interface RazorpayPaymentSnapshot {
  id: string;
  order_id: string;
  status: string; // 'created' | 'authorized' | 'captured' | 'refunded' | 'failed'
  method?: string; // 'card' | 'netbanking' | 'wallet' | 'upi' | 'emi' | 'paylater' | 'bank_transfer'
  amount: number; // paise
  fee?: number;
  tax?: number;
  amount_refunded?: number;
  currency: string;
  email?: string | null;
  contact?: string | null;
  vpa?: string | null;
  bank?: string | null;
  wallet?: string | null;
  card?: {
    last4?: string;
    network?: string;
    issuer?: string;
    type?: string;
    international?: boolean;
  } | null;
  emi_plan?: { duration?: number } | null;
  international?: boolean;
  notes?: Record<string, string | number | boolean> | null;
  error_code?: string | null;
  error_description?: string | null;
  error_source?: string | null;
  error_step?: string | null;
  error_reason?: string | null;
  created_at?: number; // unix seconds
  captured?: boolean;
  invoice_id?: string | null;
}

export function mapRazorpayMethod(method?: string): PaymentMethod {
  switch ((method ?? '').toLowerCase()) {
    case 'card':
      return PaymentMethod.CARD;
    case 'upi':
      return PaymentMethod.UPI;
    case 'netbanking':
      return PaymentMethod.NETBANKING;
    case 'wallet':
      return PaymentMethod.WALLET;
    case 'emi':
      return PaymentMethod.EMI;
    case 'paylater':
      return PaymentMethod.PAYLATER;
    case 'bank_transfer':
      return PaymentMethod.BANK_TRANSFER;
    default:
      return PaymentMethod.UNKNOWN;
  }
}

export function mapRazorpayStatus(status?: string): PaymentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'authorized':
      return PaymentStatus.AUTHORIZED;
    case 'captured':
      return PaymentStatus.CAPTURED;
    case 'refunded':
      return PaymentStatus.REFUNDED;
    case 'failed':
      return PaymentStatus.FAILED;
    default:
      return PaymentStatus.CREATED;
  }
}

// =====================================================================
// Upsert payment row from a Razorpay payment snapshot. Idempotent.
// =====================================================================
export async function recordPayment(
  snapshot: RazorpayPaymentSnapshot,
  context: {
    /** Internal `Order.id` — looked up from `razorpayOrderId` if not provided. */
    orderId?: string;
    /** Override user id (else inferred from order). */
    userId?: string;
    /** Tag the source so we can debug ordering issues. */
    source: 'webhook' | 'verify';
  }
): Promise<Payment> {
  // Resolve internal order if not given
  let orderId = context.orderId;
  let userId = context.userId;
  if (!orderId) {
    const order = await prisma.order.findUnique({
      where: { razorpayOrderId: snapshot.order_id },
      select: { id: true, userId: true, totalPaise: true, currency: true, status: true },
    });
    if (!order) {
      logger.warn('recordPayment — no internal order matches Razorpay order_id', {
        razorpayOrderId: snapshot.order_id,
      });
      throw new Error(`No internal Order for razorpayOrderId=${snapshot.order_id}`);
    }
    orderId = order.id;
    userId = userId ?? order.userId;
  } else if (!userId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });
    userId = order?.userId;
  }
  if (!userId) throw new Error('recordPayment requires userId');

  const fingerprint = snapshot.card
    ? cardFingerprint({
        last4: snapshot.card.last4,
        network: snapshot.card.network,
        issuer: snapshot.card.issuer,
        type: snapshot.card.type,
      })
    : null;

  const status = mapRazorpayStatus(snapshot.status);
  const method = mapRazorpayMethod(snapshot.method);

  const baseData: Prisma.PaymentCreateInput = {
    razorpayPaymentId: snapshot.id,
    status,
    method,
    amountPaise: snapshot.amount,
    feePaise: snapshot.fee ?? 0,
    taxPaise: snapshot.tax ?? 0,
    capturedPaise: snapshot.captured ? snapshot.amount : 0,
    capturedAt: snapshot.captured ? new Date() : null,
    authorizedAt: status === PaymentStatus.AUTHORIZED ? new Date() : null,
    errorCode: snapshot.error_code ?? null,
    errorDescription: snapshot.error_description ?? null,
    errorSource: snapshot.error_source ?? null,
    errorStep: snapshot.error_step ?? null,
    errorReason: snapshot.error_reason ?? null,
    vpa: snapshot.vpa ?? null,
    bank: snapshot.bank ?? null,
    wallet: snapshot.wallet ?? null,
    cardLast4: snapshot.card?.last4 ?? null,
    cardNetwork: snapshot.card?.network ?? null,
    cardIssuer: snapshot.card?.issuer ?? null,
    cardType: snapshot.card?.type ?? null,
    cardInternational: snapshot.card?.international ?? false,
    cardFingerprint: fingerprint,
    emiTenure: snapshot.emi_plan?.duration ?? null,
    international: snapshot.international ?? false,
    currency: snapshot.currency,
    raw: snapshot as unknown as Prisma.InputJsonValue,
    user: { connect: { id: userId } },
    order: { connect: { id: orderId } },
  };

  // Phase 14: Prometheus + Sentry breadcrumb on every state transition
  billingPaymentsTotal.inc({ status, method });
  try {
    const Sentry = await import('@sentry/node');
    Sentry.addBreadcrumb({
      category: 'billing',
      level: status === PaymentStatus.FAILED ? 'warning' : 'info',
      message: `payment.${status.toLowerCase()}`,
      data: {
        razorpayPaymentId: snapshot.id,
        method,
        amountPaise: snapshot.amount,
        source: context.source,
      },
    });
  } catch {
    /* Sentry optional in dev */
  }

  // upsert by unique razorpayPaymentId
  const payment = await prisma.payment.upsert({
    where: { razorpayPaymentId: snapshot.id },
    create: baseData,
    update: {
      status,
      method,
      capturedPaise: snapshot.captured ? snapshot.amount : undefined,
      capturedAt: snapshot.captured ? new Date() : undefined,
      authorizedAt: status === PaymentStatus.AUTHORIZED ? new Date() : undefined,
      feePaise: snapshot.fee ?? undefined,
      taxPaise: snapshot.tax ?? undefined,
      errorCode: snapshot.error_code ?? undefined,
      errorDescription: snapshot.error_description ?? undefined,
      errorSource: snapshot.error_source ?? undefined,
      errorStep: snapshot.error_step ?? undefined,
      errorReason: snapshot.error_reason ?? undefined,
      vpa: snapshot.vpa ?? undefined,
      bank: snapshot.bank ?? undefined,
      wallet: snapshot.wallet ?? undefined,
      cardLast4: snapshot.card?.last4 ?? undefined,
      cardNetwork: snapshot.card?.network ?? undefined,
      cardIssuer: snapshot.card?.issuer ?? undefined,
      cardType: snapshot.card?.type ?? undefined,
      cardInternational: snapshot.card?.international ?? undefined,
      cardFingerprint: fingerprint ?? undefined,
      international: snapshot.international ?? undefined,
      raw: snapshot as unknown as Prisma.InputJsonValue,
    },
  });

  // Reflect into Order.status when this payment is the captured one.
  if (status === PaymentStatus.CAPTURED) {
    const result = await prisma.order.updateMany({
      where: {
        id: orderId,
        status: { in: [OrderStatus.CREATED, OrderStatus.ATTEMPTED] },
      },
      data: {
        status: OrderStatus.PAID,
        paidAt: new Date(),
      },
    });
    // Issue the GST tax invoice + grant entitlement asynchronously when the
    // order transitions to PAID. Both are idempotent so re-runs are safe.
    if (result.count > 0) {
      // Kafka fan-out for the order-paid transition (downstream services).
      void (async () => {
        const { publishEvent } = await import('../kafka/producer');
        const { KafkaTopics } = await import('../kafka/topics');
        await publishEvent(KafkaTopics.BILLING_ORDER_PAID, orderId, {
          orderId,
          userId,
          paymentId: payment.id,
          amountPaise: snapshot.amount,
          currency: snapshot.currency,
          method,
        }).catch(() => {});
      })();
      void issueInvoiceForOrder(orderId).catch((err) =>
        logger.error('Auto-issue invoice on payment.captured failed', {
          orderId,
          err: err instanceof Error ? err.message : err,
        })
      );
      void grantEntitlementForOrder(orderId).catch((err) =>
        logger.error('Auto-grant entitlement on payment.captured failed', {
          orderId,
          err: err instanceof Error ? err.message : err,
        })
      );
      // Multi-channel success notification (deduped + Kafka emit)
      void notifyPaymentCaptured(orderId).catch((err) =>
        logger.warn('Payment-captured notification failed', { err })
      );
      // Auto-create AssistedHiringRequest when an ASSIST_HIRING order
      // goes PAID. Idempotent — safe to call from both webhook + verify
      // paths (the unique index on orderId stops duplicates).
      void (async () => {
        const { createRequestFromOrder } = await import('./assisted-hiring.service');
        await createRequestFromOrder(orderId);
      })().catch((err) =>
        logger.warn('AssistedHiringRequest auto-create failed', {
          err: err instanceof Error ? err.message : err,
        })
      );
      // Audit log
      void (async () => {
        const { AuditService } = await import('./audit.service');
        await AuditService.log({
          action: 'BILLING_PAYMENT_CAPTURED',
          entity: 'Payment',
          entityId: payment.id,
          performedBy: userId ?? 'system',
          details: {
            orderId,
            amountPaise: snapshot.amount,
            method,
            razorpayPaymentId: snapshot.id,
          },
        });
      })();
      // Async fraud scan — never blocks payment recording
      void enqueueFraudScan(payment.id).catch((err) =>
        logger.warn('Fraud scan enqueue failed', { err })
      );
      // Phase 14: revenue counter (per plan code) + payment-duration histogram
      void (async () => {
        try {
          const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { createdAt: true, plan: { select: { code: true } } },
          });
          if (order) {
            billingRevenuePaiseTotal.inc(
              { plan: order.plan?.code ?? 'unknown', currency: snapshot.currency },
              snapshot.amount
            );
            if (order.createdAt) {
              const seconds = (Date.now() - order.createdAt.getTime()) / 1000;
              billingPaymentDurationSeconds.observe({ method }, seconds);
            }
          }
        } catch {
          /* metric best-effort */
        }
      })();
    }
  } else if (status === PaymentStatus.FAILED) {
    await prisma.order.updateMany({
      where: { id: orderId, status: OrderStatus.CREATED },
      data: { status: OrderStatus.ATTEMPTED },
    });
    void notifyPaymentFailed(orderId, payment.errorDescription).catch((err) =>
      logger.warn('Payment-failed notification failed', { err })
    );
  }

  return payment;
}

async function enqueueFraudScan(paymentId: string): Promise<void> {
  const { fraudScanQueue } = await import('../jobs/fraud-scan.queue');
  const { safeJobId } = await import('../jobs/job-id');
  await fraudScanQueue.add('fraud-scan', { paymentId }, { jobId: safeJobId('fraud', paymentId) });
}

async function notifyPaymentCaptured(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { plan: { select: { name: true, code: true } } },
  });
  if (!order) return;
  const { sendBillingNotification, formatINR } = await import('./billing-notification.service');

  // Upgrade orders carry `upgradeFromOrderId` — send UPGRADED instead of the
  // generic PAYMENT_CAPTURED so the user gets context-aware copy.
  if (order.upgradeFromOrderId) {
    const fromOrder = await prisma.order.findUnique({
      where: { id: order.upgradeFromOrderId },
      include: { plan: { select: { name: true } } },
    });
    await sendBillingNotification({
      userId: order.userId,
      kind: 'UPGRADED',
      refType: 'ORDER',
      refId: order.id,
      title: `Upgraded to ${order.plan.name}`,
      message: `You've upgraded${fromOrder ? ` from ${fromOrder.plan.name}` : ''} to ${order.plan.name}.`,
      link: `/billing/subscriptions`,
      metadata: {
        planCode: order.plan.code,
        planName: order.plan.name,
        fromPlanName: fromOrder?.plan.name ?? null,
        totalPaise: order.totalPaise,
        prorationCreditPaise: order.prorationPaise,
        receiptNumber: order.receiptNumber,
      },
    });
    return;
  }

  await sendBillingNotification({
    userId: order.userId,
    kind: 'PAYMENT_CAPTURED',
    refType: 'ORDER',
    refId: order.id,
    title: 'Payment successful',
    message: `Your payment of ${formatINR(order.totalPaise)} for ${order.plan.name} succeeded. Plan is now active.`,
    link: `/billing/orders/${order.id}`,
    metadata: {
      planCode: order.plan.code,
      planName: order.plan.name,
      receiptNumber: order.receiptNumber,
      totalPaise: order.totalPaise,
    },
  });
}

async function notifyPaymentFailed(
  orderId: string,
  errorDescription: string | null
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { plan: { select: { name: true, code: true } } },
  });
  if (!order) return;
  const { sendBillingNotification, formatINR } = await import('./billing-notification.service');
  await sendBillingNotification({
    userId: order.userId,
    kind: 'PAYMENT_FAILED',
    refType: 'ORDER',
    refId: order.id,
    title: 'Payment failed',
    message: `Payment of ${formatINR(order.totalPaise)} for ${order.plan.name} could not be completed. ${
      errorDescription ?? 'Please retry from your orders page.'
    }`,
    link: `/billing/orders/${order.id}`,
    metadata: {
      planCode: order.plan.code,
      errorDescription: errorDescription ?? null,
    },
  });
}
