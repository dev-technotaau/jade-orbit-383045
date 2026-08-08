/**
 * Customer refund REQUESTS.
 *
 * The refund engine in `refund.service.ts` moves money: it calls Razorpay and
 * reconciles entitlements. It has always been super-admin-only, which left
 * customers with no way to ask for a refund at all.
 *
 * This service adds the request side, and by design it NEVER touches Razorpay:
 *
 *     customer  ──createRefundRequest──▶  RefundRequest(PENDING)
 *     reviewer  ──reviewRefundRequest──▶  APPROVED → initiateRefund() → Refund
 *                                     └─▶ REJECTED (no money movement)
 *
 * Every request queues for super-admin approval — there is no auto-approve
 * path, deliberately, so no customer-triggered code path can debit the
 * merchant account.
 *
 * Eligibility (`getRefundEligibility`) is advisory: it tells the customer
 * whether they are inside `BILLING_REFUND_WINDOW_DAYS` and how much is
 * refundable, but an out-of-window request can still be SUBMITTED. It is
 * recorded with `withinWindow = false` so the reviewer sees they are making a
 * goodwill decision, and approving one requires the explicit bypass flag.
 */
import { prisma } from '../config/prisma';
import type { Prisma } from '@prisma/client';
import {
  BillingNotificationKind,
  OrderStatus,
  PaymentStatus,
  RefundReason,
  RefundRequestStatus,
  RefundStatus,
  Role,
  type Payment,
  type RefundRequest,
} from '@prisma/client';
import { initiateRefund } from './refund.service';
import { env } from '../config/env';
import { BadRequestError, ConflictError, NotFoundError } from '../exceptions';
import logger from '../config/logger';

// =====================================================================
// Eligibility
// =====================================================================

export interface RefundEligibility {
  /** Can a request be raised at all (order state + refundable balance)? */
  canRequest: boolean;
  /** Set when `canRequest` is false — safe to show to the customer. */
  blockedReason: string | null;
  /** Refundable balance in paise (order total minus refunds already in flight). */
  refundablePaise: number;
  /** Inside the published refund window? Requests outside it are goodwill. */
  withinWindow: boolean;
  windowDays: number;
  /** ISO deadline, or null when no captured payment date is known. */
  windowEndsAt: string | null;
  /** The open request on this order, if the customer already raised one. */
  existingRequest: RefundRequest | null;
}

/** The captured payment a refund would be taken from — the largest one. */
async function findCapturedPayment(orderId: string): Promise<Payment | null> {
  return prisma.payment.findFirst({
    where: { orderId, status: PaymentStatus.CAPTURED },
    orderBy: { amountPaise: 'desc' },
  });
}

/** Sum of refunds already pending or processed against a payment. */
async function refundedSoFar(paymentId: string): Promise<number> {
  const agg = await prisma.refund.aggregate({
    where: {
      paymentId,
      status: { in: [RefundStatus.PENDING, RefundStatus.PROCESSED] },
    },
    _sum: { amountPaise: true },
  });
  return agg._sum.amountPaise ?? 0;
}

export async function getRefundEligibility(
  userId: string,
  orderId: string
): Promise<RefundEligibility> {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) throw new NotFoundError('Order not found');

  const windowDays = env.BILLING_REFUND_WINDOW_DAYS;
  const base: RefundEligibility = {
    canRequest: false,
    blockedReason: null,
    refundablePaise: 0,
    withinWindow: false,
    windowDays,
    windowEndsAt: null,
    existingRequest: null,
  };

  // An open request blocks a second one — otherwise a customer could queue
  // several requests for the same money and a reviewer could approve two.
  const existingRequest = await prisma.refundRequest.findFirst({
    where: { orderId, status: RefundRequestStatus.PENDING },
    orderBy: { createdAt: 'desc' },
  });
  base.existingRequest = existingRequest;

  if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.PARTIALLY_REFUNDED) {
    return {
      ...base,
      blockedReason:
        order.status === OrderStatus.REFUNDED
          ? 'This order has already been fully refunded.'
          : order.status === OrderStatus.REFUND_PENDING
            ? 'A refund on this order is already being processed.'
            : 'Only paid orders can be refunded.',
    };
  }

  const payment = await findCapturedPayment(order.id);
  if (!payment) {
    return { ...base, blockedReason: 'No captured payment found for this order.' };
  }

  const already = await refundedSoFar(payment.id);
  const refundablePaise = Math.max(0, payment.amountPaise - already);
  if (refundablePaise <= 0) {
    return {
      ...base,
      refundablePaise: 0,
      blockedReason: 'This payment is already fully refunded.',
    };
  }

  const capturedAt = payment.capturedAt ?? payment.createdAt;
  const windowEnd = new Date(capturedAt.getTime() + windowDays * 86_400_000);
  const withinWindow = Date.now() <= windowEnd.getTime();

  return {
    ...base,
    canRequest: !existingRequest,
    blockedReason: existingRequest ? 'You already have a refund request under review.' : null,
    refundablePaise,
    withinWindow,
    windowEndsAt: windowEnd.toISOString(),
  };
}

