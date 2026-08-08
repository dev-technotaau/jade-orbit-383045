/**
 * Super-admin god-mode billing actions.
 *
 *   - Manual mark-paid (e.g. cash payments outside Razorpay)
 *   - Force-cancel any order
 *   - Retry-capture a payment
 *   - Manual fraud flag
 *   - Per-user billing summary (entitlements + recent orders + open
 *     subscriptions + outstanding refunds)
 *
 * All actions write to AuditLog via the route's `audit()` middleware.
 */
import { prisma } from '../config/prisma';
import type { Prisma } from '@prisma/client';
import {
  OrderStatus,
  PaymentStatus,
  PaymentChannel,
  PaymentMethod,
  FraudSignal,
  FraudSeverity,
  FraudAction,
  type Order,
} from '@prisma/client';
import { AppError, NotFoundError, BadRequestError } from '../exceptions';
import { issueInvoiceForOrder } from './invoice.service';
import { grantEntitlementForOrder } from './entitlement.service';
import logger from '../config/logger';

// =====================================================================
// Mark order as paid (manual / external payment)
// =====================================================================

export interface MarkPaidArgs {
  orderId: string;
  notes: string;
  /** External payment reference (cash receipt #, bank txn id, etc.). */
  externalReference?: string;
  adminId: string;
}

export async function markOrderAsPaid(args: MarkPaidArgs): Promise<Order> {
  const order = await prisma.order.findUnique({ where: { id: args.orderId } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.status === OrderStatus.PAID) {
    throw new BadRequestError('Order is already PAID');
  }
  if (order.status === OrderStatus.REFUNDED) {
    throw new BadRequestError('Cannot mark a refunded order as paid');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.PAID,
        paidAt: new Date(),
        channel: PaymentChannel.MANUAL_MARK_PAID,
      },
    });

    // Synthetic Payment row so the rest of the system sees it like any other.
    await tx.payment.create({
      data: {
        orderId: order.id,
        userId: order.userId,
        razorpayPaymentId: `manual_${order.id.slice(0, 16)}_${Date.now()}`,
        status: PaymentStatus.CAPTURED,
        method: PaymentMethod.UNKNOWN,
        amountPaise: order.totalPaise,
        capturedPaise: order.totalPaise,
        capturedAt: new Date(),
        currency: order.currency,
        raw: {
          source: 'manual_mark_paid',
          adminId: args.adminId,
          notes: args.notes,
          externalReference: args.externalReference,
        } as Prisma.InputJsonValue,
      },
    });

    await tx.billingLedger.create({
      data: {
        userId: order.userId,
        type: 'ORDER_CHARGE',
        amountPaise: order.totalPaise,
        currency: order.currency,
        refType: 'ORDER',
        refId: order.id,
        orderId: order.id,
        narration: `Manual mark-paid by admin: ${args.notes}`,
        metadata: {
          adminId: args.adminId,
          externalReference: args.externalReference,
        } as Prisma.InputJsonValue,
      },
    });

    return next;
  });

  // Issue invoice + grant entitlement
  void issueInvoiceForOrder(order.id).catch((err) =>
    logger.error('Auto-issue invoice on mark-paid failed', { err })
  );
  void grantEntitlementForOrder(order.id).catch((err) =>
    logger.error('Auto-grant entitlement on mark-paid failed', { err })
  );

  logger.info('Order manually marked as paid', {
    orderId: order.id,
    adminId: args.adminId,
  });
  void (async () => {
    const { AuditService } = await import('./audit.service');
    await AuditService.log({
      action: 'BILLING_MARK_PAID_MANUAL',
      entity: 'Order',
      entityId: order.id,
      performedBy: args.adminId,
      details: {
        amountPaise: order.totalPaise,
        notes: args.notes,
        externalReference: args.externalReference,
      },
    });
  })();
  return updated;
}

// =====================================================================
// Force-cancel order
// =====================================================================

