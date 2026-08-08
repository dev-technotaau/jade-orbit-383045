/**
 * Downgrade scheduling — implements §5.4 of the plan.
 *
 * Downgrades are NOT immediate. Instead they are scheduled to take effect
 * at the end of the current billing period:
 *
 *   1. User picks "Downgrade to PLAN_X" in the upgrade UI.
 *   2. We persist a `SystemConfig` row keyed
 *      `pending_plan_change:<entitlementId>` with `{ toPlanId, effectiveAt }`.
 *   3. The user can cancel until 24h before period end.
 *   4. When the entitlement expires, the sweep sends the user a
 *      "complete your downgrade" notification with a checkout link for the
 *      target plan — one-time plans have no payment mandate, so the new
 *      period CANNOT be auto-charged and is NEVER granted for free.
 *
 * Stored under `SystemConfig` instead of a dedicated `PendingPlanChange`
 * table to avoid a Prisma migration. The shape is stable so we can promote
 * it to a real table later if needed.
 */
import { prisma } from '../config/prisma';
import { EntitlementStatus, PlanStatus, PlanBillingCycle } from '@prisma/client';
import { AppError, NotFoundError, BadRequestError } from '../exceptions';
import logger from '../config/logger';

const KEY_PREFIX = 'pending_plan_change:';

export interface PendingPlanChangePayload {
  fromEntitlementId: string;
  fromPlanId: string;
  toPlanId: string;
  toPlanCode: string;
  toPlanName?: string;
  scheduledAt: string;
  effectiveAt: string;
  scheduledBy: string;
  notes?: string;
  /** Locked window — once `effectiveAt - 24h` passes, can no longer cancel. */
  lockAfter: string;
}

function key(entitlementId: string): string {
  return `${KEY_PREFIX}${entitlementId}`;
}

