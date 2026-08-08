/**
 * Subscription service — Razorpay Subscriptions API.
 *
 *   - Vendor Connect (VENDOR_CONNECT @ ₹199/month) is a true subscription.
 *   - One-time plans get the `autoRenew` toggle handled here too: when ON,
 *     a Razorpay subscription is created on the same plan after the order
 *     completes (Phase 4) and runs from the next cycle.
 *
 *   - We auto-create the Razorpay Plan on first use if `Plan.razorpayPlanId`
 *     is null — keeps deployment friction low (no manual Razorpay dashboard
 *     work required for new subscription plans).
 *
 * Webhook is the source of truth for state transitions; this service only
 * issues the API calls and persists the local mirror.
 */
import { prisma } from '../config/prisma';
import {
  PlanBillingCycle,
  PlanStatus,
  SubscriptionStatus,
  SubscriptionRenewalMode,
  type Plan,
  type Subscription,
  type Prisma,
} from '@prisma/client';
import { getRazorpayClient, withRazorpaySpan } from '../config/razorpay';
import { env } from '../config/env';
import { AppError, NotFoundError, ConflictError, BadRequestError } from '../exceptions';
import logger from '../config/logger';

// =====================================================================
// Helpers
// =====================================================================

type RecurringCycle =
  | typeof PlanBillingCycle.MONTHLY
  | typeof PlanBillingCycle.QUARTERLY
  | typeof PlanBillingCycle.HALF_YEARLY
  | typeof PlanBillingCycle.YEARLY;

/** Map our `PlanBillingCycle` → Razorpay subscription `period`. */
function mapPeriodForRazorpay(cycle: RecurringCycle): {
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
} {
  switch (cycle) {
    case PlanBillingCycle.MONTHLY:
      return { period: 'monthly', interval: 1 };
    case PlanBillingCycle.QUARTERLY:
      return { period: 'monthly', interval: 3 };
    case PlanBillingCycle.HALF_YEARLY:
      return { period: 'monthly', interval: 6 };
    case PlanBillingCycle.YEARLY:
      return { period: 'yearly', interval: 1 };
  }
}

const RECURRING_CYCLES: ReadonlySet<PlanBillingCycle> = new Set([
  PlanBillingCycle.MONTHLY,
  PlanBillingCycle.QUARTERLY,
  PlanBillingCycle.HALF_YEARLY,
  PlanBillingCycle.YEARLY,
]);

function isRecurringPlan(plan: Plan): plan is Plan & { billingCycle: RecurringCycle } {
  return RECURRING_CYCLES.has(plan.billingCycle);
}

/** Subscription plan_id on Razorpay — auto-create if missing. */
async function ensureRazorpayPlanId(plan: Plan): Promise<string> {
  if (plan.razorpayPlanId) return plan.razorpayPlanId;
  const client = getRazorpayClient();
  if (!client) {
    throw new AppError('Razorpay not configured', 503, 'RAZORPAY_NOT_CONFIGURED');
  }
  if (!isRecurringPlan(plan)) {
    throw new BadRequestError(`Plan ${plan.code} is not a recurring plan`);
  }
  // After narrowing, billingCycle is RecurringCycle.
  const { period, interval } = mapPeriodForRazorpay(plan.billingCycle as RecurringCycle);
  const created = (await withRazorpaySpan(
    'plans.create',
    async () =>
      client.plans.create({
        period,
        interval,
        item: {
          name: plan.name,
          description: plan.shortDescription ?? plan.name,
          amount: plan.basePricePaise,
          currency: plan.currency,
        },
        notes: { hireAddaPlanCode: plan.code },
      }),
    { plan: plan.code }
  )) as { id: string };
  if (!created?.id) {
    throw new AppError('Razorpay plans.create returned no id', 502, 'RAZORPAY_BAD_RESPONSE');
  }
  await prisma.plan.update({
    where: { id: plan.id },
    data: { razorpayPlanId: created.id },
  });
  logger.info('Razorpay Plan created and persisted', {
    planCode: plan.code,
    razorpayPlanId: created.id,
  });
  return created.id;
}

/**
 * Defensive snapshot of plan fields written into `Subscription.planSnapshot`.
 * Same convention as Order.planSnapshot for upgrades and refunds.
 */
