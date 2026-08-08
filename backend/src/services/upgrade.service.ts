/**
 * Plan upgrade / downgrade engine.
 *
 *   pro-rata: unused_value = old.totalPaise * (remaining_seconds / total_seconds)
 *   upgrade:  charge = max(new.basePricePaise - unused_value, 0)
 *   downgrade: scheduled at end of current period (no immediate refund)
 *   carry-forward: unused resource counts (CV unlocks, search hits) added
 *                  to the new entitlement, capped per-resource by SystemConfig
 *                  or PlanResource.carryForwardCap.
 *
 * Resolution is ENTITLEMENT-driven: the credit sums the remaining
 * time-value of EVERY active same-category entitlement the grant will
 * supersede (stacked top-ups included), carry-forward uses live
 * allocated + carried − consumed, and consumed units are deducted from
 * the new plan's allocation on upgrade-flow grants. Downgrades are never
 * executed here — they are scheduled at period end (downgrade.service).
 */
import { prisma } from '../config/prisma';
import {
  OrderStatus,
  PlanStatus,
  PlanBillingCycle,
  type Order,
  type Plan,
  type Prisma,
} from '@prisma/client';
import { getRazorpayClient, withRazorpaySpan } from '../config/razorpay';
import { computePricing } from './pricing.service';
import { nextReceiptNumber } from './receipt-sequence.service';
import { env } from '../config/env';
import { AppError, NotFoundError, BadRequestError } from '../exceptions';
import logger from '../config/logger';

// =====================================================================
// Types
// =====================================================================

export interface UpgradePreviewArgs {
  userId: string;
  /** New plan to upgrade/downgrade to. */
  toPlanCode: string;
  /** Buyer state code override (defaults to current order's snapshot). */
  buyerStateCode?: string;
  /** Whether buyer is Indian (defaults to current order's snapshot). */
  buyerIsIndian?: boolean;
}

export interface CarryForwardLine {
  unit: string;
  /** Unused units remaining across ALL plans this upgrade supersedes. */
  unused: number;
  /** Units in the new plan (per period). */
  newPeriodAllocation: number;
  /** Cap (config-driven). */
  cap: number | null;
  /** Final addition to new entitlement = min(unused, cap budget). */
  carried: number;
  /**
   * Units already consumed on the superseded plans, deducted from the new
   * plan's allocation (owner spec: the pro-rata credit assumes unused
   * time, so used resources are charged back in units).
   */
  usedDeducted: number;
  /** Effective allocation after deduction + carry. */
  effectiveAllocation: number;
}

export interface UpgradePreview {
  fromPlan: Pick<
    Plan,
    'id' | 'code' | 'name' | 'billingCycle' | 'basePricePaise' | 'validityDays' | 'currency'
  >;
  toPlan: Pick<
    Plan,
    | 'id'
    | 'code'
    | 'name'
    | 'billingCycle'
    | 'basePricePaise'
    | 'validityDays'
    | 'currency'
    | 'gstRatePercent'
    | 'gstInclusive'
  >;
  /**
   * The order behind the highest-tier plan being upgraded from. Null when
   * that entitlement has no backing order (admin/manual grants) — the
   * upgrade still works, it just contributes no monetary credit.
   */
  fromOrder: Pick<Order, 'id' | 'totalPaise' | 'paidAt' | 'currency' | 'placeOfSupplyState'> | null;
  /** Type of plan change. */
  changeType: 'UPGRADE' | 'DOWNGRADE' | 'SAME_PRICE_SWAP';
  /** Total seconds in the active period of the old plan. */
  totalSeconds: number;
  /** Seconds elapsed in the active period of the old plan. */
  elapsedSeconds: number;
  /** Remaining seconds in the active period. */
  remainingSeconds: number;
  /** Decimal ratio remaining (0..1). */
  remainingRatio: number;
  /** Pro-rata credit (paise). */
  unusedValuePaise: number;
  /** Charge after subtracting credit (paise) — never negative. */
  netChargePaise: number;
  /** Final pricing breakdown for the upgrade Order. */
  newOrderPricing: ReturnType<typeof computePricing>;
  /** Carry-forward per resource unit. */
  carryForward: CarryForwardLine[];
  /** Seconds the upgrade Order will activate when paid. */
  newValidityDays: number | null;
  warnings: string[];
}

// =====================================================================
// Resolve what an upgrade supersedes — ENTITLEMENT-driven
// =====================================================================

