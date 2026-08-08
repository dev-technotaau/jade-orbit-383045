/**
 * Coupon engine.
 *
 *   - Public: validate / preview discount on a plan + cart
 *   - Super-admin CRUD
 *   - Internal: record redemption (called by order.service on order create)
 *               reverse redemption (called on refund)
 *
 * Validation chain (all must pass):
 *   1. Coupon exists, status ACTIVE
 *   2. Within startsAt..endsAt window
 *   3. Order amount ≥ minOrderAmountPaise
 *   4. Plan in allowedPlans (or list empty), not in excludedPlans
 *   5. Role / user is whitelisted (or scope=GLOBAL)
 *   6. Global redemption count < maxRedemptions
 *   7. Per-user redemption count < maxRedemptionsPerUser
 *
 * Pricing: see `pricing.service.computeCouponDiscount()` for the math.
 */
import { prisma } from '../config/prisma';
import {
  Prisma,
  CouponStatus,
  CouponRedemptionStatus,
  type Coupon,
  type Plan,
  type Role,
} from '@prisma/client';
import { AppError, NotFoundError, ConflictError, BadRequestError } from '../exceptions';
import logger from '../config/logger';
import { computeCouponDiscount } from './pricing.service';

// =====================================================================
// Validation
// =====================================================================

export interface ValidateCouponArgs {
  code: string;
  userId: string;
  planCode: string;
  /** Pre-discount amount in paise (typically `plan.basePricePaise`). */
  orderAmountPaise: number;
}

export interface ValidatedCoupon {
  coupon: Coupon;
  /** Discount in paise (already capped at orderAmount). */
  discountPaise: number;
  /** Trial extension days (only set for `TRIAL_EXTEND` coupons). */
  trialExtendDays: number | null;
}

export async function validateCoupon(args: ValidateCouponArgs): Promise<ValidatedCoupon> {
  const code = args.code.trim().toUpperCase();
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon) throw new NotFoundError(`Coupon ${args.code} not found`);
  if (coupon.status !== CouponStatus.ACTIVE) {
    throw new BadRequestError(`Coupon ${args.code} is ${coupon.status.toLowerCase()}`);
  }
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    throw new BadRequestError(`Coupon ${args.code} is not yet active`);
  }
  if (coupon.endsAt && coupon.endsAt < now) {
    throw new BadRequestError(`Coupon ${args.code} has expired`);
  }
  if (args.orderAmountPaise < coupon.minOrderAmountPaise) {
    throw new BadRequestError(
      `Coupon ${args.code} requires a minimum order amount of ₹${coupon.minOrderAmountPaise / 100}`
    );
  }

  // Plan / role / user scoping
  const plan = await prisma.plan.findUnique({ where: { code: args.planCode } });
  if (!plan) throw new NotFoundError(`Plan ${args.planCode} not found`);
  if (coupon.allowedPlanIds.length > 0 && !coupon.allowedPlanIds.includes(plan.id)) {
    throw new BadRequestError(`Coupon ${args.code} is not valid for plan ${args.planCode}`);
  }
  if (coupon.excludedPlanIds.includes(plan.id)) {
    throw new BadRequestError(`Coupon ${args.code} is excluded for plan ${args.planCode}`);
  }

  if (coupon.allowedUserIds.length > 0 && !coupon.allowedUserIds.includes(args.userId)) {
    throw new BadRequestError(`Coupon ${args.code} is not valid for this account`);
  }
  if (coupon.allowedRoles.length > 0) {
    const user = await prisma.user.findUnique({
      where: { id: args.userId },
      select: { role: true },
    });
    if (!user) throw new BadRequestError('User not found');
    if (!coupon.allowedRoles.includes(user.role)) {
      throw new BadRequestError(`Coupon ${args.code} is not valid for your account type`);
    }
  }

  // Redemption caps
  if (coupon.maxRedemptions !== null && coupon.redemptionsCount >= coupon.maxRedemptions) {
    throw new BadRequestError(`Coupon ${args.code} has reached its redemption limit`);
  }
  const userRedemptions = await prisma.couponRedemption.count({
    where: {
      couponId: coupon.id,
      userId: args.userId,
      status: CouponRedemptionStatus.SUCCESS,
    },
  });
  if (userRedemptions >= coupon.maxRedemptionsPerUser) {
    throw new BadRequestError(
      `You've already used coupon ${args.code} the maximum number of times`
    );
  }

  const discount = computeCouponDiscount(args.orderAmountPaise, coupon);

  return {
    coupon,
    discountPaise: discount,
    trialExtendDays: coupon.type === 'TRIAL_EXTEND' ? coupon.trialExtendDays : null,
  };
}