function snapshotPlan(plan: Plan): Prisma.InputJsonValue {
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
    razorpayPlanId: plan.razorpayPlanId,
  } as Prisma.InputJsonValue;
}

// =====================================================================
// Create subscription
// =====================================================================

export interface CreateSubscriptionInput {
  userId: string;
  planCode: string;
  /** Total billing cycles (default 12 — caller can override, null = forever). */
  totalCount?: number | null;
  /** ISO timestamp when the first charge should occur (defaults to now). */
  startAt?: Date | null;
  /** Whether to charge upfront via the hosted page. Default true. */
  customerNotify?: boolean;
  /** Phone / email for Razorpay's notify_info. */
  notifyEmail?: string;
  notifyPhone?: string;
  /** Coupon code (Phase 6 hooks in) */
  couponCode?: string;
  metadata?: Record<string, string | number>;
}

export interface CreatedSubscription {
  subscription: Subscription;
  razorpay: {
    keyId: string;
    subscriptionId: string;
    shortUrl: string | null;
    /** Total amount per cycle (snapshot for client display). */
    amountPerCyclePaise: number;
    currency: string;
  };
  plan: Plan;
}

export async function createSubscription(
  input: CreateSubscriptionInput
): Promise<CreatedSubscription> {
  const plan = await prisma.plan.findUnique({ where: { code: input.planCode } });
  if (!plan) throw new NotFoundError(`Plan ${input.planCode} not found`);
  if (plan.status !== PlanStatus.ACTIVE) {
    throw new BadRequestError(`Plan ${input.planCode} is not active`);
  }
  if (!isRecurringPlan(plan)) {
    throw new BadRequestError(`Plan ${input.planCode} is not a subscription plan`);
  }
  if (plan.requiresQuote) {
    throw new BadRequestError(`Plan ${input.planCode} requires a quote`);
  }

  // No double-active subscriptions on the same plan
  const existing = await prisma.subscription.findFirst({
    where: {
      userId: input.userId,
      planId: plan.id,
      status: {
        in: [
          SubscriptionStatus.ACTIVE,
          SubscriptionStatus.AUTHENTICATED,
          SubscriptionStatus.PAUSED,
          SubscriptionStatus.PENDING_CANCEL,
        ],
      },
    },
  });
  if (existing) {
    throw new ConflictError(`You already have an active subscription on ${plan.code}`);
  }

  const client = getRazorpayClient();
  if (!client) {
    throw new AppError('Razorpay not configured', 503, 'RAZORPAY_NOT_CONFIGURED');
  }

  const razorpayPlanId = await ensureRazorpayPlanId(plan);
  const totalCount = input.totalCount === undefined ? 12 : input.totalCount;

  const razorpaySub = (await withRazorpaySpan(
    'subscriptions.create',
    async () =>
      client.subscriptions.create({
        plan_id: razorpayPlanId,
        customer_notify: input.customerNotify === false ? 0 : 1,
        total_count: totalCount ?? 12,
        ...(input.startAt ? { start_at: Math.floor(input.startAt.getTime() / 1000) } : {}),
        notes: {
          userId: input.userId,
          planCode: plan.code,
          ...(input.metadata ?? {}),
        },
        ...(input.notifyEmail || input.notifyPhone
          ? {
              notify_info: {
                ...(input.notifyEmail ? { notify_email: input.notifyEmail } : {}),
                ...(input.notifyPhone ? { notify_phone: input.notifyPhone } : {}),
              },
            }
          : {}),
      }),
    { plan: plan.code }
  )) as unknown as {
    id: string;
    short_url?: string;
    current_start?: number;
    current_end?: number;
    next_charge_at?: number | null;
    total_count?: number;
    paid_count?: number;
    /** Razorpay returns this as a string, not a number. */
    remaining_count?: string | number;
  };

  if (!razorpaySub?.id) {
    throw new AppError(
      'Razorpay subscriptions.create returned no id',
      502,
      'RAZORPAY_BAD_RESPONSE'
    );
  }

  const subscription = await prisma.subscription.create({
    data: {
      userId: input.userId,
      planId: plan.id,
      planSnapshot: snapshotPlan(plan),
      razorpaySubscriptionId: razorpaySub.id,
      status: SubscriptionStatus.CREATED,
      renewalMode: SubscriptionRenewalMode.AUTO_RENEW,
      autoRenew: true,
      cancelAtCycleEnd: false,
      currentStart: razorpaySub.current_start ? new Date(razorpaySub.current_start * 1000) : null,
      currentEnd: razorpaySub.current_end ? new Date(razorpaySub.current_end * 1000) : null,
      nextChargeAt: razorpaySub.next_charge_at ? new Date(razorpaySub.next_charge_at * 1000) : null,
      totalCount: razorpaySub.total_count ?? totalCount,
      paidCount: razorpaySub.paid_count ?? 0,
      remainingCount:
        typeof razorpaySub.remaining_count === 'string'
          ? parseInt(razorpaySub.remaining_count, 10) || (totalCount ?? null)
          : (razorpaySub.remaining_count ?? totalCount ?? null),
      shortUrl: razorpaySub.short_url ?? null,
      metadata: (input.metadata ?? null) as Prisma.InputJsonValue,
    },
  });

  logger.info('Subscription created', {
    subscriptionId: subscription.id,
    razorpaySubscriptionId: razorpaySub.id,
    plan: plan.code,
    userId: input.userId,
  });

  return {
    subscription,
    razorpay: {
      keyId: env.RAZORPAY_KEY_ID!,
      subscriptionId: razorpaySub.id,
      shortUrl: razorpaySub.short_url ?? null,
      amountPerCyclePaise: plan.basePricePaise,
      currency: plan.currency,
    },
    plan,
  };
}