// =====================================================================
// Create / cancel (customer)
// =====================================================================

export interface CreateRefundRequestArgs {
  userId: string;
  orderId: string;
  /** Omit for the full refundable balance. */
  amountPaise?: number;
  userReason: string;
}

export async function createRefundRequest(args: CreateRefundRequestArgs): Promise<RefundRequest> {
  const eligibility = await getRefundEligibility(args.userId, args.orderId);

  if (eligibility.existingRequest) {
    throw new ConflictError('You already have a refund request under review for this order.');
  }
  if (!eligibility.canRequest) {
    throw new BadRequestError(eligibility.blockedReason ?? 'This order cannot be refunded.');
  }

  const amountPaise = args.amountPaise ?? eligibility.refundablePaise;
  if (amountPaise <= 0) {
    throw new BadRequestError('Refund amount must be greater than zero.');
  }
  if (amountPaise > eligibility.refundablePaise) {
    throw new BadRequestError(
      `Requested amount exceeds the refundable balance of ₹${eligibility.refundablePaise / 100}.`
    );
  }

  const payment = await findCapturedPayment(args.orderId);

  const request = await prisma.refundRequest.create({
    data: {
      userId: args.userId,
      orderId: args.orderId,
      paymentId: payment?.id ?? null,
      amountPaise,
      userReason: args.userReason.trim(),
      withinWindow: eligibility.withinWindow,
      status: RefundRequestStatus.PENDING,
    },
  });

  logger.info('Refund request created', {
    refundRequestId: request.id,
    orderId: args.orderId,
    amountPaise,
    withinWindow: eligibility.withinWindow,
  });

  /* Distinct action name from the route-level `audit()` middleware
     ('BILLING_REFUND_REQUESTED', logged pre-handler with IP/user-agent): this
     one is the OUTCOME record and carries the created request's id. */
  void auditRefundRequest('BILLING_REFUND_REQUEST_CREATED', request.id, args.userId, {
    orderId: args.orderId,
    amountPaise,
    withinWindow: eligibility.withinWindow,
  });

  // Acknowledge to the customer so the request never feels like a black hole.
  void notifyRequester(request.id, BillingNotificationKind.REFUND_REQUESTED).catch((err) =>
    logger.warn('Refund request ack notification failed', { err })
  );

  // And tell the reviewers — an approval queue nobody is paged about is a
  // queue that silently ages past the 2-business-day promise above.
  void notifySuperAdminsOfRequest(request.id).catch((err) =>
    logger.warn('Refund request admin notification failed', { err })
  );

  return request;
}

/** Customer withdraws their own PENDING request. */
export async function cancelRefundRequest(userId: string, id: string): Promise<RefundRequest> {
  const request = await prisma.refundRequest.findFirst({ where: { id, userId } });
  if (!request) throw new NotFoundError('Refund request not found');
  if (request.status !== RefundRequestStatus.PENDING) {
    throw new BadRequestError(
      `This request is already ${request.status.toLowerCase()} and can no longer be withdrawn.`
    );
  }
  const updated = await prisma.refundRequest.update({
    where: { id },
    data: { status: RefundRequestStatus.CANCELLED },
  });
  void auditRefundRequest('BILLING_REFUND_REQUEST_WITHDRAWN', id, userId, {
    orderId: request.orderId,
  });
  return updated;
}

export interface RefundRequestWithContext extends RefundRequest {
  order: {
    id: string;
    receiptNumber: string;
    totalPaise: number;
    currency: string;
    status: OrderStatus;
    paidAt: Date | null;
    plan: { code: string; name: string; category: string };
  };
  refund: {
    id: string;
    status: RefundStatus;
    amountPaise: number;
    processedAt: Date | null;
  } | null;
}

const REQUEST_CONTEXT_INCLUDE = {
  order: {
    select: {
      id: true,
      receiptNumber: true,
      totalPaise: true,
      currency: true,
      status: true,
      paidAt: true,
      plan: { select: { code: true, name: true, category: true } },
    },
  },
  refund: { select: { id: true, status: true, amountPaise: true, processedAt: true } },
} satisfies Prisma.RefundRequestInclude;