export async function forceCancelOrder(args: {
  orderId: string;
  reason: string;
  adminId: string;
}): Promise<Order> {
  const order = await prisma.order.findUnique({ where: { id: args.orderId } });
  if (!order) throw new NotFoundError('Order not found');
  if (
    order.status === OrderStatus.REFUNDED ||
    order.status === OrderStatus.PARTIALLY_REFUNDED ||
    order.status === OrderStatus.CANCELLED
  ) {
    throw new BadRequestError(`Cannot force-cancel ${order.status} order`);
  }
  if (order.status === OrderStatus.PAID) {
    throw new BadRequestError(
      'Order is PAID — initiate a refund first instead of force-cancelling'
    );
  }
  return prisma.order.update({
    where: { id: order.id },
    data: {
      status: OrderStatus.CANCELLED,
      notes: {
        ...(order.notes as Record<string, unknown> | null),
        cancelledByAdmin: args.adminId,
        cancelReason: args.reason,
        cancelledAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
}

// =====================================================================
// Retry capture (for AUTHORIZED payments that didn't auto-capture)
// =====================================================================

export async function retryPaymentCapture(args: {
  paymentId: string;
  adminId: string;
}): Promise<{ status: PaymentStatus }> {
  const payment = await prisma.payment.findUnique({ where: { id: args.paymentId } });
  if (!payment) throw new NotFoundError('Payment not found');
  if (payment.status !== PaymentStatus.AUTHORIZED) {
    throw new BadRequestError(
      `Payment is ${payment.status} — only AUTHORIZED can be retry-captured`
    );
  }
  const { getRazorpayClient, withRazorpaySpan } = await import('../config/razorpay');
  const client = getRazorpayClient();
  if (!client) {
    throw new AppError('Razorpay not configured', 503, 'RAZORPAY_NOT_CONFIGURED');
  }
  const captured = (await withRazorpaySpan(
    'payments.capture',
    async () =>
      client.payments.capture(payment.razorpayPaymentId, payment.amountPaise, payment.currency),
    { paymentId: payment.razorpayPaymentId, adminId: args.adminId }
  )) as { status?: string };

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: PaymentStatus.CAPTURED,
      capturedAt: new Date(),
      capturedPaise: payment.amountPaise,
      raw: captured as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.order.updateMany({
    where: { id: payment.orderId, status: { in: [OrderStatus.CREATED, OrderStatus.ATTEMPTED] } },
    data: { status: OrderStatus.PAID, paidAt: new Date() },
  });
  return { status: PaymentStatus.CAPTURED };
}

// =====================================================================
// Fraud flag (manual)
// =====================================================================

export async function flagUserAsFraud(args: {
  userId: string;
  orderId?: string;
  paymentId?: string;
  reason: string;
  severity?: FraudSeverity;
  action?: FraudAction;
  adminId: string;
}): Promise<{ flagId: string }> {
  const flag = await prisma.fraudSignalEvent.create({
    data: {
      userId: args.userId,
      orderId: args.orderId ?? null,
      paymentId: args.paymentId ?? null,
      signal: FraudSignal.MANUAL,
      severity: args.severity ?? FraudSeverity.HIGH,
      action: args.action ?? FraudAction.REVIEW,
      evidence: { reason: args.reason } as Prisma.InputJsonValue,
      reviewedById: args.adminId,
      reviewedAt: new Date(),
      notes: args.reason,
    },
  });
  if (args.orderId && (args.action ?? FraudAction.REVIEW) === FraudAction.BLOCK) {
    await prisma.order.update({
      where: { id: args.orderId },
      data: { status: OrderStatus.FRAUD_FLAGGED, fraudAction: FraudAction.BLOCK },
    });
  }
  return { flagId: flag.id };
}

// =====================================================================
// Per-user billing summary
// =====================================================================

export async function getUserBillingSummary(userId: string) {
  const [user, orders, subs, refunds, ledger, fraudFlags] = await prisma.$transaction([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        mobileNumber: true,
        isActive: true,
        isSuspended: true,
        createdAt: true,
      },
    }),
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { plan: { select: { code: true, name: true } } },
    }),
    prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { code: true, name: true } } },
    }),
    prisma.refund.findMany({
      where: { order: { userId } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.billingLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.fraudSignalEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);
  if (!user) throw new NotFoundError('User not found');
  return { user, orders, subscriptions: subs, refunds, ledger, fraudFlags };
}

// =====================================================================
// Orders (super-admin)
// =====================================================================

export async function listOrdersAdmin(args: {
  status?: OrderStatus;
  userId?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: Order[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));
  const where: Prisma.OrderWhereInput = {};
  if (args.status) where.status = args.status;
  if (args.userId) where.userId = args.userId;
  if (args.search) {
    where.OR = [
      { receiptNumber: { contains: args.search, mode: 'insensitive' } },
      { razorpayOrderId: { contains: args.search, mode: 'insensitive' } },
      { user: { email: { contains: args.search, mode: 'insensitive' } } },
    ];
  }
  const [items, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        plan: { select: { code: true, name: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);
  return { items, total, page, limit };
}

export async function getOrderAdmin(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      plan: true,
      user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
      payments: { orderBy: { createdAt: 'desc' } },
      refunds: { orderBy: { createdAt: 'desc' } },
      invoices: { orderBy: { createdAt: 'desc' } },
      coupon: true,
    },
  });
  if (!order) throw new NotFoundError('Order not found');
  return order;
}

