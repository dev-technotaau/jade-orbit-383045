/**
 * Entitlement engine — the keystone of plan-gated access control.
 *
 *   - `grantEntitlementForOrder(orderId)`         called when an Order goes PAID
 *   - `grantEntitlementForSubscriptionCycle(...)`  called on subscription.charged
 *   - `getActiveEntitlementsForUser(userId)`       resolves merged feature + quota snapshot
 *   - `consumeResource({...})`                     atomic quota decrement (CV unlock, job post)
 *   - `releaseResource({...})`                     refund / rollback
 *   - `expireOverdueEntitlements()`                cron sweep
 *   - `revokeEntitlement(...)`                     super-admin
 *
 * Real-time sync: every grant / consume / expire emits `billing:entitlement:changed`
 * on the `user:<userId>` Socket.IO room, and updates the Firestore counter doc
 * (best-effort, never blocks).
 */
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import type { Prisma, ResourceUnit } from '@prisma/client';
import {
  EntitlementSource,
  EntitlementStatus,
  ResourceLedgerReason,
  OrderStatus,
  type Entitlement,
  type EntitlementResource,
  type Plan,
  type PlanFeature,
  type PlanResource,
  type Subscription,
} from '@prisma/client';
import { env } from '../config/env';
import { AppError, NotFoundError, BadRequestError } from '../exceptions';
import { billingEntitlementConsumptionsTotal } from '../routes/metrics.routes';
import logger from '../config/logger';

// =====================================================================
// Resolution — what features + quotas does this user have right now?
// =====================================================================

export interface ResolvedResource {
  unit: ResourceUnit;
  allocated: number;
  consumed: number;
  carriedForward: number;
  remaining: number;
  /** Sum across all active entitlements granting this resource. */
  totalAllocated: number;
  totalConsumed: number;
  totalRemaining: number;
  /** ISO timestamp of the last consume/release on this resource. */
  lastConsumedAt: string | null;
}

export interface ResolvedFeature {
  key: string;
  label: string;
  included: boolean;
  countableLimit: number | null;
  enumValue: string | null;
  textValue: string | null;
}

export interface ResolvedEntitlement {
  id: string;
  planId: string;
  planCode: string;
  planName: string;
  /** Plan family (JOB_POST / CV_DATABASE / ...) — lets the pricing UI
   *  scope "current plan" decisions per category instead of globally. */
  planCategory: string;
  /** Base price of the granting plan — 0 = free tier. Lets the pricing
   *  UI route paid-plan holders through the upgrade flow. */
  planPricePaise: number;
  source: EntitlementSource;
  validFrom: string;
  validUntil: string;
  autoRenew: boolean;
  gracePeriodUntil: string | null;
  cancelledAt: string | null;
  status: EntitlementStatus;
  features: ResolvedFeature[];
  resources: ResolvedResource[];
  metadata: Record<string, unknown> | null;
}

export interface EntitlementSnapshot {
  /** All active (non-expired) entitlements for this user. */
  entitlements: ResolvedEntitlement[];
  /** Feature key → boolean (any active entitlement grants it). */
  features: Record<string, boolean>;
  /** Resource unit → totals across all active entitlements. */
  resources: Partial<Record<ResourceUnit, ResolvedResource>>;
  /** Earliest validUntil among active entitlements (null = none active). */
  nextExpiryAt: string | null;
  hasAnyActive: boolean;
}

/** Internal Prisma include for resolution. */
const RESOLVE_INCLUDE = {
  plan: { include: { features: true, resources: true } },
  resources: true,
} satisfies Prisma.EntitlementInclude;

type EntitlementWithRelations = Entitlement & {
  plan: Plan & { features: PlanFeature[]; resources: PlanResource[] };
  resources: EntitlementResource[];
};

function mapResolved(ent: EntitlementWithRelations): ResolvedEntitlement {
  const resources: ResolvedResource[] = ent.resources.map((r) => {
    const remaining = Math.max(0, r.allocated + r.carriedForward - r.consumed);
    return {
      unit: r.unit,
      allocated: r.allocated,
      consumed: r.consumed,
      carriedForward: r.carriedForward,
      remaining,
      totalAllocated: r.allocated + r.carriedForward,
      totalConsumed: r.consumed,
      totalRemaining: remaining,
      lastConsumedAt: r.lastConsumedAt?.toISOString() ?? null,
    };
  });
  const features: ResolvedFeature[] = ent.plan.features.map((f) => ({
    key: f.key,
    label: f.label,
    included: f.included,
    countableLimit: f.countableLimit,
    enumValue: f.enumValue,
    textValue: f.textValue,
  }));
  return {
    id: ent.id,
    planId: ent.planId,
    planCode: ent.plan.code,
    planName: ent.plan.name,
    planCategory: ent.plan.category,
    planPricePaise: ent.plan.basePricePaise,
    source: ent.source,
    validFrom: ent.validFrom.toISOString(),
    validUntil: ent.validUntil.toISOString(),
    autoRenew: ent.autoRenew,
    gracePeriodUntil: ent.gracePeriodUntil?.toISOString() ?? null,
    cancelledAt: ent.cancelledAt?.toISOString() ?? null,
    status: ent.status,
    features,
    resources,
    metadata: (ent.metadata as Record<string, unknown> | null) ?? null,
  };
}