// =====================================================================
// Lifecycle actions
// =====================================================================

export async function cancelSubscription(args: {
  subscriptionId: string;
  userId: string;
  cancelImmediately?: boolean;
  reason?: string;
}): Promise<Subscription> {
  const sub = await prisma.subscription.findFirst({
    where: { id: args.subscriptionId, userId: args.userId },
  });
  if (!sub) throw new NotFoundError('Subscription not found');
  if (
    sub.status === SubscriptionStatus.CANCELLED ||
    sub.status === SubscriptionStatus.COMPLETED ||
    sub.status === SubscriptionStatus.EXPIRED
  ) {
    throw new BadRequestError('Subscription is already terminated');
  }

  const client = getRazorpayClient();
  if (!client) {
    throw new AppError('Razorpay not configured', 503, 'RAZORPAY_NOT_CONFIGURED');
  }
  if (!sub.razorpaySubscriptionId) {
    throw new AppError(
      'Subscription has no Razorpay id — cannot cancel',
      500,
      'SUBSCRIPTION_NOT_LINKED'
    );
  }

  await withRazorpaySpan(
    'subscriptions.cancel',
    async () =>
      client.subscriptions.cancel(sub.razorpaySubscriptionId!, args.cancelImmediately === true),
    { subscriptionId: sub.razorpaySubscriptionId ?? '', immediate: !!args.cancelImmediately }
  );

  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: args.cancelImmediately
      ? {
          status: SubscriptionStatus.CANCELLED,
          autoRenew: false,
          cancelAtCycleEnd: false,
          cancelledAt: new Date(),
          cancelledBy: args.userId,
          cancelReason: args.reason ?? null,
          endedAt: new Date(),
        }
      : {
          // Soft cancel — runs until current_end, then Razorpay sends subscription.cancelled
          status: SubscriptionStatus.PENDING_CANCEL,
          autoRenew: false,
          cancelAtCycleEnd: true,
          cancelledBy: args.userId,
          cancelReason: args.reason ?? null,
        },
  });

  // Audit log
  void (async () => {
    const { AuditService } = await import('./audit.service');
    await AuditService.log({
      action: 'BILLING_SUBSCRIPTION_CANCELLED',
      entity: 'Subscription',
      entityId: sub.id,
      performedBy: args.userId,
      details: {
        razorpaySubscriptionId: sub.razorpaySubscriptionId,
        immediate: !!args.cancelImmediately,
        reason: args.reason ?? null,
      },
    });
  })();

  return updated;
}

