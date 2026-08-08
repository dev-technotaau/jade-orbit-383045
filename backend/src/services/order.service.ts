import crypto from 'crypto';
import { prisma } from '../config/prisma';
import {
  type Order,
  type Plan,
  PlanStatus,
  OrderStatus,
  PaymentChannel,
  type Prisma,
} from '@prisma/client';
import { getRazorpayClient, withRazorpaySpan, verifyPaymentSignature } from '../config/razorpay';
import { computePricing } from './pricing.service';
import { nextReceiptNumber } from './receipt-sequence.service';
import { validateCoupon, recordRedemption, pickBestCouponForOrder } from './coupon.service';
import { env } from '../config/env';
import { AppError, NotFoundError, ConflictError, BadRequestError } from '../exceptions';
import logger from '../config/logger';
import { MULTI_QUANTITY_PLAN_CODES, MAX_PLAN_PURCHASE_QUANTITY } from '@/constants';

// ===========================================================
// Types
// ===========================================================

export interface CreateOrderInput {
  userId: string;
  planCode: string;
  /**
   * Units of the plan purchased in one checkout (default 1, max 3).
   * Only plans in MULTI_QUANTITY_PLAN_CODES accept quantity > 1.
   */
  quantity?: number;
  /** Optional billing-address row (must belong to the user). */
  billingAddressId?: string | null;
  /** Optional buyer state code override (used when no billing address yet). */
  buyerStateCode?: string;
  /** Whether the buyer is Indian (default: yes). */
  buyerIsIndian?: boolean;
  /** Optional coupon code — Phase 6 fully wires this up. */
  couponCode?: string;
  /** Buyer email/phone snapshot for invoice + Razorpay notify. */
  buyerEmail?: string;
  buyerPhone?: string;
  /** Buyer's GSTIN (for GST invoice). */
  buyerGstin?: string;
  /** Buyer's legal name (for GST invoice). */
  buyerLegalName?: string;
  /** Idempotency key (from `Idempotency-Key` request header — unique per attempt). */
  idempotencyKey: string;
  /** Optional metadata blob — surfaces in Razorpay order notes. */
  notes?: Record<string, string | number>;
  /** Source IP / UA / fingerprint for fraud + audit. */
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
}

export interface OrderWithRazorpay {
  order: Order;
  razorpay: {
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    receipt: string;
  };
  plan: Plan;
}

// ===========================================================
// Create order
// ===========================================================

/**
 * Build the deterministic Razorpay receipt string from our internal receipt
 * row. Razorpay limits receipt length to 40 chars — `HA/2026-27/00001` is
 * 16, well under the cap.
 */
function buildRazorpayReceipt(formatted: string): string {
  return formatted.length <= 40 ? formatted : formatted.slice(0, 40);
}

/**
 * Create an order: snapshot plan + pricing → Razorpay order → persist Order
 * row. Idempotent: if the same `idempotencyKey` has already produced an
 * order, return that one.
 */