// =====================================================================
// Subscriptions (super-admin)
// =====================================================================

export async function listSubscriptionsAdmin(args: {
  status?: string;
  userId?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));
  const where: Prisma.SubscriptionWhereInput = {};
  if (args.status) where.status = args.status as Prisma.SubscriptionWhereInput['status'];
  if (args.userId) where.userId = args.userId;
  const [items, total] = await prisma.$transaction([
    prisma.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        plan: { select: { code: true, name: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        mandate: true,
      },
    }),
    prisma.subscription.count({ where }),
  ]);
  return { items, total, page, limit };
}

export async function getSubscriptionAdmin(id: string) {
  const sub = await prisma.subscription.findUnique({
    where: { id },
    include: {
      plan: true,
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
      mandate: true,
      events: { orderBy: { happenedAt: 'desc' }, take: 50 },
    },
  });
  if (!sub) throw new NotFoundError('Subscription not found');
  return sub;
}

// =====================================================================
// Payment detail (transactions/:id)
// =====================================================================

export async function getPaymentAdmin(id: string) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      order: {
        include: {
          plan: { select: { code: true, name: true } },
          user: { select: { id: true, email: true } },
        },
      },
      refunds: true,
      disputes: true,
    },
  });
  if (!payment) throw new NotFoundError('Payment not found');
  return payment;
}

// =====================================================================
// Refund detail
// =====================================================================

export async function getRefundAdmin(id: string) {
  const refund = await prisma.refund.findUnique({
    where: { id },
    include: {
      order: {
        include: {
          plan: { select: { code: true, name: true } },
          user: { select: { id: true, email: true } },
        },
      },
      payment: true,
    },
  });
  if (!refund) throw new NotFoundError('Refund not found');
  return refund;
}

// =====================================================================
// Webhook event log + replay
// =====================================================================

export async function listWebhookEventsAdmin(args: {
  status?: string;
  event?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(200, Math.max(1, args.limit ?? 50));
  const where: Prisma.RazorpayWebhookEventWhereInput = {};
  if (args.status) where.status = args.status as Prisma.RazorpayWebhookEventWhereInput['status'];
  if (args.event) where.event = args.event;
  const [items, total] = await prisma.$transaction([
    prisma.razorpayWebhookEvent.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.razorpayWebhookEvent.count({ where }),
  ]);
  return { items, total, page, limit };
}

export async function getWebhookEventAdmin(id: string) {
  const row = await prisma.razorpayWebhookEvent.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('Webhook event not found');
  return row;
}

// =====================================================================
// Audit log query (filtered to billing actions)
// =====================================================================

export async function listBillingAuditAdmin(args: {
  action?: string;
  entity?: string;
  performedBy?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(200, Math.max(1, args.limit ?? 50));
  const where: Prisma.AuditLogWhereInput = {
    OR: [
      { action: { startsWith: 'BILLING_' } },
      {
        entity: {
          in: [
            'Order',
            'Payment',
            'Refund',
            'Subscription',
            'Plan',
            'Coupon',
            'Invoice',
            'FraudSignalEvent',
            'BillingAddress',
            'Mandate',
            'Entitlement',
          ],
        },
      },
    ],
  };
  if (args.action) where.action = args.action;
  if (args.entity) where.entity = args.entity;
  if (args.performedBy) where.performedBy = args.performedBy;
  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total, page, limit };
}

// =====================================================================
// Money ledger
// =====================================================================

export async function listLedgerAdmin(args: {
  userId?: string;
  type?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(200, Math.max(1, args.limit ?? 100));
  const where: Prisma.BillingLedgerWhereInput = {};
  if (args.userId) where.userId = args.userId;
  if (args.type) where.type = args.type as Prisma.BillingLedgerWhereInput['type'];
  const [items, total] = await prisma.$transaction([
    prisma.billingLedger.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, email: true } } },
    }),
    prisma.billingLedger.count({ where }),
  ]);
  return { items, total, page, limit };
}