export async function pauseSubscription(args: {
  subscriptionId: string;
  userId: string;
  reason?: string;
}): Promise<Subscription> {
  const sub = await prisma.subscription.findFirst({
    where: { id: args.subscriptionId, userId: args.userId },
  });
  if (!sub) throw new NotFoundError('Subscription not found');
  if (sub.status !== SubscriptionStatus.ACTIVE) {
    throw new BadRequestError('Only active subscriptions can be paused');
  }
  const client = getRazorpayClient();
  if (!client) {
    throw new AppError('Razorpay not configured', 503, 'RAZORPAY_NOT_CONFIGURED');
  }

  await withRazorpaySpan(
    'subscriptions.pause',
    async () => client.subscriptions.pause(sub.razorpaySubscriptionId!, { pause_at: 'now' }),
    { subscriptionId: sub.razorpaySubscriptionId ?? '' }
  );

  return prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: SubscriptionStatus.PAUSED,
      pausedAt: new Date(),
      pausedBy: args.userId,
      pauseReason: args.reason ?? null,
    },
  });
}

export async function resumeSubscription(args: {
  subscriptionId: string;
  userId: string;
}): Promise<Subscription> {
  const sub = await prisma.subscription.findFirst({
    where: { id: args.subscriptionId, userId: args.userId },
  });
  if (!sub) throw new NotFoundError('Subscription not found');
  if (sub.status !== SubscriptionStatus.PAUSED) {
    throw new BadRequestError('Only paused subscriptions can be resumed');
  }
  const client = getRazorpayClient();
  if (!client) {
    throw new AppError('Razorpay not configured', 503, 'RAZORPAY_NOT_CONFIGURED');
  }

  await withRazorpaySpan(
    'subscriptions.resume',
    async () => client.subscriptions.resume(sub.razorpaySubscriptionId!, { resume_at: 'now' }),
    { subscriptionId: sub.razorpaySubscriptionId ?? '' }
  );

  return prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: SubscriptionStatus.ACTIVE,
      pausedAt: null,
      pauseReason: null,
    },
  });
}

/**
 * Toggle auto-renew. Works for true subscriptions (Razorpay subscription)
 * and one-time plans (we just flip the boolean flag — Phase 10 cron uses
 * it to decide whether to spin up a follow-up subscription on expiry).
 */
export async function toggleAutoRenew(args: {
  subscriptionId: string;
  userId: string;
  autoRenew: boolean;
  reason?: string;
}): Promise<Subscription> {
  const sub = await prisma.subscription.findFirst({
    where: { id: args.subscriptionId, userId: args.userId },
  });
  if (!sub) throw new NotFoundError('Subscription not found');

  // If turning auto-renew OFF on an active Razorpay subscription, treat as soft-cancel.
  if (
    !args.autoRenew &&
    sub.razorpaySubscriptionId &&
    (sub.status === SubscriptionStatus.ACTIVE || sub.status === SubscriptionStatus.AUTHENTICATED)
  ) {
    return cancelSubscription({
      subscriptionId: sub.id,
      userId: args.userId,
      reason: args.reason ?? 'Auto-renew disabled',
      cancelImmediately: false,
    });
  }

  return prisma.subscription.update({
    where: { id: sub.id },
    data: {
      autoRenew: args.autoRenew,
      renewalMode: args.autoRenew
        ? SubscriptionRenewalMode.AUTO_RENEW
        : SubscriptionRenewalMode.MANUAL,
      cancelAtCycleEnd: !args.autoRenew && !!sub.razorpaySubscriptionId,
      cancelReason: args.autoRenew ? null : (args.reason ?? null),
    },
  });
}

// =====================================================================
// Read APIs
// =====================================================================

export async function listSubscriptionsForUser(userId: string): Promise<Subscription[]> {
  return prisma.subscription.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      plan: {
        select: {
          code: true,
          name: true,
          slug: true,
          category: true,
          basePricePaise: true,
          currency: true,
        },
      },
    },
  });
}

export async function getSubscriptionForUser(
  subscriptionId: string,
  userId: string
): Promise<Subscription> {
  const sub = await prisma.subscription.findFirst({
    where: { id: subscriptionId, userId },
    include: {
      plan: true,
      payments: { orderBy: { createdAt: 'desc' }, take: 20 },
      events: { orderBy: { happenedAt: 'desc' }, take: 20 },
      mandate: true,
    },
  });
  if (!sub) throw new NotFoundError('Subscription not found');
  return sub;
}