// =====================================================================
// Redemption (internal — called from order.service)
// =====================================================================

export async function recordRedemption(args: {
  couponId: string;
  userId: string;
  orderId: string;
  discountPaise: number;
}): Promise<void> {
  await prisma.$transaction([
    prisma.couponRedemption.create({
      data: {
        couponId: args.couponId,
        userId: args.userId,
        orderId: args.orderId,
        discountPaise: args.discountPaise,
        status: CouponRedemptionStatus.SUCCESS,
      },
    }),
    prisma.coupon.update({
      where: { id: args.couponId },
      data: { redemptionsCount: { increment: 1 } },
    }),
  ]);
  logger.info('Coupon redeemed', {
    couponId: args.couponId,
    userId: args.userId,
    orderId: args.orderId,
    discountPaise: args.discountPaise,
  });

  // Kafka fan-out for the coupon-redeemed event (downstream services).
  void (async () => {
    const { publishEvent } = await import('../kafka/producer');
    const { KafkaTopics } = await import('../kafka/topics');
    await publishEvent(KafkaTopics.BILLING_COUPON_REDEEMED, args.userId, {
      userId: args.userId,
      couponId: args.couponId,
      orderId: args.orderId,
      discountPaise: args.discountPaise,
    });
  })().catch(() => {});
}

export async function reverseRedemption(orderId: string): Promise<void> {
  const redemption = await prisma.couponRedemption.findUnique({
    where: { orderId },
  });
  if (!redemption || redemption.status !== CouponRedemptionStatus.SUCCESS) return;
  await prisma.$transaction([
    prisma.couponRedemption.update({
      where: { id: redemption.id },
      data: { status: CouponRedemptionStatus.REVERSED },
    }),
    prisma.coupon.update({
      where: { id: redemption.couponId },
      data: { redemptionsCount: { decrement: 1 } },
    }),
  ]);
  logger.info('Coupon redemption reversed', { redemptionId: redemption.id });
}

// =====================================================================
// Super-admin CRUD
// =====================================================================

export interface CreateCouponInput {
  code: string;
  name: string;
  type: Coupon['type'];
  valuePaise?: number | null;
  valuePercent?: number | null;
  maxDiscountPaise?: number | null;
  trialExtendDays?: number | null;
  scope?: Coupon['scope'];
  status?: CouponStatus;
  startsAt?: Date | null;
  endsAt?: Date | null;
  maxRedemptions?: number | null;
  maxRedemptionsPerUser?: number;
  minOrderAmountPaise?: number;
  allowedPlanIds?: string[];
  excludedPlanIds?: string[];
  allowedRoles?: Role[];
  allowedUserIds?: string[];
  comboAllowed?: boolean;
  stackable?: boolean;
  autoApply?: boolean;
  descriptionHtml?: string | null;
  internalNotes?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export type UpdateCouponInput = Partial<CreateCouponInput>;

export async function createCoupon(
  input: CreateCouponInput,
  createdById?: string
): Promise<Coupon> {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
    throw new BadRequestError('Coupon code must be 3-40 chars, A-Z 0-9 _ -');
  }
  const existing = await prisma.coupon.findUnique({ where: { code } });
  if (existing) throw new ConflictError(`Coupon ${code} already exists`);

  // Type-specific validation
  if (
    input.type === 'PERCENT' &&
    (input.valuePercent === null || input.valuePercent === undefined)
  ) {
    throw new BadRequestError('PERCENT coupons require valuePercent');
  }
  if (input.type === 'FLAT' && (input.valuePaise === null || input.valuePaise === undefined)) {
    throw new BadRequestError('FLAT coupons require valuePaise');
  }
  if (input.type === 'TRIAL_EXTEND' && !input.trialExtendDays) {
    throw new BadRequestError('TRIAL_EXTEND coupons require trialExtendDays');
  }