export async function createOrder(input: CreateOrderInput): Promise<OrderWithRazorpay> {
  // Idempotency short-circuit — if we've already produced an order for this
  // exact key, reuse it. Avoids double-charging on retried POSTs.
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { plan: true },
  });
  if (existing) {
    if (!existing.razorpayOrderId) {
      // Something failed mid-flight last time — caller should retry with a
      // fresh idempotency key.
      throw new ConflictError(
        'Previous order with this idempotency key did not complete. Use a fresh key to retry.'
      );
    }
    // Reject key reuse with a DIFFERENT payload — replaying must return
    // the same order the key originally created, not silently honour a
    // changed plan or quantity at the old amount.
    const requestedQty = Number.isFinite(input.quantity)
      ? Math.max(1, Math.floor(input.quantity as number))
      : 1;
    if (existing.plan.code !== input.planCode || existing.quantity !== requestedQty) {
      throw new ConflictError(
        'This idempotency key was already used for a different plan/quantity. Use a fresh key.'
      );
    }
    return {
      order: existing,
      razorpay: {
        keyId: env.RAZORPAY_KEY_ID!,
        orderId: existing.razorpayOrderId,
        amount: existing.totalPaise,
        currency: existing.currency,
        receipt: existing.receiptNumber,
      },
      plan: existing.plan,
    };
  }

  const plan = await prisma.plan.findUnique({ where: { code: input.planCode } });
  if (!plan) throw new NotFoundError(`Plan ${input.planCode} not found`);
  if (plan.status !== PlanStatus.ACTIVE) {
    throw new BadRequestError(`Plan ${input.planCode} is not active`);
  }
  if (plan.requiresQuote) {
    throw new BadRequestError(
      `Plan ${input.planCode} requires a quote. Submit a quote request instead.`
    );
  }
  if (plan.basePricePaise === 0) {
    throw new BadRequestError(
      `Plan ${input.planCode} is free — no order needed; activate directly.`
    );
  }

  // Multi-quantity: clamp + restrict to the stackable plan allow-list.
  // NaN/Infinity-safe — zod guards the route, but internal callers rely
  // on this clamp too.
  const quantity = Number.isFinite(input.quantity)
    ? Math.max(1, Math.floor(input.quantity as number))
    : 1;
  if (quantity > MAX_PLAN_PURCHASE_QUANTITY) {
    throw new BadRequestError(`Maximum ${MAX_PLAN_PURCHASE_QUANTITY} units of a plan per order.`);
  }
  if (quantity > 1 && !(MULTI_QUANTITY_PLAN_CODES as readonly string[]).includes(plan.code)) {
    throw new BadRequestError(`Plan ${plan.code} can only be purchased one unit at a time.`);
  }

  // Resolve billing address (state code drives CGST/SGST vs IGST).
  let buyerStateCode = input.buyerStateCode;
  const billingAddressId = input.billingAddressId ?? null;
  if (billingAddressId) {
    const addr = await prisma.billingAddress.findFirst({
      where: { id: billingAddressId, userId: input.userId },
    });
    if (!addr) throw new BadRequestError('Billing address not found or not owned by user');
    buyerStateCode = addr.stateCode;
  }
  if (!buyerStateCode) buyerStateCode = env.HA_PLACE_OF_SUPPLY_DEFAULT_STATE;

  // Validate + apply coupon (Phase 6)
  // Order of precedence:
  //   1. explicit coupon code on the request → strict validate
  //   2. no code → look for an auto-apply coupon and pick the best discount
  let validatedCoupon: Awaited<ReturnType<typeof validateCoupon>> | null = null;
  if (input.couponCode) {
    validatedCoupon = await validateCoupon({
      code: input.couponCode,
      userId: input.userId,
      planCode: plan.code,
      orderAmountPaise: plan.basePricePaise * quantity,
    });
  } else {
    const best = await pickBestCouponForOrder({
      userId: input.userId,
      planId: plan.id,
      planCode: plan.code,
      orderAmountPaise: plan.basePricePaise * quantity,
    });
    if (best) {
      validatedCoupon = {
        coupon: best.coupon,
        discountPaise: best.discountPaise,
        trialExtendDays: best.trialExtendDays,
      };
    }
  }

  // Compute pricing — full breakdown including tax split.
  const pricing = computePricing({
    plan,
    buyerStateCode,
    buyerIsIndian: input.buyerIsIndian ?? true,
    coupon: validatedCoupon?.coupon,
    quantity,
  });

  if (pricing.totalPaise <= 0) {
    throw new BadRequestError('Computed order amount is zero — purchase not required.');
  }

  // Generate FY-aware order receipt number. Use a SEPARATE prefix from
  // invoice numbers — invoices must be sequential without gaps under GST,
  // but orders can have gaps (failed/abandoned orders).
  const receipt = await nextReceiptNumber('HA-ORD');

  // Create Razorpay order. Use OTel span for visibility.
  const client = getRazorpayClient();
  if (!client) {
    throw new AppError(
      'Razorpay is not configured on this environment',
      503,
      'RAZORPAY_NOT_CONFIGURED'
    );
  }

  const razorpayReceipt = buildRazorpayReceipt(receipt.formatted);
  // Auto-capture is controlled at the Razorpay account level (see dashboard);
  // we capture from the webhook handler when env.RAZORPAY_PAYMENT_CAPTURE_AUTO is false.
  const razorpayOrder = (await withRazorpaySpan(
    'orders.create',
    async () =>
      client.orders.create({
        amount: pricing.totalPaise,
        currency: pricing.currency,
        receipt: razorpayReceipt,
        // Client notes first; canonical keys LAST so a crafted request
        // body can't overwrite what finance/support read in the Razorpay
        // dashboard (userId/planCode/quantity must stay authoritative).
        notes: {
          ...(input.notes ?? {}),
          userId: input.userId,
          planCode: plan.code,
          planName: plan.name,
          quantity,
        },
      }),
    { plan: plan.code, amount: pricing.totalPaise, quantity }
  )) as { id: string; amount: number; currency: string; receipt?: string };

  if (!razorpayOrder?.id) {
    throw new AppError('Razorpay did not return an order id', 502, 'RAZORPAY_BAD_RESPONSE');
  }

  const expiresAt = new Date(Date.now() + env.BILLING_ORDER_EXPIRY_MINUTES * 60_000);

  // Persist order row + payment-attempt placeholder in one transaction.
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        userId: input.userId,
        planId: plan.id,
        planSnapshot: serialisePlan(plan),
        couponId: validatedCoupon?.coupon.id ?? null,
        billingAddressId,
        quantity,
        originalAmountPaise: pricing.originalAmountPaise,
        discountPaise: pricing.discountPaise,
        prorationPaise: pricing.prorationPaise,
        taxableAmountPaise: pricing.taxableAmountPaise,
        cgstPaise: pricing.cgstPaise,
        sgstPaise: pricing.sgstPaise,
        igstPaise: pricing.igstPaise,
        cessPaise: pricing.cessPaise,
        taxPaise: pricing.taxPaise,
        totalPaise: pricing.totalPaise,
        currency: pricing.currency,
        taxRegion: pricing.taxRegion,
        status: OrderStatus.CREATED,
        channel: PaymentChannel.CHECKOUT,
        idempotencyKey: input.idempotencyKey,
        receiptNumber: receipt.formatted,
        razorpayOrderId: razorpayOrder.id,
        gstNumber: input.buyerGstin ?? null,
        legalName: input.buyerLegalName ?? null,
        placeOfSupplyState: buyerStateCode,
        buyerEmail: input.buyerEmail ?? null,
        buyerPhone: input.buyerPhone ?? null,
        buyerCountry: input.buyerIsIndian === false ? null : 'IN',
        notes: (input.notes ?? null) as Prisma.InputJsonValue,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        deviceFingerprint: input.deviceFingerprint ?? null,
        expiresAt,
      },
    });

    await tx.paymentAttempt.create({
      data: {
        orderId: created.id,
        userId: input.userId,
        status: 'created',
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        deviceFingerprint: input.deviceFingerprint ?? null,
      },
    });

    return created;
  });

  // Record redemption AFTER the transaction so failed Razorpay calls don't
  // burn a redemption count. Redemption itself is a quick local-only insert.
  if (validatedCoupon) {
    await recordRedemption({
      couponId: validatedCoupon.coupon.id,
      userId: input.userId,
      orderId: order.id,
      discountPaise: validatedCoupon.discountPaise,
    });
  }

  // ORDER_PLACED notification (multi-channel + dedup) + Kafka emit
  void (async () => {
    const { sendBillingNotification, formatINR } = await import('./billing-notification.service');
    await sendBillingNotification({
      userId: input.userId,
      kind: 'ORDER_PLACED',
      refType: 'ORDER',
      refId: order.id,
      title: `Order ${order.receiptNumber} created`,
      message: `Complete your payment of ${formatINR(order.totalPaise)} for ${plan.name}.`,
      link: `/billing/orders/${order.id}`,
      metadata: { planCode: plan.code, totalPaise: order.totalPaise },
    });
  })().catch((err) => logger.warn('Order-placed notification failed', { err }));

  // Kafka emit for analytics consumers
  void (async () => {
    const { publishEvent } = await import('../kafka/producer');
    const { KafkaTopics } = await import('../kafka/topics');
    await publishEvent(KafkaTopics.BILLING_ORDER_CREATED, order.id, {
      userId: input.userId,
      orderId: order.id,
      planCode: plan.code,
      totalPaise: order.totalPaise,
      currency: order.currency,
      couponId: validatedCoupon?.coupon.id ?? null,
    });
  })().catch(() => {});

  // Audit log
  void (async () => {
    const { AuditService } = await import('./audit.service');
    await AuditService.log({
      action: 'BILLING_ORDER_CREATED',
      entity: 'Order',
      entityId: order.id,
      performedBy: input.userId,
      details: {
        planCode: plan.code,
        totalPaise: order.totalPaise,
        couponId: validatedCoupon?.coupon.id ?? null,
        razorpayOrderId: razorpayOrder.id,
      },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  })();

  // Schedule payment-status poll — defensive net for missed webhooks (§13)
  void (async () => {
    const { enqueuePaymentStatusPoll } = await import('../jobs/payment-status-poll.queue');
    await enqueuePaymentStatusPoll({ orderId: order.id, attempt: 0, delayMs: 30_000 });
  })().catch(() => {});

  logger.info('Order created', {
    orderId: order.id,
    razorpayOrderId: razorpayOrder.id,
    plan: plan.code,
    amount: pricing.totalPaise,
  });

  return {
    order,
    razorpay: {
      keyId: env.RAZORPAY_KEY_ID!,
      orderId: razorpayOrder.id,
      amount: pricing.totalPaise,
      currency: pricing.currency,
      receipt: receipt.formatted,
    },
    plan,
  };
}

// ===========================================================
// Verify payment signature
// ===========================================================

export interface VerifyPaymentInput {
  orderId: string; // our internal Order.id
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  /** Optional — the user is authenticated via `protect`, but allow passing for safety. */
  userId?: string;
}

/**
 * Verify a Razorpay payment signature and mark the order as PAID. The
 * webhook handler is the **source of truth** — but verifying the signature
 * synchronously gives the user immediate feedback ("Payment successful").
 *
 * Idempotent: if the order is already PAID, return early without error.
 */
export async function verifyPayment(input: VerifyPaymentInput): Promise<{
  order: Order;
  signatureValid: boolean;
}> {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new NotFoundError('Order not found');
  if (input.userId && order.userId !== input.userId) {
    throw new AppError('Order does not belong to this user', 403, 'FORBIDDEN');
  }
  if (order.razorpayOrderId !== input.razorpayOrderId) {
    throw new BadRequestError('Razorpay order id mismatch');
  }

  // If already paid (e.g. webhook arrived first), short-circuit.
  if (order.status === OrderStatus.PAID) {
    return { order, signatureValid: true };
  }

  const valid = verifyPaymentSignature({
    orderId: input.razorpayOrderId,
    paymentId: input.razorpayPaymentId,
    signature: input.razorpaySignature,
  });

  if (!valid) {
    await prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        userId: order.userId,
        status: 'signature_failed',
        errorCode: 'BAD_SIGNATURE',
        errorDescription: 'HMAC signature mismatch on /verify',
      },
    });
    throw new AppError('Payment signature verification failed', 400, 'PAYMENT_SIGNATURE_INVALID');
  }

  // Mark order as PAID (webhook will fill in payment-row details).
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.PAID, paidAt: new Date() },
  });

  await prisma.paymentAttempt.create({
    data: {
      orderId: order.id,
      userId: order.userId,
      status: 'verified',
    },
  });

  // Issue invoice + grant entitlement eagerly on /verify so the user sees
  // both immediately. Idempotent — repeated calls (webhook also triggers).
  const [{ issueInvoiceForOrder }, { grantEntitlementForOrder }] = await Promise.all([
    import('./invoice.service'),
    import('./entitlement.service'),
  ]);
  void issueInvoiceForOrder(order.id).catch((err) =>
    logger.error('Auto-issue invoice on /verify failed', {
      orderId: order.id,
      err: err instanceof Error ? err.message : err,
    })
  );
  void grantEntitlementForOrder(order.id).catch((err) =>
    logger.error('Auto-grant entitlement on /verify failed', {
      orderId: order.id,
      err: err instanceof Error ? err.message : err,
    })
  );

  logger.info('Order signature verified', {
    orderId: order.id,
    razorpayPaymentId: input.razorpayPaymentId,
  });

  return { order: updated, signatureValid: true };
}

