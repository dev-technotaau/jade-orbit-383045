import type { Request, Response, NextFunction } from 'express';
import * as CouponService from '../services/coupon.service';
import { success, created, noContent } from '../utils/response';
import prisma from '../config/prisma';
import { assertUnmodified } from '../utils/optimistic-lock';

interface ValidateBody {
  code: string;
  planCode: string;
  orderAmountPaise: number;
}

interface CreateBody {
  code: string;
  name: string;
  type: CouponService.CreateCouponInput['type'];
  valuePaise?: number | null;
  valuePercent?: number | null;
  maxDiscountPaise?: number | null;
  trialExtendDays?: number | null;
  scope?: CouponService.CreateCouponInput['scope'];
  status?: CouponService.CreateCouponInput['status'];
  startsAt?: string;
  endsAt?: string;
  maxRedemptions?: number | null;
  maxRedemptionsPerUser?: number;
  minOrderAmountPaise?: number;
  allowedPlanIds?: string[];
  excludedPlanIds?: string[];
  allowedRoles?: CouponService.CreateCouponInput['allowedRoles'];
  allowedUserIds?: string[];
  comboAllowed?: boolean;
  stackable?: boolean;
  autoApply?: boolean;
  descriptionHtml?: string | null;
  internalNotes?: string | null;
}

interface ListQuery {
  status?: CouponService.CreateCouponInput['status'];
  search?: string;
  page?: number;
  limit?: number;
}

// =====================================================================
// Public endpoints (authenticated users)
// =====================================================================

export const validateCoupon = async (
  req: Request<unknown, unknown, ValidateBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validated = await CouponService.validateCoupon({
      code: req.body.code,
      userId: req.user!.id,
      planCode: req.body.planCode,
      orderAmountPaise: req.body.orderAmountPaise,
    });
    success(
      res,
      {
        code: validated.coupon.code,
        type: validated.coupon.type,
        scope: validated.coupon.scope,
        discountPaise: validated.discountPaise,
        trialExtendDays: validated.trialExtendDays,
        descriptionHtml: validated.coupon.descriptionHtml,
      },
      'Coupon valid'
    );
  } catch (err) {
    next(err);
  }
};

/**
 * /apply — same eligibility check as /validate, returned with a short-lived
 * apply token the FE stores in `billing.store` and forwards to the order
 * create call. The token is purely a frontend hint; the order-create call
 * re-validates server-side, so it can't be forged to grant a discount.
 */
export const applyCoupon = async (
  req: Request<unknown, unknown, ValidateBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const validated = await CouponService.validateCoupon({
      code: req.body.code,
      userId: req.user!.id,
      planCode: req.body.planCode,
      orderAmountPaise: req.body.orderAmountPaise,
    });
    success(
      res,
      {
        code: validated.coupon.code,
        type: validated.coupon.type,
        scope: validated.coupon.scope,
        discountPaise: validated.discountPaise,
        trialExtendDays: validated.trialExtendDays,
        descriptionHtml: validated.coupon.descriptionHtml,
        applied: true as const,
        appliedAt: new Date().toISOString(),
      },
      'Coupon applied — finish checkout to redeem'
    );
  } catch (err) {
    next(err);
  }
};

// =====================================================================
// Super-admin
// =====================================================================

export const createCoupon = async (
  req: Request<unknown, unknown, CreateBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const coupon = await CouponService.createCoupon(
      {
        ...req.body,
        startsAt: req.body.startsAt ? new Date(req.body.startsAt) : null,
        endsAt: req.body.endsAt ? new Date(req.body.endsAt) : null,
      },
      req.user!.id
    );
    created(res, coupon, 'Coupon created');
  } catch (err) {
    next(err);
  }
};

export const updateCoupon = async (
  req: Request<{ id: string }, unknown, Partial<CreateBody> & { expectedUpdatedAt?: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { expectedUpdatedAt, ...body } = req.body;

    // Whole-form replace, same as plans — a concurrent edit would silently
    // revert someone's discount or validity window.
    const current = await prisma.coupon.findUnique({
      where: { id: req.params.id },
      select: { updatedAt: true },
    });
    assertUnmodified(current, expectedUpdatedAt, 'Coupon');

    const coupon = await CouponService.updateCoupon(req.params.id, {
      ...body,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
    });
    success(res, coupon, 'Coupon updated');
  } catch (err) {
    next(err);
  }
};

export const archiveCoupon = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await CouponService.archiveCoupon(req.params.id);
    noContent(res);
  } catch (err) {
    next(err);
  }
};

export const listCouponsAdmin = async (
  req: Request<unknown, unknown, unknown, ListQuery>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await CouponService.listCouponsAdmin({
      status: req.query.status,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({
      success: true,
      data: {
        items: result.items,
        total: result.total,
        page: req.query.page ?? 1,
        limit: req.query.limit ?? 50,
      },
      message: 'Coupons fetched',
    });
  } catch (err) {
    next(err);
  }
};

export const getCouponAdmin = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const coupon = await CouponService.getCouponAdmin(req.params.id);
    success(res, coupon, 'Coupon fetched');
  } catch (err) {
    next(err);
  }
};