const SOURCE_ORDER_SELECT = {
  id: true,
  totalPaise: true,
  prorationPaise: true,
  paidAt: true,
  quantity: true,
  currency: true,
  placeOfSupplyState: true,
  buyerCountry: true,
} as const;

type UpgradeSourceEntitlement = Prisma.EntitlementGetPayload<{
  include: {
    resources: true;
    plan: { include: { resources: true } };
    sourceOrder: { select: typeof SOURCE_ORDER_SELECT };
  };
}>;

/**
 * Resolves the upgrade context from live ENTITLEMENTS (not orders):
 *
 *   - `fromEnt`: the highest-tier ACTIVE paid entitlement in the target
 *     category (tie: latest validFrom) — what the user is "on".
 *   - `superseded`: every ACTIVE paid entitlement the grant WILL cancel
 *     (different plan, tier <= new plan) — the exact mirror of
 *     grantEntitlementForOrder's supersede filter, so the credit the
 *     preview promises matches what the grant destroys.
 *
 * Entitlement-driven (vs the old latest-PAID-order shim) so that stacked
 * same-plan top-ups each contribute their remaining monetary value,
 * order-less grants (admin/manual) can still upgrade (zero credit), and
 * revoked/cancelled entitlements can't launder credit from their old
 * still-unexpired orders.
 */
async function resolveUpgradeContext(
  userId: string,
  newPlan: Plan
): Promise<{ fromEnt: UpgradeSourceEntitlement | null; superseded: UpgradeSourceEntitlement[] }> {
  const activeEnts = await prisma.entitlement.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      validUntil: { gt: new Date() },
      plan: { category: newPlan.category },
    },
    include: {
      resources: true,
      plan: { include: { resources: true } },
      sourceOrder: { select: SOURCE_ORDER_SELECT },
    },
  });
  const paid = activeEnts.filter((e) => e.plan.basePricePaise > 0);
  const fromEnt =
    [...paid].sort(
      (a, b) =>
        b.plan.basePricePaise - a.plan.basePricePaise ||
        b.validFrom.getTime() - a.validFrom.getTime()
    )[0] ?? null;
  const superseded = paid.filter(
    (e) => e.planId !== newPlan.id && e.plan.basePricePaise <= newPlan.basePricePaise
  );
  return { fromEnt, superseded };
}

/** Remaining fraction of an entitlement's validity window, clamped 0..1. */
function remainingRatioOf(ent: { validFrom: Date; validUntil: Date }, nowMs: number): number {
  const total = ent.validUntil.getTime() - ent.validFrom.getTime();
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, (ent.validUntil.getTime() - nowMs) / total));
}

// =====================================================================
// Preview
// =====================================================================