// =====================================================================
// Redis cache layer (§6.1) — 60s TTL with active invalidation on every
// grant / consume / expire / revoke / refund. Cache is a perf optimisation
// only; on miss/error we hit Postgres and reconstruct.
// =====================================================================

const ENT_CACHE_TTL = 60; // seconds, per plan §6.1
const ENT_CACHE_KEY = (userId: string) => `entitlements:${userId}`;

async function readEntitlementCache(userId: string): Promise<EntitlementSnapshot | null> {
  try {
    const raw = await redis.get(ENT_CACHE_KEY(userId));
    if (!raw) return null;
    return JSON.parse(raw) as EntitlementSnapshot;
  } catch {
    return null;
  }
}

async function writeEntitlementCache(userId: string, snap: EntitlementSnapshot): Promise<void> {
  try {
    await redis.set(ENT_CACHE_KEY(userId), JSON.stringify(snap), 'EX', ENT_CACHE_TTL);
  } catch {
    /* cache best-effort */
  }
}

/**
 * Drop the cached snapshot — call after every grant / consume / refund /
 * cancel / upgrade so the next read pulls fresh data.
 */
export async function invalidateEntitlementCache(userId: string): Promise<void> {
  try {
    await redis.del(ENT_CACHE_KEY(userId));
  } catch {
    /* cache best-effort */
  }
}

/**
 * Resolves the user whose entitlements should answer "what plan does
 * this user have access to". For solo users this returns their own id;
 * for ACTIVE multi-seat team members it returns the company OWNER's
 * userId so seats inherit the company's plan benefits.
 *
 * Per-call DB cost: one indexed lookup on `EmployerTeamMember.userId`
 * (status filter narrows further). Acceptable on every snapshot read
 * because the result is then cached for 60s.
 */
export async function resolveBillingUserId(userId: string): Promise<string> {
  try {
    const seat = await prisma.employerTeamMember.findFirst({
      where: { userId, status: 'ACTIVE' },
      select: { company: { select: { userId: true } } },
    });
    return seat?.company?.userId ?? userId;
  } catch {
    return userId;
  }
}

export async function getActiveEntitlementsForUser(
  userId: string,
  opts: { skipCache?: boolean } = {}
): Promise<EntitlementSnapshot> {
  // Multi-seat: resolve to the billing user (company owner) so team
  // members inherit the company plan. Cache is keyed on the billing
  // user, so all seats share one cache entry — invalidating the owner
  // also refreshes every seat.
  const billingUserId = await resolveBillingUserId(userId);

  if (!opts.skipCache) {
    const cached = await readEntitlementCache(billingUserId);
    if (cached) return cached;
  }

  const now = new Date();
  const ents = await prisma.entitlement.findMany({
    where: {
      userId: billingUserId,
      status: EntitlementStatus.ACTIVE,
      validUntil: { gt: now },
    },
    orderBy: { validUntil: 'asc' },
    include: RESOLVE_INCLUDE,
  });

  const resolved = ents.map(mapResolved);
  const features: Record<string, boolean> = {};
  const resources: Partial<Record<ResourceUnit, ResolvedResource>> = {};

  for (const ent of resolved) {
    for (const f of ent.features) {
      if (f.included) features[f.key] = true;
    }
    for (const r of ent.resources) {
      const existing = resources[r.unit];
      if (!existing) {
        resources[r.unit] = { ...r };
      } else {
        existing.totalAllocated += r.totalAllocated;
        existing.totalConsumed += r.totalConsumed;
        existing.totalRemaining = Math.max(0, existing.totalAllocated - existing.totalConsumed);
      }
    }
  }

  const snapshot: EntitlementSnapshot = {
    entitlements: resolved,
    features,
    resources,
    nextExpiryAt: resolved[0]?.validUntil ?? null,
    hasAnyActive: resolved.length > 0,
  };

  // Best-effort cache write — failures don't break the request.
  // Keyed on the *billing* user so all team-member seats share one entry.
  void writeEntitlementCache(billingUserId, snapshot);

  return snapshot;
}

/**
 * Returns the userIds of every user with an active entitlement granting
 * the given feature key — no input list, full scan. One indexed lookup
 * against `Entitlement` joined to `PlanFeature`. Safe to call per search
 * because the result set is small (Premium-tier users only).
 */