// ===========================================================
// Read APIs
// ===========================================================

export async function listOrdersForUser(
  userId: string,
  args: { page?: number; limit?: number; status?: OrderStatus } = {}
): Promise<{ items: Order[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(100, Math.max(1, args.limit ?? 20));
  const where: Prisma.OrderWhereInput = { userId };
  if (args.status) where.status = args.status;
  const [items, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
      include: { plan: { select: { code: true, name: true, slug: true, category: true } } },
    }),
    prisma.order.count({ where }),
  ]);
  return { items, total, page, limit };
}

export async function getOrderForUser(
  orderId: string,
  userId: string
): Promise<Order & { plan: Pick<Plan, 'code' | 'name' | 'slug' | 'category'> }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: {
      plan: { select: { code: true, name: true, slug: true, category: true } },
      payments: { orderBy: { createdAt: 'desc' } },
      refunds: { orderBy: { createdAt: 'desc' } },
      invoices: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!order) throw new NotFoundError('Order not found');
  return order as Order & { plan: Pick<Plan, 'code' | 'name' | 'slug' | 'category'> };
}

export async function cancelPendingOrder(orderId: string, userId: string): Promise<Order> {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.status !== OrderStatus.CREATED && order.status !== OrderStatus.ATTEMPTED) {
    throw new BadRequestError('Only pending orders can be cancelled');
  }
  return prisma.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.CANCELLED },
  });
}