/** The customer's own requests, newest first. Optionally scoped to one order. */
export async function listMyRefundRequests(
  userId: string,
  filters: { orderId?: string } = {}
): Promise<RefundRequestWithContext[]> {
  const rows = await prisma.refundRequest.findMany({
    where: { userId, ...(filters.orderId ? { orderId: filters.orderId } : {}) },
    orderBy: { createdAt: 'desc' },
    include: REQUEST_CONTEXT_INCLUDE,
    take: 100,
  });
  return rows as unknown as RefundRequestWithContext[];
}

// =====================================================================
// Review (super-admin)
// =====================================================================

export async function listRefundRequestsAdmin(args: {
  status?: RefundRequestStatus;
  page?: number;
  limit?: number;
}): Promise<{ items: unknown[]; total: number; pendingCount: number }> {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));
  const where: Prisma.RefundRequestWhereInput = {};
  if (args.status) where.status = args.status;

  const [items, total, pendingCount] = await prisma.$transaction([
    prisma.refundRequest.findMany({
      where,
      // Oldest PENDING first would be fairer, but the queue is filtered by
      // status in the UI; newest-first keeps parity with every other admin list.
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        ...REQUEST_CONTEXT_INCLUDE,
        user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.refundRequest.count({ where }),
    prisma.refundRequest.count({ where: { status: RefundRequestStatus.PENDING } }),
  ]);
  return { items, total, pendingCount };
}

export async function getRefundRequestAdmin(id: string): Promise<unknown> {
  const row = await prisma.refundRequest.findUnique({
    where: { id },
    include: {
      ...REQUEST_CONTEXT_INCLUDE,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          mobileNumber: true,
        },
      },
      reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  if (!row) throw new NotFoundError('Refund request not found');
  return row;
}

export interface ReviewRefundRequestArgs {
  id: string;
  action: 'APPROVE' | 'REJECT';
  reviewerId: string;
  /** Shown to the customer on both outcomes. */
  reviewNotes?: string;
  /** Approve for less than requested (partial goodwill). */
  amountPaise?: number;
  /** Razorpay speed on approval. */
  speed?: 'normal' | 'optimum';
  /**
   * Required to approve a request that arrived outside the refund window —
   * an explicit, audited acknowledgement that this is a goodwill refund.
   */
  bypassWindow?: boolean;
}

export interface ReviewRefundRequestResult {
  request: RefundRequest;
  refundId: string | null;
  razorpayRefundId: string | null;
}

export async function reviewRefundRequest(
  args: ReviewRefundRequestArgs
): Promise<ReviewRefundRequestResult> {
  const request = await prisma.refundRequest.findUnique({ where: { id: args.id } });
  if (!request) throw new NotFoundError('Refund request not found');
  if (request.status !== RefundRequestStatus.PENDING) {
    throw new BadRequestError(`This request is already ${request.status.toLowerCase()}.`);
  }

  // ── Reject ───────────────────────────────────────────────────────
  if (args.action === 'REJECT') {
    const updated = await prisma.refundRequest.update({
      where: { id: args.id },
      data: {
        status: RefundRequestStatus.REJECTED,
        reviewedById: args.reviewerId,
        reviewedAt: new Date(),
        reviewNotes: args.reviewNotes?.trim() || null,
      },
    });
    void auditRefundRequest('BILLING_REFUND_REQUEST_REJECTED', args.id, args.reviewerId, {
      orderId: request.orderId,
      amountPaise: request.amountPaise,
      reviewNotes: args.reviewNotes ?? null,
    });
    void notifyRequester(args.id, BillingNotificationKind.REFUND_REJECTED).catch((err) =>
      logger.warn('Refund rejection notification failed', { err })
    );
    return { request: updated, refundId: null, razorpayRefundId: null };
  }

  // ── Approve ──────────────────────────────────────────────────────
  if (!request.withinWindow && !args.bypassWindow) {
    throw new BadRequestError(
      `This request arrived outside the ${env.BILLING_REFUND_WINDOW_DAYS}-day refund window. ` +
        'Approve it with the goodwill override to proceed.'
    );
  }

  const amountPaise = args.amountPaise ?? request.amountPaise;
  if (amountPaise <= 0) throw new BadRequestError('Refund amount must be greater than zero.');
  if (amountPaise > request.amountPaise) {
    throw new BadRequestError('Approved amount cannot exceed the amount the customer requested.');
  }

  // Re-resolve the payment: the stored id can be stale, and the refund engine
  // re-validates the refundable balance anyway.
  const payment = request.paymentId
    ? await prisma.payment.findUnique({ where: { id: request.paymentId } })
    : await findCapturedPayment(request.orderId);
  if (!payment) throw new BadRequestError('No captured payment found for this order.');

  const { refund, razorpayRefundId } = await initiateRefund({
    paymentId: payment.id,
    amountPaise,
    reason: RefundReason.USER_REQUESTED,
    notes: args.reviewNotes?.trim() || request.userReason,
    speed: args.speed ?? 'normal',
    initiatedBy: args.reviewerId,
    // Window already adjudicated above; the engine must not re-block an
    // approval the reviewer consciously granted.
    bypassWindow: true,
  });

  const updated = await prisma.refundRequest.update({
    where: { id: args.id },
    data: {
      status: RefundRequestStatus.APPROVED,
      reviewedById: args.reviewerId,
      reviewedAt: new Date(),
      reviewNotes: args.reviewNotes?.trim() || null,
      refundId: refund.id,
    },
  });

  void auditRefundRequest('BILLING_REFUND_REQUEST_APPROVED', args.id, args.reviewerId, {
    orderId: request.orderId,
    amountPaise,
    refundId: refund.id,
    razorpayRefundId,
    goodwillOverride: !request.withinWindow,
  });

  /* No approval notification here on purpose: `refund.service` already sends
     REFUND_PROCESSED when Razorpay confirms the money left, and a second
     "approved" message before the money moves reads as a duplicate. */

  return { request: updated, refundId: refund.id, razorpayRefundId };
}

// =====================================================================
// Helpers
// =====================================================================

async function auditRefundRequest(
  action: string,
  id: string,
  performedBy: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    const { AuditService } = await import('./audit.service');
    await AuditService.log({
      action,
      entity: 'RefundRequest',
      entityId: id,
      performedBy,
      details,
    });
  } catch (err) {
    logger.warn('Refund request audit log failed', { action, id, err });
  }
}

/**
 * Page the reviewers. Mirrors `notifySuperAdminsOfQuote` in quote.service —
 * same audience query, same channel set minus SMS (a refund request is not
 * urgent enough to justify per-message SMS spend on every admin).
 */
async function notifySuperAdminsOfRequest(id: string): Promise<void> {
  const request = await prisma.refundRequest.findUnique({
    where: { id },
    include: {
      order: { include: { plan: true } },
      user: { select: { email: true, firstName: true, lastName: true } },
    },
  });
  if (!request) return;

  const superAdmins = await prisma.user.findMany({
    where: { role: Role.SUPER_ADMIN, isActive: true, isSuspended: false },
    select: { id: true },
  });
  if (superAdmins.length === 0) return;

  const { formatINR } = await import('./billing-notification.service');
  const { notificationService } = await import('./notification.service');
  const who =
    [request.user.firstName, request.user.lastName].filter(Boolean).join(' ') || request.user.email;

  for (const admin of superAdmins) {
    await notificationService
      .send({
        userId: admin.id,
        title: `Refund request: ${formatINR(request.amountPaise)} — ${request.order.plan.name}`,
        message: `${who} requested a refund on order ${request.order.receiptNumber}.${
          request.withinWindow ? '' : ' OUTSIDE the refund window (goodwill decision).'
        } Reason: ${request.userReason}`,
        type: request.withinWindow ? 'INFO' : 'WARNING',
        category: 'billing',
        link: `/super-admin/billing/refund-requests`,
        channels: ['in_app', 'email', 'fcm'],
      })
      .catch((err) =>
        logger.error('Refund request admin notification failed', { adminId: admin.id, err })
      );
  }
}

/** Tell the customer what happened to their request. */
async function notifyRequester(id: string, kind: BillingNotificationKind): Promise<void> {
  const request = await prisma.refundRequest.findUnique({
    where: { id },
    include: { order: { include: { plan: true } } },
  });
  if (!request) return;

  const { sendBillingNotification, formatINR } = await import('./billing-notification.service');
  const isReject = kind === BillingNotificationKind.REFUND_REJECTED;

  await sendBillingNotification({
    userId: request.userId,
    kind,
    refType: 'REFUND_REQUEST',
    refId: request.id,
    title: isReject ? 'Refund request declined' : 'Refund request received',
    message: isReject
      ? `Your refund request of ${formatINR(request.amountPaise)} for ${request.order.plan.name} was not approved.${
          request.reviewNotes ? ` Reason: ${request.reviewNotes}` : ''
        }`
      : `We've received your refund request of ${formatINR(request.amountPaise)} for ${request.order.plan.name}. Our team reviews requests within 2 business days.`,
    link: `/billing/orders/${request.orderId}`,
    metadata: {
      orderId: request.orderId,
      planCode: request.order.plan.code,
      // `planName` / `receiptNumber` / `reviewNotes` are read by the email
      // templates in billing-notification.service — keep them in sync there.
      planName: request.order.plan.name,
      receiptNumber: request.order.receiptNumber,
      reviewNotes: request.reviewNotes,
      amountPaise: request.amountPaise,
      refundRequestId: request.id,
    },
  });
}