export async function scheduleDowngrade(args: {
  userId: string;
  /** Explicit source entitlement; omitted = highest-tier active paid plan in the target's category. */
  fromEntitlementId?: string;
  toPlanId?: string;
  toPlanCode?: string;
  notes?: string;
}): Promise<PendingPlanChangePayload> {
  // Resolve target plan first (by id or code) — its category drives the
  // automatic source resolution.
  const toPlan = args.toPlanId
    ? await prisma.plan.findUnique({ where: { id: args.toPlanId } })
    : args.toPlanCode
      ? await prisma.plan.findUnique({ where: { code: args.toPlanCode } })
      : null;
  if (!toPlan) throw new NotFoundError('Target plan not found');

  // Target plan hardening — without these checks a "downgrade" could mint
  // ANY plan (archived, custom, pricier, cross-category) for free.
  if (toPlan.status !== PlanStatus.ACTIVE || !toPlan.isPublic) {
    throw new BadRequestError('Target plan is not available.');
  }
  if (toPlan.requiresQuote) {
    throw new BadRequestError('Custom plans cannot be a downgrade target — request a quote.');
  }
  if (toPlan.billingCycle !== PlanBillingCycle.ONE_TIME) {
    throw new BadRequestError('Subscriptions cannot be a downgrade target.');
  }
  if (toPlan.basePricePaise <= 0) {
    throw new BadRequestError(
      'No need to schedule a downgrade to a free plan — just let the current plan expire.'
    );
  }

  const ent = args.fromEntitlementId
    ? await prisma.entitlement.findFirst({
        where: { id: args.fromEntitlementId, userId: args.userId },
        include: { plan: true },
      })
    : // Auto-resolve: the highest-tier ACTIVE paid plan in the category.
      (
        await prisma.entitlement.findMany({
          where: {
            userId: args.userId,
            status: EntitlementStatus.ACTIVE,
            validUntil: { gt: new Date() },
            plan: { category: toPlan.category, basePricePaise: { gt: 0 } },
          },
          include: { plan: true },
        })
      ).sort(
        (a, b) =>
          b.plan.basePricePaise - a.plan.basePricePaise ||
          b.validFrom.getTime() - a.validFrom.getTime()
      )[0];
  if (!ent) throw new NotFoundError('Source entitlement not found');
  if (ent.status !== EntitlementStatus.ACTIVE) {
    throw new AppError('Only active entitlements can schedule a downgrade', 400, 'NOT_ACTIVE');
  }

  // Source/target relationship hardening.
  if (ent.plan.basePricePaise <= 0) {
    throw new BadRequestError('Free plans cannot schedule a downgrade — buy the plan directly.');
  }
  if (ent.plan.category !== toPlan.category) {
    throw new BadRequestError('Downgrade target must be in the same plan category.');
  }
  if (ent.planId === toPlan.id) {
    throw new BadRequestError('Already on this plan.');
  }
  if (toPlan.basePricePaise >= ent.plan.basePricePaise) {
    throw new BadRequestError(
      `${toPlan.name} is not a downgrade from ${ent.plan.name} — use the upgrade flow instead.`
    );
  }

  const lockAfter = new Date(ent.validUntil.getTime() - 24 * 60 * 60 * 1000);
  if (lockAfter.getTime() < Date.now()) {
    throw new AppError(
      'Less than 24h to period end — start a fresh purchase instead.',
      400,
      'WINDOW_TOO_LATE'
    );
  }

  const payload: PendingPlanChangePayload = {
    fromEntitlementId: ent.id,
    fromPlanId: ent.planId,
    toPlanId: toPlan.id,
    toPlanCode: toPlan.code,
    toPlanName: toPlan.name,
    scheduledAt: new Date().toISOString(),
    effectiveAt: ent.validUntil.toISOString(),
    scheduledBy: args.userId,
    notes: args.notes,
    lockAfter: lockAfter.toISOString(),
  };

  await prisma.systemConfig.upsert({
    where: { key: key(ent.id) },
    create: {
      key: key(ent.id),
      value: payload as unknown as object,
      updatedBy: args.userId,
    },
    update: {
      value: payload as unknown as object,
      updatedBy: args.userId,
    },
  });

  logger.info('Pending plan change scheduled', {
    entitlementId: ent.id,
    toPlanCode: toPlan.code,
    effectiveAt: payload.effectiveAt,
  });
  return payload;
}

export async function getPendingDowngrade(args: {
  userId: string;
  entitlementId: string;
}): Promise<PendingPlanChangePayload | null> {
  const ent = await prisma.entitlement.findFirst({
    where: { id: args.entitlementId, userId: args.userId },
  });
  if (!ent) return null;
  const row = await prisma.systemConfig.findUnique({ where: { key: key(args.entitlementId) } });
  if (!row) return null;
  return row.value as unknown as PendingPlanChangePayload;
}

export async function cancelPendingDowngrade(args: {
  userId: string;
  entitlementId: string;
}): Promise<void> {
  const ent = await prisma.entitlement.findFirst({
    where: { id: args.entitlementId, userId: args.userId },
  });
  if (!ent) throw new NotFoundError('Entitlement not found');
  const row = await prisma.systemConfig.findUnique({ where: { key: key(args.entitlementId) } });
  if (!row) throw new NotFoundError('No pending downgrade');
  const pending = row.value as unknown as PendingPlanChangePayload;
  // The 24h lock only applies while the source plan is still ACTIVE — a
  // pending change against a superseded/expired entitlement is an orphan
  // and must always be cancellable.
  if (
    ent.status === EntitlementStatus.ACTIVE &&
    new Date(pending.lockAfter).getTime() < Date.now()
  ) {
    throw new AppError('Downgrade is locked (within 24h of effective time).', 400, 'LOCKED');
  }
  await prisma.systemConfig.delete({ where: { key: key(args.entitlementId) } }).catch(() => null);
}

/**
 * Internal cleanup — drops a pending change without ownership/lock checks.
 * Called when the source entitlement is superseded or revoked, making the
 * scheduled change moot.
 */