export async function getUsersWithFeatureAll(featureKey: string): Promise<string[]> {
  const rows = await prisma.entitlement.findMany({
    where: {
      status: EntitlementStatus.ACTIVE,
      validUntil: { gt: new Date() },
      plan: {
        features: { some: { key: featureKey, included: true } },
      },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  return rows.map((r) => r.userId);
}

/**
 * Batch helper — given a list of user IDs and a feature key, returns the
 * subset of IDs whose active entitlements grant that feature. One DB query
 * regardless of input size; safe to call from search/list endpoints.
 *
 * Used by candidate-search to inject `hasVerifiedBadge` per row without
 * an N+1.
 */
export async function getUsersWithFeature(
  userIds: string[],
  featureKey: string
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await prisma.entitlement.findMany({
    where: {
      userId: { in: userIds },
      status: EntitlementStatus.ACTIVE,
      validUntil: { gt: new Date() },
      plan: {
        features: {
          some: { key: featureKey, included: true },
        },
      },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  return new Set(rows.map((r) => r.userId));
}

// =====================================================================
// Grant — called when an order is PAID
// =====================================================================

/**
 * Units that describe HOW a plan works rather than a spendable credit
 * pool — multi-quantity orders do NOT multiply these. JOB_DAYS_LIVE is
 * each job's listing lifetime; SEAT is the licence count of the plan;
 * FEATURE_FLAG is boolean by nature.
 */
const NON_MULTIPLIABLE_UNITS = new Set<ResourceUnit>(['JOB_DAYS_LIVE', 'SEAT', 'FEATURE_FLAG']);

/**
 * Idempotent on (userId, sourceOrderId). If an entitlement already exists
 * for this order, it's returned unchanged.
 */
export async function grantEntitlementForOrder(orderId: string): Promise<Entitlement> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      plan: { include: { resources: true } },
      upgradeFromOrder: {
        include: {
          plan: true,
        },
      },
    },
  });
  if (!order) throw new NotFoundError('Order not found');
  if (order.status !== OrderStatus.PAID) {
    throw new BadRequestError(`Order is ${order.status} — must be PAID to grant entitlement`);
  }

  // Idempotency
  const existing = await prisma.entitlement.findFirst({
    where: { userId: order.userId, sourceOrderId: order.id },
  });
  if (existing) return existing;

  const validityDays =
    order.plan.validityDays ??
    (order.plan.billingCycle === 'CUSTOM'
      ? // Custom plans: read validity from the planSnapshot — set when the
        // super-admin created the offer
        ((order.planSnapshot as { validityDays?: number } | null)?.validityDays ?? 30)
      : 30);

  const validFrom = order.paidAt ?? new Date();
  const validUntil = new Date(validFrom.getTime() + validityDays * 86_400_000);

  // ── Same-category supersede + carry-forward ─────────────────────────
  // A paid plan purchase REPLACES still-active entitlements of other
  // plans in the same category, instead of stacking alongside them.
  // Previously only the explicit upgrade flow (upgradeFromOrderId)
  // superseded its predecessor — a plain "Buy" checkout stacked, so a
  // user who bought Standard while holding Free (or CV Pro while
  // holding CV Lite) ended up with BOTH active, double "Current plan"
  // badges, and summed quotas.
  //
  // Predecessor selection:
  //   - the explicit upgrade source (upgradeFromOrderId), always, AND
  //   - any other ACTIVE same-category entitlement of a DIFFERENT plan
  //     whose tier (basePricePaise) is not higher than the new plan's —
  //     so buying a CHEAPER plan never cancels a pricier one you still
  //     hold (that's a top-up, not a downgrade), and the order-less
  //     signup-granted EMP_FREE (price 0) is always superseded by any
  //     paid purchase even though the upgrade flow can't see it.
  //   - repurchasing the SAME plan stacks deliberately (quota top-up).
  //
  // Unused units from superseded PAID entitlements carry forward into
  // the new one, clamped per-unit by the new plan's carryForwardCap.
  // FREE plans are cancelled with NO carry — their bundled units are a
  // trial allowance, not purchased credit (owner decision, June 2026).
  const carryForwardMap = new Map<ResourceUnit, number>();
  // Per-unit carry allowance. Caps are sized for ONE unit of a plan, so a
  // multi-quantity predecessor earns cap × its purchased quantity —
  // otherwise upgrading away from a 3× purchase would clamp 3 units' worth
  // of paid credits to a single-unit cap and silently destroy the rest.
  // The effective per-unit cap is the LOWER of the plan cap and the
  // super-admin SystemConfig ceiling (billing.carryforward.cap.<unit>),
  // matching what previewUpgrade promises.
  const capBudgetMap = new Map<ResourceUnit, number>();
  // Units consumed on superseded plans — deducted from the new plan's
  // allocation on UPGRADE-flow grants only (the pro-rata credit assumes
  // unused time, so used resources are charged back in units; plain buys
  // give no money credit and therefore deduct nothing).
  const usedMap = new Map<ResourceUnit, number>();
  const sameCategoryActive = await prisma.entitlement.findMany({
    where: {
      userId: order.userId,
      status: EntitlementStatus.ACTIVE,
      planId: { not: order.planId },
      plan: { category: order.plan.category },
    },
    include: {
      resources: true,
      plan: { include: { resources: true } },
      sourceOrder: { select: { quantity: true } },
    },
  });
  const toSupersede = sameCategoryActive.filter(
    (prev) =>
      (order.upgradeFromOrderId && prev.sourceOrderId === order.upgradeFromOrderId) ||
      prev.plan.basePricePaise <= order.plan.basePricePaise
  );

  const sysCaps = new Map<string, number>();
  if (toSupersede.length > 0) {
    const sysCapRows = await prisma.systemConfig.findMany({
      where: { key: { startsWith: 'billing.carryforward.cap.' } },
    });
    for (const row of sysCapRows) {
      const unit = row.key.replace('billing.carryforward.cap.', '');
      const v = row.value as unknown as number | { cap?: number };
      const cap = typeof v === 'number' ? v : (v?.cap ?? 0);
      if (Number.isFinite(cap) && cap > 0) sysCaps.set(unit, cap);
    }
  }

  for (const prevEnt of toSupersede) {
    if (prevEnt.plan.basePricePaise > 0) {
      const prevQty = Math.max(1, prevEnt.sourceOrder?.quantity ?? 1);
      for (const oldRes of prevEnt.resources) {
        const newPlanRes = order.plan.resources.find((r) => r.unit === oldRes.unit);
        const oldPlanRes = prevEnt.plan.resources.find((r) => r.unit === oldRes.unit);
        if (!newPlanRes) continue;
        const remaining = Math.max(0, oldRes.allocated + oldRes.carriedForward - oldRes.consumed);
        usedMap.set(oldRes.unit, (usedMap.get(oldRes.unit) ?? 0) + oldRes.consumed);
        const planCap = newPlanRes.carryForwardCap ?? oldPlanRes?.carryForwardCap ?? null;
        const sysCap = sysCaps.get(oldRes.unit) ?? null;
        const cap =
          planCap !== null && sysCap !== null ? Math.min(planCap, sysCap) : (planCap ?? sysCap);
        const already = carryForwardMap.get(oldRes.unit) ?? 0;
        let carried: number;
        if (cap === null || cap === undefined) {
          carried = already + remaining;
        } else {
          const budget = (capBudgetMap.get(oldRes.unit) ?? 0) + cap * prevQty;
          capBudgetMap.set(oldRes.unit, budget);
          carried = Math.min(already + remaining, budget);
        }
        if (carried > 0) carryForwardMap.set(oldRes.unit, carried);
      }
    }
    // Soft-cancel so the superseded plan can't be double-spent.
    await prisma.entitlement.update({
      where: { id: prevEnt.id },
      data: { status: EntitlementStatus.CANCELLED, cancelledAt: new Date() },
    });
    // A pending scheduled downgrade on the superseded entitlement is now
    // moot — clear it so it can't fire later or linger un-cancellable.
    try {
      const { clearPendingDowngrade } = await import('./downgrade.service');
      await clearPendingDowngrade(prevEnt.id);
    } catch {
      /* best-effort cleanup */
    }
    logger.info('entitlement.superseded_by_purchase', {
      userId: order.userId,
      superseded: prevEnt.plan.code,
      by: order.plan.code,
      viaUpgradeFlow: Boolean(order.upgradeFromOrderId),
    });
  }

  // Used-resource deduction applies only to upgrade-flow grants (see above).
  const isUpgradeFlow = Boolean(order.upgradeFromOrderId);

  const created = await prisma.$transaction(async (tx) => {
    const ent = await tx.entitlement.create({
      data: {
        userId: order.userId,
        planId: order.planId,
        source: EntitlementSource.PLAN,
        sourceOrderId: order.id,
        sourceCouponId: order.couponId,
        status: EntitlementStatus.ACTIVE,
        validFrom,
        validUntil,
        autoRenew: false, // user opts in later from billing UI
      },
    });

    if (order.plan.resources.length > 0) {
      await tx.entitlementResource.createMany({
        data: order.plan.resources.map((r) => {
          // Multi-quantity orders multiply countable credits. Durations
          // (JOB_DAYS_LIVE is per-job listing life) and licences (SEAT)
          // describe HOW the plan works, not how much — never multiplied.
          const base =
            r.quantity * (NON_MULTIPLIABLE_UNITS.has(r.unit) ? 1 : (order.quantity ?? 1));
          // Upgrade-flow grants deduct units already consumed on the
          // superseded plans (the pro-rata money credit assumed unused
          // time). Never below zero; durations/licences untouched.
          const deducted =
            isUpgradeFlow && !NON_MULTIPLIABLE_UNITS.has(r.unit)
              ? Math.min(usedMap.get(r.unit) ?? 0, base)
              : 0;
          return {
            entitlementId: ent.id,
            unit: r.unit,
            allocated: base - deducted,
            consumed: 0,
            carriedForward: carryForwardMap.get(r.unit) ?? 0,
          };
        }),
      });

      // Record GRANT ledger entries
      const fresh = await tx.entitlementResource.findMany({
        where: { entitlementId: ent.id },
      });
      for (const r of fresh) {
        await tx.resourceLedger.create({
          data: {
            entitlementResourceId: r.id,
            userId: order.userId,
            delta: r.allocated + r.carriedForward,
            reason:
              r.carriedForward > 0
                ? ResourceLedgerReason.CARRY_FORWARD
                : ResourceLedgerReason.GRANT,
            refType: 'ORDER',
            refId: order.id,
            notes: `Granted from plan ${order.plan.code}`,
          },
        });
      }
    }

    return ent;
  });

  logger.info('Entitlement granted', {
    entitlementId: created.id,
    userId: order.userId,
    planCode: order.plan.code,
    validUntil,
    carryForwardEntries: carryForwardMap.size,
  });

  // Real-time sync (fire-and-forget)
  void emitEntitlementChange(order.userId, 'granted');
  return created;
}

/**
 * Per-cycle grant for subscription plans. Called from
 * `subscription.handler.handleSubscriptionEvent` on `subscription.charged`.
 *
 * Idempotent on `(userId, sourceSubscriptionId, cycleStart)` — passing the
 * same cycle start re-uses the same entitlement.
 */
export async function grantEntitlementForSubscriptionCycle(args: {
  subscriptionId: string;
  cycleStart: Date;
  cycleEnd: Date;
}): Promise<Entitlement> {
  const sub = await prisma.subscription.findUnique({
    where: { id: args.subscriptionId },
    include: { plan: { include: { resources: true } } },
  });
  if (!sub) throw new NotFoundError('Subscription not found');

  // Look up previous cycle's entitlement to roll-forward unused units
  const prevCycle = await prisma.entitlement.findFirst({
    where: {
      userId: sub.userId,
      sourceSubscriptionId: sub.id,
      validUntil: { lt: args.cycleEnd },
    },
    orderBy: { validUntil: 'desc' },
    include: { resources: true },
  });

  // Idempotency — exact same cycle?
  const existing = await prisma.entitlement.findFirst({
    where: {
      userId: sub.userId,
      sourceSubscriptionId: sub.id,
      validFrom: args.cycleStart,
    },
  });
  if (existing) return existing;

  const carryForwardMap = new Map<ResourceUnit, number>();
  if (prevCycle) {
    for (const oldRes of prevCycle.resources) {
      const newPlanRes = sub.plan.resources.find((r) => r.unit === oldRes.unit);
      if (!newPlanRes) continue;
      const remaining = Math.max(0, oldRes.allocated + oldRes.carriedForward - oldRes.consumed);
      const cap = newPlanRes.carryForwardCap ?? null;
      const carried = cap === null || cap === undefined ? remaining : Math.min(remaining, cap);
      if (carried > 0) carryForwardMap.set(oldRes.unit, carried);
    }
    await prisma.entitlement.update({
      where: { id: prevCycle.id },
      data: { status: EntitlementStatus.EXPIRED, cancelledAt: new Date() },
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    const ent = await tx.entitlement.create({
      data: {
        userId: sub.userId,
        planId: sub.planId,
        source: EntitlementSource.PLAN,
        sourceSubscriptionId: sub.id,
        status: EntitlementStatus.ACTIVE,
        validFrom: args.cycleStart,
        validUntil: args.cycleEnd,
        autoRenew: true,
      },
    });
    if (sub.plan.resources.length > 0) {
      await tx.entitlementResource.createMany({
        data: sub.plan.resources.map((r) => ({
          entitlementId: ent.id,
          unit: r.unit,
          allocated: r.quantity,
          consumed: 0,
          carriedForward: carryForwardMap.get(r.unit) ?? 0,
        })),
      });
    }
    return ent;
  });

  logger.info('Entitlement granted (subscription cycle)', {
    entitlementId: created.id,
    subscriptionId: sub.id,
    userId: sub.userId,
  });

  // First-cycle Vendor Connect activation → tailored onboarding drip
  // (set up vendor profile → browse the job board → respond to leads).
  // `!prevCycle` ensures it fires once per activation, not every renewal.
  if (!prevCycle && sub.plan.code === 'VENDOR_CONNECT') {
    void (async () => {
      try {
        const { scheduleOnboardingDrip } = await import('../jobs/onboarding-drip.queue');
        await scheduleOnboardingDrip(sub.userId, 'VENDOR_CONNECT');
      } catch (err) {
        logger.warn('vendor onboarding drip schedule failed', {
          userId: sub.userId,
          err: err instanceof Error ? err.message : err,
        });
      }
    })();
  }

  void emitEntitlementChange(sub.userId, 'granted');
  return created;
}

// =====================================================================
// Consume — called by feature handlers (post-success)
// =====================================================================

export interface ConsumeArgs {
  userId: string;
  unit: ResourceUnit;
  amount: number;
  refType: string; // 'JOB_POST' | 'CV_UNLOCK' | 'SEARCH' | 'APPLICATION' | 'CUSTOM'
  refId?: string;
  notes?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ConsumeResult {
  consumed: boolean;
  /** Which entitlement was charged. */
  entitlementId: string | null;
  /** New remaining quota across ALL active entitlements (for the unit). */
  remaining: number;
  reason?: 'INSUFFICIENT' | 'NO_ENTITLEMENT';
}

/**
 * Atomically decrement a resource. Picks the entitlement closest to expiry
 * first ("FIFO by validUntil") so credits don't sit on a long-dated plan
 * while a short-dated one expires unused.
 *
 * Throws `AppError(402, 'PAYMENT_REQUIRED')` when no entitlement has
 * sufficient remaining — caller can catch and redirect to upgrade.
 */
export async function consumeResource(args: ConsumeArgs): Promise<ConsumeResult> {
  if (args.amount <= 0) {
    return { consumed: true, entitlementId: null, remaining: 0 };
  }

  // Multi-seat: drain from the company owner's pool when the caller is a
  // team member. The actor (args.userId) is still recorded in the ledger
  // so we keep an audit trail of who unlocked what.
  const billingUserId = await resolveBillingUserId(args.userId);

  const result = await prisma.$transaction(async (tx) => {
    // Lock + select active entitlement resources for this unit
    const candidates = await tx.entitlementResource.findMany({
      where: {
        unit: args.unit,
        entitlement: {
          userId: billingUserId,
          status: EntitlementStatus.ACTIVE,
          validUntil: { gt: new Date() },
        },
      },
      orderBy: { entitlement: { validUntil: 'asc' } },
      include: { entitlement: true },
    });

    if (candidates.length === 0) {
      return {
        consumed: false,
        entitlementId: null,
        remaining: 0,
        reason: 'NO_ENTITLEMENT' as const,
      };
    }

    // Try to satisfy from a single entitlement first (cleanest accounting),
    // falling back to splitting across multiple if necessary.
    let needed = args.amount;
    let chargedEntitlementId: string | null = null;

    for (const cand of candidates) {
      const remaining = cand.allocated + cand.carriedForward - cand.consumed;
      if (remaining <= 0) continue;
      const take = Math.min(remaining, needed);
      // Atomic increment with row-level guard via `where: { id, consumed }`
      const updated = await tx.entitlementResource.updateMany({
        where: { id: cand.id, consumed: cand.consumed },
        data: { consumed: { increment: take }, lastConsumedAt: new Date() },
      });
      if (updated.count === 0) {
        // Lost the optimistic lock — abort and let the caller retry.
        throw new AppError('Concurrent quota update — please retry', 409, 'QUOTA_RACE');
      }
      await tx.resourceLedger.create({
        data: {
          entitlementResourceId: cand.id,
          userId: args.userId,
          delta: -take,
          reason: ResourceLedgerReason.CONSUME,
          refType: args.refType,
          refId: args.refId ?? null,
          notes: args.notes ?? null,
          ipAddress: args.ipAddress ?? null,
          userAgent: args.userAgent ?? null,
        },
      });
      needed -= take;
      chargedEntitlementId = cand.entitlementId;
      if (needed === 0) break;
    }

    if (needed > 0) {
      // Insufficient — the partial decrements above will be rolled back when
      // we throw out of the transaction.
      throw new AppError(`Insufficient ${args.unit.toLowerCase()} quota`, 402, 'PAYMENT_REQUIRED');
    }

    // Compute new remaining total — same billingUserId scope as above so
    // multi-seat callers see the company pool's remainder.
    const refreshed = await tx.entitlementResource.findMany({
      where: {
        unit: args.unit,
        entitlement: {
          userId: billingUserId,
          status: EntitlementStatus.ACTIVE,
          validUntil: { gt: new Date() },
        },
      },
    });
    const totalRemaining = refreshed.reduce(
      (sum, r) => sum + Math.max(0, r.allocated + r.carriedForward - r.consumed),
      0
    );

    return {
      consumed: true,
      entitlementId: chargedEntitlementId,
      remaining: totalRemaining,
    };
  });

  if (result.consumed) {
    void emitEntitlementChange(args.userId, 'consumed');
    // Phase 14: Prometheus counter — drives "hot quotas" dashboards
    billingEntitlementConsumptionsTotal.inc({ unit: args.unit, plan: 'unknown' }, args.amount);
  }
  return result;
}

/**
 * Restore a previously consumed resource (e.g. after refund). Pure inverse
 * of `consumeResource`.
 */
export async function releaseResource(args: ConsumeArgs): Promise<void> {
  if (args.amount <= 0) return;
  await prisma.$transaction(async (tx) => {
    const lastConsume = await tx.resourceLedger.findFirst({
      where: {
        userId: args.userId,
        refType: args.refType,
        refId: args.refId ?? undefined,
        reason: ResourceLedgerReason.CONSUME,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastConsume) return;
    await tx.entitlementResource.update({
      where: { id: lastConsume.entitlementResourceId },
      data: {
        consumed: { decrement: Math.min(args.amount, Math.abs(lastConsume.delta)) },
      },
    });
    await tx.resourceLedger.create({
      data: {
        entitlementResourceId: lastConsume.entitlementResourceId,
        userId: args.userId,
        delta: args.amount,
        reason:
          args.refType === 'REFUND'
            ? ResourceLedgerReason.REFUND_RESTORE
            : ResourceLedgerReason.ROLLBACK,
        refType: args.refType,
        refId: args.refId ?? null,
        notes: args.notes ?? 'Restored',
      },
    });
  });
  void emitEntitlementChange(args.userId, 'restored');
}

/**
 * Proportional resource clawback for PARTIAL refunds.
 *
 * When a fraction of an order's money comes back, the same fraction of the
 * entitlement's purchased credits goes away — "refund 1 of 3 units" must
 * not leave all 3 units' credits spendable. Rules:
 *
 *   - The clawback target is CUMULATIVE: round(originalAllocated ×
 *     refundedFraction), where originalAllocated reconstructs the
 *     pre-clawback allocation from the REFUND_CLAWBACK ledger trail. Each
 *     call applies only the delta, so repeated webhook deliveries and
 *     successive partial refunds converge instead of double-clawing.
 *   - Consumed units are never clawed (can't un-spend) — the allocation
 *     floors at consumed − carriedForward so remaining never goes negative.
 *   - carriedForward credits are untouched: they were paid for by a
 *     PREVIOUS order, not the one being refunded.
 *   - Full refunds don't come here — onRefundProcessed cancels the whole
 *     entitlement instead.
 */
export async function clawbackResourcesForRefund(args: {
  orderId: string;
  /** Cumulative PROCESSED refund total for the order, paise. */
  refundedTotalPaise: number;
  orderTotalPaise: number;
  refundId?: string;
  receiptNumber?: string;
}): Promise<void> {
  if (args.orderTotalPaise <= 0) return;
  const fraction = Math.min(1, Math.max(0, args.refundedTotalPaise / args.orderTotalPaise));
  if (fraction <= 0) return;

  const ent = await prisma.entitlement.findFirst({
    where: { sourceOrderId: args.orderId },
    include: { resources: true },
  });
  if (!ent || ent.status !== EntitlementStatus.ACTIVE) return;

  let clawedAnything = false;
  await prisma.$transaction(async (tx) => {
    for (const res of ent.resources) {
      const prior = await tx.resourceLedger.aggregate({
        where: {
          entitlementResourceId: res.id,
          reason: ResourceLedgerReason.ADJUSTMENT,
          refType: 'REFUND_CLAWBACK',
        },
        _sum: { delta: true },
      });
      const alreadyClawed = Math.abs(prior._sum.delta ?? 0);
      const originalAllocated = res.allocated + alreadyClawed;
      const target = Math.round(originalAllocated * fraction);
      const deltaUnits = Math.max(0, target - alreadyClawed);
      if (deltaUnits === 0) continue;

      const floorAllocated = Math.max(0, res.consumed - res.carriedForward);
      const newAllocated = Math.max(floorAllocated, res.allocated - deltaUnits);
      const clawed = res.allocated - newAllocated;
      if (clawed <= 0) continue;

      // Optimistic lock on the current allocation — a concurrent consume
      // or second refund event loses cleanly; the next call reconciles
      // against the cumulative target.
      const updated = await tx.entitlementResource.updateMany({
        where: { id: res.id, allocated: res.allocated },
        data: { allocated: newAllocated },
      });
      if (updated.count === 0) continue;

      await tx.resourceLedger.create({
        data: {
          entitlementResourceId: res.id,
          userId: ent.userId,
          delta: -clawed,
          reason: ResourceLedgerReason.ADJUSTMENT,
          refType: 'REFUND_CLAWBACK',
          refId: args.refundId ?? args.orderId,
          notes: `Partial refund clawback — ${Math.round(fraction * 100)}% of order ${
            args.receiptNumber ?? args.orderId
          } refunded`,
        },
      });
      clawedAnything = true;
    }
  });

  if (clawedAnything) {
    void emitEntitlementChange(ent.userId, 'revoked');
    logger.info('entitlement.refund_clawback', {
      orderId: args.orderId,
      entitlementId: ent.id,
      refundedFraction: fraction,
      refundId: args.refundId,
    });
  }
}

// =====================================================================
// Cron / lifecycle
// =====================================================================

export async function expireOverdueEntitlements(): Promise<{
  expired: number;
  downgrades: number;
}> {
  const now = new Date();
  // Fetch the rows about to expire so we can apply pending downgrades after.
  const expiring = await prisma.entitlement.findMany({
    where: {
      status: EntitlementStatus.ACTIVE,
      validUntil: { lt: now },
    },
    select: { id: true, userId: true, planId: true },
  });
  const result = await prisma.entitlement.updateMany({
    where: {
      status: EntitlementStatus.ACTIVE,
      validUntil: { lt: now },
    },
    data: { status: EntitlementStatus.EXPIRED },
  });
  if (result.count > 0) {
    logger.info(`Expired ${result.count} overdue entitlements`);
  }

  // Apply any scheduled downgrades (§5.4)
  // Matured scheduled downgrades: send the "complete your switch" checkout
  // notification (one-time plans can't be auto-charged, so nothing is
  // granted here — see downgrade.service).
  let downgrades = 0;
  const { applyPendingDowngradeOnExpiry, sweepOrphanedPendingDowngrades } =
    await import('./downgrade.service');
  if (expiring.length > 0) {
    for (const ent of expiring) {
      try {
        const toPlanCode = await applyPendingDowngradeOnExpiry(ent.id);
        if (toPlanCode) downgrades += 1;
        void emitEntitlementChange(ent.userId, 'expired');
      } catch (err) {
        logger.error('applyPendingDowngradeOnExpiry failed', {
          entitlementId: ent.id,
          err: err instanceof Error ? err.message : err,
        });
      }
    }
  }

  // Catch-up: pending changes whose source entitlement already left ACTIVE
  // (crash between the EXPIRED flip and the loop above, supersede races).
  try {
    await sweepOrphanedPendingDowngrades();
  } catch (err) {
    logger.warn('sweepOrphanedPendingDowngrades failed', {
      err: err instanceof Error ? err.message : err,
    });
  }

  return { expired: result.count, downgrades };
}

export async function revokeEntitlement(args: {
  entitlementId: string;
  reason: string;
  revokedBy: string;
}): Promise<Entitlement> {
  const ent = await prisma.entitlement.findUnique({ where: { id: args.entitlementId } });
  if (!ent) throw new NotFoundError('Entitlement not found');
  const updated = await prisma.entitlement.update({
    where: { id: ent.id },
    data: {
      status: EntitlementStatus.CANCELLED,
      cancelledAt: new Date(),
      metadata: {
        ...(ent.metadata as Record<string, unknown> | null),
        revokedReason: args.reason,
        revokedBy: args.revokedBy,
      } as Prisma.InputJsonValue,
    },
  });
  // A pending scheduled downgrade on a revoked entitlement is moot.
  try {
    const { clearPendingDowngrade } = await import('./downgrade.service');
    await clearPendingDowngrade(ent.id);
  } catch {
    /* best-effort cleanup */
  }
  void emitEntitlementChange(ent.userId, 'revoked');
  return updated;
}

/**
 * Manually grant a bonus / promotional entitlement (super-admin tool).
 */
export async function manuallyGrantEntitlement(args: {
  userId: string;
  planId: string;
  validityDays: number;
  source?: EntitlementSource;
  notes?: string;
  createdBy: string;
}): Promise<Entitlement> {
  const plan = await prisma.plan.findUnique({
    where: { id: args.planId },
    include: { resources: true },
  });
  if (!plan) throw new NotFoundError('Plan not found');

  const validFrom = new Date();
  const validUntil = new Date(validFrom.getTime() + args.validityDays * 86_400_000);

  const created = await prisma.$transaction(async (tx) => {
    const ent = await tx.entitlement.create({
      data: {
        userId: args.userId,
        planId: plan.id,
        source: args.source ?? EntitlementSource.MANUAL,
        status: EntitlementStatus.ACTIVE,
        validFrom,
        validUntil,
        autoRenew: false,
        metadata: {
          notes: args.notes,
          grantedBy: args.createdBy,
        } as Prisma.InputJsonValue,
      },
    });
    if (plan.resources.length > 0) {
      await tx.entitlementResource.createMany({
        data: plan.resources.map((r) => ({
          entitlementId: ent.id,
          unit: r.unit,
          allocated: r.quantity,
          consumed: 0,
          carriedForward: 0,
        })),
      });
    }
    return ent;
  });
  void emitEntitlementChange(args.userId, 'granted');
  void (async () => {
    const { AuditService } = await import('./audit.service');
    await AuditService.log({
      action: 'BILLING_USER_PLAN_GRANTED',
      entity: 'Entitlement',
      entityId: created.id,
      performedBy: args.createdBy,
      details: {
        userId: args.userId,
        planId: plan.id,
        planCode: plan.code,
        validityDays: args.validityDays,
        source: args.source ?? EntitlementSource.MANUAL,
        notes: args.notes,
      },
    });
  })();
  return created;
}

// =====================================================================
// Real-time sync helpers
// =====================================================================

/**
 * Best-effort Socket.IO emit on entitlement change. Loaded lazily to avoid
 * circular deps with `socket.ts`.
 */
/**
 * Returns all userIds that share the billing pool with the given owner —
 * the owner themselves plus every ACTIVE team-member seat. Used to fan
 * out cache invalidation + socket events when entitlements change.
 */
async function getAllSeatUserIds(billingUserId: string): Promise<string[]> {
  const ids = new Set<string>([billingUserId]);
  try {
    const company = await prisma.companyProfile.findUnique({
      where: { userId: billingUserId },
      select: { id: true },
    });
    if (!company) return Array.from(ids);
    const seats = await prisma.employerTeamMember.findMany({
      where: {
        companyId: company.id,
        status: 'ACTIVE',
        userId: { not: null },
      },
      select: { userId: true },
    });
    for (const s of seats) {
      if (s.userId) ids.add(s.userId);
    }
  } catch {
    /* non-critical — fall through with just the owner id */
  }
  return Array.from(ids);
}

async function emitEntitlementChange(
  userId: string,
  reason: 'granted' | 'consumed' | 'restored' | 'expired' | 'revoked'
): Promise<void> {
  // Resolve to the billing pool first so cache invalidation hits the
  // shared key. Owners pass through unchanged; team members get redirected
  // to their company's owner id.
  const billingUserId = await resolveBillingUserId(userId);
  await invalidateEntitlementCache(billingUserId);

  // Fan out the socket event to every seat user so multi-seat teams see
  // real-time quota updates after one member consumes.
  const seatIds = await getAllSeatUserIds(billingUserId);
  try {
    const { getIO } = await import('../socket');
    const io = getIO();
    for (const id of seatIds) {
      io.to(`user:${id}`).emit('billing:entitlement:changed', {
        userId: id,
        reason,
        ts: Date.now(),
      });
    }
  } catch (err) {
    // Socket may not be initialised in tests — silent
    if (env.NODE_ENV !== 'test') {
      logger.debug('Socket emit (entitlement) skipped', {
        err: err instanceof Error ? err.message : err,
      });
    }
  }
  // Firestore counter mirror — best effort, owner only (mirror is keyed
  // on the owner anyway because the data is per-billing-pool).
  void mirrorToFirestore(billingUserId).catch(() => {});
  // Kafka fan-out — granted/consumed/expired only (restored/revoked have no topic).
  void emitEntitlementToKafka(billingUserId, reason).catch(() => {});
}

async function emitEntitlementToKafka(
  userId: string,
  reason: 'granted' | 'consumed' | 'restored' | 'expired' | 'revoked'
): Promise<void> {
  const { publishEvent } = await import('../kafka/producer');
  const { KafkaTopics } = await import('../kafka/topics');
  const topic =
    reason === 'granted'
      ? KafkaTopics.BILLING_ENTITLEMENT_GRANTED
      : reason === 'consumed'
        ? KafkaTopics.BILLING_ENTITLEMENT_CONSUMED
        : reason === 'expired'
          ? KafkaTopics.BILLING_ENTITLEMENT_EXPIRED
          : null;
  if (!topic) return;
  await publishEvent(topic, userId, { userId, reason });
}

async function mirrorToFirestore(userId: string): Promise<void> {
  try {
    const { firestore } = await import('../config/firebase');
    if (!firestore) return;
    const snapshot = await getActiveEntitlementsForUser(userId);
    await firestore.collection('users').doc(userId).collection('entitlements').doc('current').set(
      {
        features: snapshot.features,
        resources: snapshot.resources,
        nextExpiryAt: snapshot.nextExpiryAt,
        hasAnyActive: snapshot.hasAnyActive,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch {
    /* swallowed — firebase may be unconfigured locally */
  }
}

// AppError re-export keeps imports tidy
export { AppError };

// Type helper export
export type { Subscription };