export async function previewUpgrade(args: UpgradePreviewArgs): Promise<UpgradePreview> {
  const newPlan = await prisma.plan.findFirst({
    where: { code: args.toPlanCode, status: PlanStatus.ACTIVE },
    include: { resources: true },
  });
  if (!newPlan) throw new NotFoundError(`Plan ${args.toPlanCode} not found / inactive`);
  if (newPlan.requiresQuote) {
    throw new BadRequestError(
      `Plan ${args.toPlanCode} is custom — submit a quote request instead.`
    );
  }

  const { fromEnt, superseded } = await resolveUpgradeContext(args.userId, newPlan);
  if (!fromEnt) {
    throw new BadRequestError(
      `No active paid plan found in category ${newPlan.category} to upgrade from. Buy the plan directly via /billing/orders.`
    );
  }
  if (fromEnt.planId === newPlan.id) {
    throw new BadRequestError(
      `Already on plan ${newPlan.code} — buy it again to top up credits instead.`
    );
  }
  if (newPlan.billingCycle !== PlanBillingCycle.ONE_TIME) {
    throw new BadRequestError(
      `Plan ${newPlan.code} is a subscription. Cancel current order and subscribe via /billing/subscriptions.`
    );
  }

  const nowMs = Date.now();

  // ----- Pro-rata math (display window = the highest-tier plan) -----
  const total = fromEnt.validUntil.getTime() - fromEnt.validFrom.getTime();
  const elapsed = Math.max(0, Math.min(total, nowMs - fromEnt.validFrom.getTime()));
  const remaining = Math.max(0, total - elapsed);
  const remainingRatio = total <= 0 ? 0 : remaining / total;

  // Monetary credit = Σ remaining time-value of EVERY entitlement this
  // upgrade supersedes (stacked top-ups included), not just the latest
  // order. Value basis per order is totalPaise + prorationPaise — the
  // gross worth of the order — so chained upgrades don't decay the credit
  // (a ₹666-net upgrade order still represents ₹999 of plan value).
  let unusedValue = 0;
  for (const e of superseded) {
    if (!e.sourceOrder) continue;
    const grossValue = e.sourceOrder.totalPaise + (e.sourceOrder.prorationPaise ?? 0);
    unusedValue += Math.round(grossValue * remainingRatioOf(e, nowMs));
  }

  const fromOrder = fromEnt.sourceOrder;
  const placeOfSupply =
    args.buyerStateCode ?? fromOrder?.placeOfSupplyState ?? env.HA_PLACE_OF_SUPPLY_DEFAULT_STATE;
  const buyerIsIndian = args.buyerIsIndian ?? (fromOrder ? fromOrder.buyerCountry !== null : true);

  const newOrderPricing = computePricing({
    plan: newPlan,
    buyerStateCode: placeOfSupply,
    buyerIsIndian,
    prorationCreditPaise: unusedValue,
  });

  // ----- Carry-forward + used-deduction, aggregated across EVERY plan
  // this upgrade supersedes (mirrors the grant exactly). Caps: lower of
  //   1. PlanResource.carryForwardCap (per-plan-per-unit, from seed)
  //   2. SystemConfig billing.carryforward.cap.<unit> (super-admin ceiling)
  // accumulated as cap × the superseded order's quantity per entitlement.
  const newResources = newPlan.resources;

  const sysCapRows = await prisma.systemConfig.findMany({
    where: { key: { startsWith: 'billing.carryforward.cap.' } },
  });
  const sysCaps = new Map<string, number>();
  for (const row of sysCapRows) {
    const unit = row.key.replace('billing.carryforward.cap.', '');
    const v = row.value as unknown as number | { cap?: number };
    const cap = typeof v === 'number' ? v : (v?.cap ?? 0);
    if (Number.isFinite(cap) && cap > 0) sysCaps.set(unit, cap);
  }

  const remainingSum = new Map<string, number>();
  const usedSum = new Map<string, number>();
  const capBudget = new Map<string, number | null>(); // null = uncapped
  for (const e of superseded) {
    const qty = Math.max(1, e.sourceOrder?.quantity ?? 1);
    for (const res of e.resources) {
      const newRes = newResources.find((r) => r.unit === res.unit);
      if (!newRes) continue;
      const oldPlanRes = e.plan.resources.find((r) => r.unit === res.unit);
      const planCap = newRes.carryForwardCap ?? oldPlanRes?.carryForwardCap ?? null;
      const sysCap = sysCaps.get(res.unit) ?? null;
      const cap =
        planCap !== null && sysCap !== null ? Math.min(planCap, sysCap) : (planCap ?? sysCap);

      remainingSum.set(
        res.unit,
        (remainingSum.get(res.unit) ?? 0) +
          Math.max(0, res.allocated + res.carriedForward - res.consumed)
      );
      usedSum.set(res.unit, (usedSum.get(res.unit) ?? 0) + res.consumed);
      if (cap === null || cap === undefined) {
        if (!capBudget.has(res.unit)) capBudget.set(res.unit, null);
      } else {
        const prev = capBudget.get(res.unit);
        capBudget.set(res.unit, prev === null ? null : (prev ?? 0) + cap * qty);
      }
    }
  }

  const carryForward: CarryForwardLine[] = [];
  for (const newRes of newResources) {
    if (!remainingSum.has(newRes.unit) && !usedSum.has(newRes.unit)) continue;
    const unused = remainingSum.get(newRes.unit) ?? 0;
    const budget = capBudget.get(newRes.unit) ?? null;
    const carried = budget === null ? unused : Math.min(unused, budget);
    const usedDeducted = Math.min(usedSum.get(newRes.unit) ?? 0, newRes.quantity);
    carryForward.push({
      unit: newRes.unit,
      unused,
      newPeriodAllocation: newRes.quantity,
      cap: budget,
      carried,
      usedDeducted,
      effectiveAllocation: Math.max(0, newRes.quantity - usedDeducted) + carried,
    });
  }

  let changeType: UpgradePreview['changeType'];
  if (newPlan.basePricePaise > fromEnt.plan.basePricePaise) changeType = 'UPGRADE';
  else if (newPlan.basePricePaise < fromEnt.plan.basePricePaise) changeType = 'DOWNGRADE';
  else changeType = 'SAME_PRICE_SWAP';

  const warnings: string[] = [];
  if (changeType === 'DOWNGRADE') {
    warnings.push(
      'Downgrades are scheduled at the end of the current period. The new plan activates after your current plan expires.'
    );
  }
  if (newOrderPricing.totalPaise === 0) {
    warnings.push('Pro-rata credit covers the full new plan price — no payment required.');
  }
  // Multi-quantity source orders can hold more remaining credit than the
  // new plan costs — anything beyond the payable amount is forfeited, so
  // say so up front instead of letting it vanish silently.
  if (unusedValue > newOrderPricing.prorationPaise) {
    const forfeited = unusedValue - newOrderPricing.prorationPaise;
    warnings.push(
      `Your remaining credit (${(unusedValue / 100).toFixed(2)} ${newOrderPricing.currency}) exceeds the new plan price — ${(forfeited / 100).toFixed(2)} ${newOrderPricing.currency} of it cannot be applied and will be forfeited.`
    );
  }
  // Multiple plans being retired? Spell it out — the user may not realise
  // a stacked top-up or second plan is part of this change.
  if (superseded.length > 1) {
    const names = [...new Set(superseded.map((e) => e.plan.name))].join(', ');
    warnings.push(
      `All your active ${names} plans will be retired by this change — their remaining value is included in the pro-rata credit above and unused credits carry forward (caps apply).`
    );
  }

  return {
    fromPlan: {
      id: fromEnt.plan.id,
      code: fromEnt.plan.code,
      name: fromEnt.plan.name,
      billingCycle: fromEnt.plan.billingCycle,
      basePricePaise: fromEnt.plan.basePricePaise,
      validityDays: fromEnt.plan.validityDays,
      currency: fromEnt.plan.currency,
    },
    toPlan: {
      id: newPlan.id,
      code: newPlan.code,
      name: newPlan.name,
      billingCycle: newPlan.billingCycle,
      basePricePaise: newPlan.basePricePaise,
      validityDays: newPlan.validityDays,
      currency: newPlan.currency,
      gstRatePercent: newPlan.gstRatePercent,
      gstInclusive: newPlan.gstInclusive,
    },
    fromOrder: fromOrder
      ? {
          id: fromOrder.id,
          totalPaise: fromOrder.totalPaise,
          paidAt: fromOrder.paidAt,
          currency: fromOrder.currency,
          placeOfSupplyState: fromOrder.placeOfSupplyState,
        }
      : null,
    changeType,
    totalSeconds: Math.floor(total / 1000),
    elapsedSeconds: Math.floor(elapsed / 1000),
    remainingSeconds: Math.floor(remaining / 1000),
    remainingRatio,
    unusedValuePaise: unusedValue,
    netChargePaise: newOrderPricing.totalPaise,
    newOrderPricing,
    carryForward,
    newValidityDays: newPlan.validityDays,
    warnings,
  };
}