// =====================================================================
// Replay a stored webhook event
// =====================================================================

export async function replayWebhookEventAdmin(args: {
  eventRowId: string;
  triggeredBy: string;
}): Promise<{ id: string; status: string }> {
  const { replayWebhookEvent } = await import('./razorpay-webhook.service');
  await replayWebhookEvent({
    eventRowId: args.eventRowId,
    triggeredById: args.triggeredBy,
  });
  const row = await prisma.razorpayWebhookEvent.findUnique({ where: { id: args.eventRowId } });
  return { id: args.eventRowId, status: row?.status ?? 'REPLAYED' };
}

// =====================================================================
// Manual entitlement grant (god-mode)
// =====================================================================

export async function grantPlanToUser(args: {
  userId: string;
  planId: string;
  validityDays: number;
  notes: string;
  grantedBy: string;
}) {
  const { manuallyGrantEntitlement } = await import('./entitlement.service');
  return manuallyGrantEntitlement({
    userId: args.userId,
    planId: args.planId,
    validityDays: args.validityDays,
    notes: args.notes,
    createdBy: args.grantedBy,
  });
}

// =====================================================================
// Coupon analytics summary
// =====================================================================

export async function getCouponAnalytics(): Promise<{
  totalCoupons: number;
  activeCoupons: number;
  totalRedemptions: number;
  totalDiscountPaise: number;
  topCoupons: Array<{
    code: string;
    name: string;
    redemptions: number;
    discountPaise: number;
  }>;
}> {
  const [totalCoupons, activeCoupons, redemptionAgg, topRows] = await prisma.$transaction([
    prisma.coupon.count(),
    prisma.coupon.count({ where: { status: 'ACTIVE' } }),
    prisma.couponRedemption.aggregate({
      _count: true,
      _sum: { discountPaise: true },
    }),
    prisma.couponRedemption.groupBy({
      by: ['couponId'],
      _count: { couponId: true },
      _sum: { discountPaise: true },
      orderBy: { _count: { couponId: 'desc' } },
      take: 10,
    }),
  ]);
  const couponDetails = await prisma.coupon.findMany({
    where: { id: { in: topRows.map((r) => r.couponId) } },
    select: { id: true, code: true, name: true },
  });
  const detailsById = new Map(couponDetails.map((c) => [c.id, c]));
  const topCoupons = topRows.map((r) => {
    const c = r._count as { couponId?: number } | undefined;
    const s = r._sum as { discountPaise?: number | null } | undefined;
    return {
      code: detailsById.get(r.couponId)?.code ?? r.couponId,
      name: detailsById.get(r.couponId)?.name ?? '',
      redemptions: c?.couponId ?? 0,
      discountPaise: s?.discountPaise ?? 0,
    };
  });
  return {
    totalCoupons,
    activeCoupons,
    totalRedemptions: typeof redemptionAgg._count === 'number' ? redemptionAgg._count : 0,
    totalDiscountPaise: redemptionAgg._sum.discountPaise ?? 0,
    topCoupons,
  };
}
