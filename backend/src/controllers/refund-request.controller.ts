import type { Request, Response, NextFunction } from 'express';
import * as RefundRequestService from '../services/refund-request.service';
import { success, created } from '../utils/response';
import { assertPermission } from '../middleware/require-permission';
import type {
  CreateRefundRequestBody,
  ReviewRefundRequestBody,
} from '../validators/refund-request.validator';
import type { RefundRequestStatus } from '@prisma/client';

/**
 * Customer refund-request endpoints plus the super-admin review queue.
 *
 * Split from `order.controller` because the request lifecycle is its own thing
 * (raise → withdraw → review) and the super-admin half needs a different
 * mount point and RBAC.
 */

// =====================================================================
// Customer
// =====================================================================

/** GET /billing/refund-requests/eligibility/:orderId */
export const getEligibility = async (
  req: Request<{ orderId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const eligibility = await RefundRequestService.getRefundEligibility(
      req.user!.id,
      req.params.orderId
    );
    success(res, eligibility, 'Refund eligibility fetched');
  } catch (err) {
    next(err);
  }
};

/** POST /billing/refund-requests */
export const createRefundRequest = async (
  req: Request<unknown, unknown, CreateRefundRequestBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const request = await RefundRequestService.createRefundRequest({
      userId: req.user!.id,
      orderId: req.body.orderId,
      amountPaise: req.body.amountPaise,
      userReason: req.body.userReason,
    });
    created(
      res,
      request,
      'Refund request submitted — our team reviews requests within 2 business days'
    );
  } catch (err) {
    next(err);
  }
};

/** GET /billing/refund-requests */
export const listMyRefundRequests = async (
  req: Request<unknown, unknown, unknown, { orderId?: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const items = await RefundRequestService.listMyRefundRequests(req.user!.id, {
      orderId: req.query.orderId,
    });
    success(res, items, 'Refund requests fetched');
  } catch (err) {
    next(err);
  }
};

/** POST /billing/refund-requests/:id/cancel */
export const cancelRefundRequest = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const request = await RefundRequestService.cancelRefundRequest(req.user!.id, req.params.id);
    success(res, request, 'Refund request withdrawn');
  } catch (err) {
    next(err);
  }
};

// =====================================================================
// Super-admin
// =====================================================================

/** GET /super-admin/billing/refund-requests */
export const listRefundRequestsAdmin = async (
  req: Request<
    unknown,
    unknown,
    unknown,
    { status?: RefundRequestStatus; page?: number; limit?: number }
  >,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await RefundRequestService.listRefundRequestsAdmin({
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({
      success: true,
      message: 'Refund requests fetched',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/** GET /super-admin/billing/refund-requests/:id */
export const getRefundRequestAdmin = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const request = await RefundRequestService.getRefundRequestAdmin(req.params.id);
    success(res, request, 'Refund request fetched');
  } catch (err) {
    next(err);
  }
};

/** POST /super-admin/billing/refund-requests/:id/review */
export const reviewRefundRequest = async (
  req: Request<{ id: string }, unknown, ReviewRefundRequestBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // ── Per-action permission ──
    // The route maps to `billing.refunds.approve`, which was covering
    // rejection too — leaving `billing.refunds.reject` a registry node that
    // enforced nothing, and letting an approver-only admin close a customer's
    // refund request against them. Same separation the review UI implies.
    if (req.body.action === 'REJECT') await assertPermission(req, 'billing.refunds.reject');

    const result = await RefundRequestService.reviewRefundRequest({
      id: req.params.id,
      action: req.body.action,
      reviewerId: req.user!.id,
      reviewNotes: req.body.reviewNotes,
      amountPaise: req.body.amountPaise,
      speed: req.body.speed,
      bypassWindow: req.body.bypassWindow,
    });
    success(
      res,
      result,
      req.body.action === 'APPROVE'
        ? 'Refund approved — Razorpay refund initiated, webhook will reconcile'
        : 'Refund request rejected'
    );
  } catch (err) {
    next(err);
  }
};