// =====================================================================
// Execute upgrade — creates the new Order, links the old one
// =====================================================================

export interface ExecuteUpgradeArgs extends UpgradePreviewArgs {
  idempotencyKey: string;
  notes?: Record<string, string | number>;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
}

export interface ExecuteUpgradeResult {
  upgradeChangeId: string;
  order: Order;
  razorpay?: {
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    receipt: string;
  };
  /** Set if the pro-rata credit covered the full new plan price. */
  zeroAmountAutoApply: boolean;
  preview: UpgradePreview;
}

export async function executeUpgrade(args: ExecuteUpgradeArgs): Promise<ExecuteUpgradeResult> {
  const preview = await previewUpgrade(args);

  // Downgrades are NEVER executed immediately — they are scheduled at the
  // end of the current period (owner decision). Executing one here would
  // cancel the pricier plan today and forfeit its remaining credit.
  if (preview.changeType === 'DOWNGRADE') {
    throw new AppError(
      'Downgrades take effect at the end of your current period — schedule it via /billing/upgrade/downgrade/schedule instead.',
      400,
      'DOWNGRADE_NOT_IMMEDIATE'
    );
  }

  // Reject double-execute on same idempotency key
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey: args.idempotencyKey },
  });
  if (existing) {
    throw new AppError(
      'An upgrade with this Idempotency-Key is already in progress. Use a fresh key to retry.',
      409,
      'IDEMPOTENCY_KEY_REUSED'
    );
  }

  const newPlan = await prisma.plan.findUnique({ where: { id: preview.toPlan.id } });
  if (!newPlan) throw new NotFoundError('Plan disappeared between preview and execute');

  // An earlier abandoned/expired upgrade attempt may still hold the
  // upgradeFromOrderId pointer (it's @unique) — release it so this fresh
  // attempt can link to the source order. Pending attempts are cancelled;
  // terminal ones just lose the stale pointer.
  if (preview.fromOrder) {
    await prisma.order.updateMany({
      where: {
        upgradeFromOrderId: preview.fromOrder.id,
        status: { in: [OrderStatus.CREATED, OrderStatus.ATTEMPTED] },
      },
      data: { status: OrderStatus.CANCELLED, upgradeFromOrderId: null },
    });
    await prisma.order.updateMany({
      where: {
        upgradeFromOrderId: preview.fromOrder.id,
        status: { in: [OrderStatus.EXPIRED, OrderStatus.CANCELLED, OrderStatus.FAILED] },
      },
      data: { upgradeFromOrderId: null },
    });
  }

  // Use the order receipt prefix — invoice prefix is reserved for GST invoices.
  const receipt = await nextReceiptNumber('HA-ORD');

  // Zero-amount upgrades skip Razorpay (pro-rata covers everything)
  let razorpayOrderId: string | null = null;
  if (preview.netChargePaise > 0) {
    const client = getRazorpayClient();
    if (!client) throw new AppError('Razorpay not configured', 503, 'RAZORPAY_NOT_CONFIGURED');
    const rzpOrder = (await withRazorpaySpan(
      'orders.create',
      async () =>
        client.orders.create({
          amount: preview.netChargePaise,
          currency: preview.newOrderPricing.currency,
          receipt: receipt.formatted.slice(0, 40),
          notes: {
            ...(args.notes ?? {}),
            userId: args.userId,
            planCode: newPlan.code,
            planName: newPlan.name,
            upgradeFromOrderId: preview.fromOrder?.id ?? '',
          },
        }),
      { plan: newPlan.code, amount: preview.netChargePaise, type: 'upgrade' }
    )) as { id: string };
    razorpayOrderId = rzpOrder?.id ?? null;
    if (!razorpayOrderId) {
      throw new AppError('Razorpay order create failed', 502, 'RAZORPAY_BAD_RESPONSE');
    }
  }

  const expiresAt = new Date(Date.now() + env.BILLING_ORDER_EXPIRY_MINUTES * 60_000);

  const result = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        userId: args.userId,
        planId: newPlan.id,
        planSnapshot: {
          id: newPlan.id,
          code: newPlan.code,
          name: newPlan.name,
          slug: newPlan.slug,
          category: newPlan.category,
          billingCycle: newPlan.billingCycle,
          basePricePaise: newPlan.basePricePaise,
          currency: newPlan.currency,
          gstRatePercent: newPlan.gstRatePercent,
          gstInclusive: newPlan.gstInclusive,
          hsnCode: newPlan.hsnCode,
          validityDays: newPlan.validityDays,
        } as Prisma.InputJsonValue,
        originalAmountPaise: preview.newOrderPricing.originalAmountPaise,
        discountPaise: 0,
        // The APPLIED credit (clamped by computePricing to the payable
        // amount) — not the requested unusedValue, which can exceed the
        // new plan price when upgrading from a multi-quantity order and
        // would break the breakdown identity.
        prorationPaise: preview.newOrderPricing.prorationPaise,
        taxableAmountPaise: preview.newOrderPricing.taxableAmountPaise,
        cgstPaise: preview.newOrderPricing.cgstPaise,
        sgstPaise: preview.newOrderPricing.sgstPaise,
        igstPaise: preview.newOrderPricing.igstPaise,
        cessPaise: preview.newOrderPricing.cessPaise,
        taxPaise: preview.newOrderPricing.taxPaise,
        totalPaise: preview.newOrderPricing.totalPaise,
        currency: preview.newOrderPricing.currency,
        taxRegion: preview.newOrderPricing.taxRegion,
        status: preview.netChargePaise === 0 ? OrderStatus.PAID : OrderStatus.CREATED,
        channel: 'CHECKOUT',
        idempotencyKey: args.idempotencyKey,
        receiptNumber: receipt.formatted,
        razorpayOrderId,
        placeOfSupplyState: preview.fromOrder?.placeOfSupplyState ?? null,
        upgradeFromOrderId: preview.fromOrder?.id ?? null,
        notes: (args.notes ?? null) as Prisma.InputJsonValue,
        ipAddress: args.ipAddress ?? null,
        userAgent: args.userAgent ?? null,
        deviceFingerprint: args.deviceFingerprint ?? null,
        expiresAt: preview.netChargePaise === 0 ? null : expiresAt,
        paidAt: preview.netChargePaise === 0 ? new Date() : null,
      },
    });

    await tx.priceAdjustment.create({
      data: {
        orderId: newOrder.id,
        reason: 'PRORATION',
        amountPaise: -preview.newOrderPricing.prorationPaise,
        narration: `Pro-rata credit from ${preview.fromOrder ? `order ${preview.fromOrder.id}` : 'superseded plans'}`,
        createdById: args.userId,
        metadata: {
          fromOrderId: preview.fromOrder?.id ?? null,
          remainingRatio: preview.remainingRatio,
        } as Prisma.InputJsonValue,
      },
    });

    const upgradeChange = await tx.upgradeChange.create({
      data: {
        userId: args.userId,
        fromPlanId: preview.fromPlan.id,
        toPlanId: preview.toPlan.id,
        fromOrderId: preview.fromOrder?.id ?? null,
        toOrderId: newOrder.id,
        prorationPaise: preview.unusedValuePaise,
        carryForward: preview.carryForward as unknown as Prisma.InputJsonValue,
        snapshot: {
          remainingRatio: preview.remainingRatio,
          remainingSeconds: preview.remainingSeconds,
          totalSeconds: preview.totalSeconds,
          newOrderPricing: preview.newOrderPricing,
          changeType: preview.changeType,
        } as unknown as Prisma.InputJsonValue,
        createdById: args.userId,
      },
    });

    return { newOrder, upgradeChange };
  });

  logger.info('Upgrade order created', {
    upgradeChangeId: result.upgradeChange.id,
    newOrderId: result.newOrder.id,
    fromOrderId: preview.fromOrder?.id ?? null,
    netChargePaise: preview.netChargePaise,
  });

  // Zero-amount upgrades never touch Razorpay, so neither the payment
  // webhook nor /verify will ever fire for this order — the entitlement
  // grant and the GST invoice MUST happen here or they never happen at
  // all. Grant is awaited (the UI lands expecting the new plan active);
  // invoice issuance is best-effort like the /verify path.
  if (preview.netChargePaise === 0) {
    const [{ issueInvoiceForOrder }, { grantEntitlementForOrder }] = await Promise.all([
      import('./invoice.service'),
      import('./entitlement.service'),
    ]);
    try {
      await grantEntitlementForOrder(result.newOrder.id);
    } catch (err) {
      logger.error('Zero-amount upgrade entitlement grant failed', {
        orderId: result.newOrder.id,
        err: err instanceof Error ? err.message : err,
      });
    }
    void issueInvoiceForOrder(result.newOrder.id).catch((err) =>
      logger.error('Zero-amount upgrade invoice issue failed', {
        orderId: result.newOrder.id,
        err: err instanceof Error ? err.message : err,
      })
    );
  }

  // Zero-amount upgrade is auto-PAID inside the transaction above — fire the
  // UPGRADED notification immediately. Paid upgrades are notified later from
  // `payment.service.notifyPaymentCaptured` once the webhook lands.
  if (preview.netChargePaise === 0) {
    void (async () => {
      const { sendBillingNotification } = await import('./billing-notification.service');
      await sendBillingNotification({
        userId: args.userId,
        kind: 'UPGRADED',
        refType: 'ORDER',
        refId: result.newOrder.id,
        title: `Upgraded to ${preview.toPlan.name}`,
        message: `You've upgraded from ${preview.fromPlan.name} to ${preview.toPlan.name}.`,
        link: `/billing/subscriptions`,
        metadata: {
          planCode: newPlan.code,
          planName: newPlan.name,
          fromPlanName: preview.fromPlan.name,
          totalPaise: result.newOrder.totalPaise,
          prorationCreditPaise: preview.unusedValuePaise,
          receiptNumber: result.newOrder.receiptNumber,
        },
      });
    })().catch((err) =>
      logger.warn('UPGRADED notification (zero-amount) failed', {
        upgradeChangeId: result.upgradeChange.id,
        err: err instanceof Error ? err.message : err,
      })
    );
  }

  return {
    upgradeChangeId: result.upgradeChange.id,
    order: result.newOrder,
    razorpay: razorpayOrderId
      ? {
          keyId: env.RAZORPAY_KEY_ID!,
          orderId: razorpayOrderId,
          amount: preview.netChargePaise,
          currency: preview.newOrderPricing.currency,
          receipt: receipt.formatted,
        }
      : undefined,
    zeroAmountAutoApply: preview.netChargePaise === 0,
    preview,
  };
}