  const coupon = await prisma.coupon.create({
    data: {
      code,
      name: input.name,
      type: input.type,
      valuePaise: input.valuePaise ?? null,
      valuePercent: input.valuePercent ?? null,
      maxDiscountPaise: input.maxDiscountPaise ?? null,
      trialExtendDays: input.trialExtendDays ?? null,
      scope: input.scope ?? 'GLOBAL',
      status: input.status ?? CouponStatus.ACTIVE,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      maxRedemptions: input.maxRedemptions ?? null,
      maxRedemptionsPerUser: input.maxRedemptionsPerUser ?? 1,
      minOrderAmountPaise: input.minOrderAmountPaise ?? 0,
      allowedPlanIds: input.allowedPlanIds ?? [],
      excludedPlanIds: input.excludedPlanIds ?? [],
      allowedRoles: input.allowedRoles ?? [],
      allowedUserIds: input.allowedUserIds ?? [],
      comboAllowed: input.comboAllowed ?? false,
      stackable: input.stackable ?? false,
      autoApply: input.autoApply ?? false,
      descriptionHtml: input.descriptionHtml ?? null,
      internalNotes: input.internalNotes ?? null,
      metadata: input.metadata ?? Prisma.JsonNull,
      createdById: createdById ?? null,
    },
  });
  void (async () => {
    const { AuditService } = await import('./audit.service');
    await AuditService.log({
      action: 'BILLING_COUPON_CREATED',
      entity: 'Coupon',
      entityId: coupon.id,
      performedBy: createdById ?? 'system',
      details: {
        code: coupon.code,
        type: coupon.type,
        valuePercent: coupon.valuePercent,
        valuePaise: coupon.valuePaise,
        scope: coupon.scope,
      },
    });
  })();
  return coupon;
}

export async function updateCoupon(id: string, input: UpdateCouponInput): Promise<Coupon> {
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Coupon not found');

  const data: Prisma.CouponUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.type !== undefined) data.type = input.type;
  if (input.valuePaise !== undefined) data.valuePaise = input.valuePaise;
  if (input.valuePercent !== undefined) data.valuePercent = input.valuePercent;
  if (input.maxDiscountPaise !== undefined) data.maxDiscountPaise = input.maxDiscountPaise;
  if (input.trialExtendDays !== undefined) data.trialExtendDays = input.trialExtendDays;
  if (input.scope !== undefined) data.scope = input.scope;
  if (input.status !== undefined) data.status = input.status;
  if (input.startsAt !== undefined) data.startsAt = input.startsAt;
  if (input.endsAt !== undefined) data.endsAt = input.endsAt;
  if (input.maxRedemptions !== undefined) data.maxRedemptions = input.maxRedemptions;
  if (input.maxRedemptionsPerUser !== undefined) {
    data.maxRedemptionsPerUser = input.maxRedemptionsPerUser;
  }
  if (input.minOrderAmountPaise !== undefined) data.minOrderAmountPaise = input.minOrderAmountPaise;
  if (input.allowedPlanIds !== undefined) data.allowedPlanIds = input.allowedPlanIds;
  if (input.excludedPlanIds !== undefined) data.excludedPlanIds = input.excludedPlanIds;
  if (input.allowedRoles !== undefined) data.allowedRoles = input.allowedRoles;
  if (input.allowedUserIds !== undefined) data.allowedUserIds = input.allowedUserIds;
  if (input.comboAllowed !== undefined) data.comboAllowed = input.comboAllowed;
  if (input.stackable !== undefined) data.stackable = input.stackable;
  if (input.autoApply !== undefined) data.autoApply = input.autoApply;
  if (input.descriptionHtml !== undefined) data.descriptionHtml = input.descriptionHtml;
  if (input.internalNotes !== undefined) data.internalNotes = input.internalNotes;
  if (input.metadata !== undefined) data.metadata = input.metadata;

  return prisma.coupon.update({ where: { id }, data });
}