// ===========================================================
// Retry — re-open Razorpay checkout for a previously-failed order
// ===========================================================

export interface RetryOrderResult {
  order: Order;
  razorpay: {
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    receipt: string;
  };
  reused: boolean;
}

/**
 * Retry a failed/attempted order — re-opens checkout against the same
 * Razorpay order if still valid, otherwise creates a new Razorpay order
 * (same internal Order row, new razorpayOrderId).
 *
 * Eligible statuses: CREATED, ATTEMPTED, FAILED, EXPIRED. Anything else
 * (PAID/REFUNDED/CANCELLED/DISPUTED/FRAUD_FLAGGED) is rejected.
 */
export async function retryOrder(args: {
  orderId: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<RetryOrderResult> {
  const order = await prisma.order.findFirst({
    where: { id: args.orderId, userId: args.userId },
  });
  if (!order) throw new NotFoundError('Order not found');

  const retryable: OrderStatus[] = [
    OrderStatus.CREATED,
    OrderStatus.ATTEMPTED,
    OrderStatus.FAILED,
    OrderStatus.EXPIRED,
  ];
  if (!retryable.includes(order.status)) {
    throw new BadRequestError(
      `Order is in ${order.status} state and cannot be retried — start a fresh checkout instead.`
    );
  }

  // Upgrade orders freeze a pro-rata credit computed at execute time — the
  // credit decays as the source plan's window elapses, so an expired
  // upgrade quote must NOT be resurrectable at the frozen price days later.
  if (order.upgradeFromOrderId && order.expiresAt && order.expiresAt.getTime() < Date.now()) {
    throw new BadRequestError(
      'This upgrade quote has expired — re-run the upgrade to get current pro-rata pricing.'
    );
  }

  // If razorpay order still has time, just hand it back
  const reuse =
    order.status !== OrderStatus.EXPIRED &&
    order.razorpayOrderId &&
    order.expiresAt &&
    order.expiresAt.getTime() > Date.now() + 60_000; // ≥ 60s of life left

  let razorpayOrderId = order.razorpayOrderId;
  if (!reuse) {
    const { createOrder: rzpCreateOrder } = await import('../config/razorpay');
    const fresh = await rzpCreateOrder({
      amount: order.totalPaise,
      currency: order.currency,
      receipt: `${order.receiptNumber ?? order.id.slice(-12)}-r${Date.now().toString().slice(-6)}`,
      notes: { internalOrderId: order.id, retry: '1' },
    });
    razorpayOrderId = fresh.id;
    await prisma.order.update({
      where: { id: order.id },
      data: {
        razorpayOrderId: fresh.id,
        status: OrderStatus.CREATED,
        expiresAt: new Date(Date.now() + env.BILLING_ORDER_EXPIRY_MINUTES * 60_000),
        ipAddress: args.ipAddress ?? order.ipAddress,
        userAgent: args.userAgent ?? order.userAgent,
      },
    });
  }

  // Audit
  void (async () => {
    const { AuditService } = await import('./audit.service');
    await AuditService.log({
      action: 'BILLING_ORDER_RETRIED',
      entity: 'Order',
      entityId: order.id,
      performedBy: args.userId,
      details: {
        razorpayOrderId,
        reused: reuse,
        previousStatus: order.status,
      },
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
    });
  })();

  const refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  return {
    order: refreshed,
    razorpay: {
      keyId: env.RAZORPAY_KEY_ID!,
      orderId: razorpayOrderId!,
      amount: order.totalPaise,
      currency: order.currency,
      receipt: order.receiptNumber ?? '',
    },
    reused: Boolean(reuse),
  };
}

// ===========================================================
// Helpers
// ===========================================================

/**
 * Snapshot the plan as JSON so the order is immune to subsequent plan edits.
 * Spec: "Order.planSnapshot freezes pricing/features at order time."
 */
function serialisePlan(plan: Plan): Prisma.InputJsonValue {
  // Strip Prisma-specific fields and return a stable JSON shape
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    slug: plan.slug,
    category: plan.category,
    billingCycle: plan.billingCycle,
    basePricePaise: plan.basePricePaise,
    currency: plan.currency,
    gstRatePercent: plan.gstRatePercent,
    gstInclusive: plan.gstInclusive,
    hsnCode: plan.hsnCode,
    validityDays: plan.validityDays,
    trialDays: plan.trialDays,
    isCustom: plan.isCustom,
    requiresQuote: plan.requiresQuote,
    razorpayPlanId: plan.razorpayPlanId,
  } as Prisma.InputJsonValue;
}

/**
 * Build a default idempotency key when the client doesn't send one.
 * Fallback only — the middleware enforces the header, this is for internal
 * callers (cron, webhook-triggered reorders).
 */
export function deriveSystemIdempotencyKey(
  userId: string,
  planCode: string,
  reason: string
): string {
  const seed = `${userId}:${planCode}:${reason}:${Date.now()}`;
  return `system:${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}