export async function clearPendingDowngrade(entitlementId: string): Promise<void> {
  await prisma.systemConfig.delete({ where: { key: key(entitlementId) } }).catch(() => null);
}

/**
 * Called by the expiry sweep when an entitlement with a pending downgrade
 * expires. One-time plans have no payment mandate, so the new period can
 * NOT be auto-charged — instead of granting the plan free (a revenue
 * hole), we notify the user with a checkout link to complete the switch.
 *
 * Returns the target plan code when a notification was sent, else null.
 */
export async function applyPendingDowngradeOnExpiry(entitlementId: string): Promise<string | null> {
  const row = await prisma.systemConfig.findUnique({ where: { key: key(entitlementId) } });
  if (!row) return null;
  const payload = row.value as unknown as PendingPlanChangePayload;

  const ent = await prisma.entitlement.findUnique({ where: { id: entitlementId } });
  if (!ent) {
    // Expired entitlement gone — clean up
    await clearPendingDowngrade(entitlementId);
    return null;
  }

  const plan = await prisma.plan.findUnique({ where: { id: payload.toPlanId } });
  if (!plan || plan.status !== PlanStatus.ACTIVE) {
    logger.warn('applyPendingDowngradeOnExpiry: target plan missing/inactive', { entitlementId });
    await clearPendingDowngrade(entitlementId);
    return null;
  }

  try {
    const { sendBillingNotification } = await import('./billing-notification.service');
    await sendBillingNotification({
      userId: ent.userId,
      kind: 'DOWNGRADED',
      refType: 'ENTITLEMENT',
      refId: ent.id,
      title: `Complete your switch to ${plan.name}`,
      message: `Your previous plan has ended. Finish checkout to start your scheduled ${plan.name} plan.`,
      link: `/billing/checkout/${encodeURIComponent(plan.code)}`,
      metadata: {
        planCode: plan.code,
        planName: plan.name,
        scheduledAt: payload.scheduledAt,
        fromEntitlementId: ent.id,
      },
    });
  } catch (err) {
    logger.warn('Downgrade-ready notification failed', {
      entitlementId,
      err: err instanceof Error ? err.message : err,
    });
  }

  await clearPendingDowngrade(entitlementId);

  logger.info('Pending downgrade matured — checkout notification sent', {
    fromEntitlementId: ent.id,
    toPlanCode: plan.code,
  });
  return plan.code;
}

/**
 * Catch-up sweep for pending plan changes whose source entitlement is no
 * longer ACTIVE (worker crashed between the EXPIRED flip and the apply
 * loop, or the entitlement was cancelled/superseded out-of-band). EXPIRED
 * sources still get their "complete your downgrade" notification;
 * CANCELLED/REVOKED sources just lose the now-moot row.
 */
export async function sweepOrphanedPendingDowngrades(): Promise<number> {
  const rows = await prisma.systemConfig.findMany({
    where: { key: { startsWith: KEY_PREFIX } },
  });
  let handled = 0;
  for (const row of rows) {
    const entitlementId = row.key.slice(KEY_PREFIX.length);
    try {
      const ent = await prisma.entitlement.findUnique({ where: { id: entitlementId } });
      if (!ent) {
        await clearPendingDowngrade(entitlementId);
        handled += 1;
        continue;
      }
      if (ent.status === EntitlementStatus.ACTIVE) continue; // not matured yet
      if (ent.status === EntitlementStatus.EXPIRED) {
        await applyPendingDowngradeOnExpiry(entitlementId);
      } else {
        // CANCELLED / ON_HOLD / EXHAUSTED — the scheduled change is moot.
        await clearPendingDowngrade(entitlementId);
      }
      handled += 1;
    } catch (err) {
      logger.warn('sweepOrphanedPendingDowngrades failed for row', {
        entitlementId,
        err: err instanceof Error ? err.message : err,
      });
    }
  }
  return handled;
}