export async function archiveCoupon(id: string): Promise<Coupon> {
  return prisma.coupon.update({
    where: { id },
    data: { status: CouponStatus.ARCHIVED },
  });
}

export async function listCouponsAdmin(args: {
  status?: CouponStatus;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: Coupon[]; total: number }> {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));
  const where: Prisma.CouponWhereInput = {};
  if (args.status) where.status = args.status;
  if (args.search) {
    where.OR = [
      { code: { contains: args.search.toUpperCase() } },
      { name: { contains: args.search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await prisma.$transaction([
    prisma.coupon.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.coupon.count({ where }),
  ]);
  return { items, total };
}

export async function getCouponAdmin(id: string): Promise<
  Coupon & {
    recentRedemptions: {
      id: string;
      userId: string;
      orderId: string | null;
      redeemedAt: Date;
      discountPaise: number;
      status: CouponRedemptionStatus;
    }[];
  }
> {
  const coupon = await prisma.coupon.findUnique({
    where: { id },
    include: {
      redemptions: {
        orderBy: { redeemedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          userId: true,
          orderId: true,
          redeemedAt: true,
          discountPaise: true,
          status: true,
        },
      },
    },
  });
  if (!coupon) throw new NotFoundError('Coupon not found');
  const { redemptions, ...rest } = coupon;
  return { ...rest, recentRedemptions: redemptions };
}

// =====================================================================
// Helpers
// =====================================================================

/** Check whether a plan is eligible for a coupon (used by /apply preview). */
export async function findApplicableCoupons(planId: string, userId: string): Promise<Coupon[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return [];
  const candidates = await prisma.coupon.findMany({
    where: {
      status: CouponStatus.ACTIVE,
      autoApply: true,
      OR: [{ allowedPlanIds: { has: planId } }, { allowedPlanIds: { isEmpty: true } }],
      AND: [
        {
          OR: [{ allowedRoles: { isEmpty: true } }, { allowedRoles: { has: user.role as Role } }],
        },
        {
          OR: [{ allowedUserIds: { isEmpty: true } }, { allowedUserIds: { has: userId } }],
        },
      ],
    },
    orderBy: { valuePercent: 'desc' },
  });
  return candidates;
}

// =====================================================================
// Best-coupon picker — implements §5.6 "Auto-apply: best-coupon picker"
//
// Walks the auto-apply candidate set, runs the full validation chain on
// each (so a coupon that's date-expired or quota-exhausted is skipped),
// computes the discount each would give for THIS plan + amount, and
// returns the single coupon producing the largest discount in paise.
//
// Returns null when no auto-apply coupon is currently usable.
// =====================================================================
export async function pickBestCouponForOrder(args: {
  userId: string;
  planId: string;
  planCode: string;
  orderAmountPaise: number;
}): Promise<{ coupon: Coupon; discountPaise: number; trialExtendDays: number | null } | null> {
  const candidates = await findApplicableCoupons(args.planId, args.userId);
  if (candidates.length === 0) return null;

  const { computeCouponDiscount } = await import('./pricing.service');
  let best: { coupon: Coupon; discountPaise: number; trialExtendDays: number | null } | null = null;

  for (const candidate of candidates) {
    try {
      // Re-run the full validation chain — date range, redemption caps,
      // role/user lists, etc. Skips silently on first failure.
      const validated = await validateCoupon({
        code: candidate.code,
        userId: args.userId,
        planCode: args.planCode,
        orderAmountPaise: args.orderAmountPaise,
      });
      const candidateDiscount =
        validated.discountPaise ?? computeCouponDiscount(args.orderAmountPaise, validated.coupon);
      if (candidateDiscount <= 0) continue;
      if (!best || candidateDiscount > best.discountPaise) {
        best = {
          coupon: validated.coupon,
          discountPaise: candidateDiscount,
          trialExtendDays: validated.trialExtendDays ?? null,
        };
      }
    } catch {
      // Validation failed — skip this candidate
      continue;
    }
  }

  return best;
}

// Light helper for typing
export type { Coupon as CouponRow, Plan as PlanRow };

// AppError re-export keeps imports tidy for service consumers
export { AppError };
