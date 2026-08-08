import { Router } from 'express';
import { z } from 'zod';
import * as CouponController from '../controllers/coupon.controller';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { requirePermission } from '../middleware/require-permission';
import { trackAdminActivity } from '../middleware/admin-activity';
import { Role, CouponType, CouponStatus, CouponScope } from '@prisma/client';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';

const validateBodySchema = z.object({
  code: z.string().min(3).max(40),
  planCode: z.string().min(2).max(64),
  orderAmountPaise: z.number().int().min(0),
});

const createCouponSchema = z.object({
  code: z.string().min(3).max(40),
  name: z.string().min(2).max(120),
  type: z.enum(CouponType),
  valuePaise: z.number().int().min(0).nullable().optional(),
  valuePercent: z.number().int().min(0).max(100).nullable().optional(),
  maxDiscountPaise: z.number().int().min(0).nullable().optional(),
  trialExtendDays: z.number().int().min(0).max(365).nullable().optional(),
  scope: z.enum(CouponScope).optional(),
  status: z.enum(CouponStatus).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  maxRedemptions: z.number().int().min(1).nullable().optional(),
  maxRedemptionsPerUser: z.number().int().min(1).optional(),
  minOrderAmountPaise: z.number().int().min(0).optional(),
  allowedPlanIds: z.array(z.string().uuid()).optional(),
  excludedPlanIds: z.array(z.string().uuid()).optional(),
  allowedRoles: z.array(z.enum(Role)).optional(),
  allowedUserIds: z.array(z.string().uuid()).optional(),
  comboAllowed: z.boolean().optional(),
  stackable: z.boolean().optional(),
  autoApply: z.boolean().optional(),
  descriptionHtml: z.string().max(20000).nullable().optional(),
  internalNotes: z.string().max(2000).nullable().optional(),
});

/**
 * Optimistic-concurrency token: the `updatedAt` the editor loaded.
 *
 * MUST be declared on the schema. Zod strips unknown keys on parse, and
 * `validate()` reassigns `req.body` to the parsed result — so an
 * undeclared `expectedUpdatedAt` was silently removed before the
 * controller saw it, and `assertUnmodified` read it as "caller opted
 * out". The whole stale-write check was inert.
 */
const expectedUpdatedAt = z.string().datetime({ offset: true }).optional();

const updateCouponSchema = createCouponSchema
  .partial()
  .omit({ code: true })
  .extend({ expectedUpdatedAt });

const listQuerySchema = z.object({
  status: z.enum(CouponStatus).optional(),
  search: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

// Public-ish (any authenticated user) — validate / preview / apply
const publicRouter = Router();
publicRouter.use(protect);
publicRouter.post(
  '/validate',
  validate({ body: validateBodySchema }),
  CouponController.validateCoupon
);
// /apply — same eligibility check as /validate, but emits the
// COUPON_APPLIED audit event so we can analyse drop-off between
// "apply at checkout" and "actual redemption". Backed by the same
// validator — no DB write happens until the order-create call
// consumes the coupon code.
publicRouter.post(
  '/apply',
  validate({ body: validateBodySchema }),
  audit('COUPON_APPLIED', 'Coupon'),
  CouponController.applyCoupon
);

// Super-admin CRUD
const superAdminRouter = Router();
superAdminRouter.use(protect, restrictTo(Role.ADMIN, Role.SUPER_ADMIN));
superAdminRouter.use(trackAdminActivity);
superAdminRouter.get(
  '/',
  requirePermission('billing.coupons.view'),
  validate({ query: listQuerySchema }),
  CouponController.listCouponsAdmin
);
superAdminRouter.get(
  '/:id',
  requirePermission('billing.coupons.view'),
  validate({ params: idParamsSchema }),
  CouponController.getCouponAdmin
);
superAdminRouter.post(
  '/',
  requirePermission('billing.coupons.create'),
  validate({ body: createCouponSchema }),
  audit('CREATE_COUPON', 'Coupon'),
  CouponController.createCoupon
);
superAdminRouter.patch(
  '/:id',
  requirePermission('billing.coupons.edit'),
  validate({ params: idParamsSchema, body: updateCouponSchema }),
  audit('UPDATE_COUPON', 'Coupon'),
  CouponController.updateCoupon
);
superAdminRouter.post(
  '/:id/archive',
  requirePermission('billing.coupons.delete'),
  validate({ params: idParamsSchema }),
  audit('ARCHIVE_COUPON', 'Coupon'),
  CouponController.archiveCoupon
);

export { publicRouter as couponPublicRouter, superAdminRouter as couponSuperAdminRouter };
export default publicRouter;
