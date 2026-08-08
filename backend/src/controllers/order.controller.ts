import type { Request, Response, NextFunction } from 'express';
import * as OrderService from '../services/order.service';
import { success, created } from '../utils/response';
import { commitIdempotency } from '../middleware/idempotency-key';
import type { CreateOrderBody, VerifyOrderBody } from '../validators/order.validator';
import type { OrderStatus } from '@prisma/client';

interface ListQuery {
  page?: number;
  limit?: number;
  status?: OrderStatus;
}

// =====================================================================
// POST /billing/orders  — create Razorpay order, persist Order row
// =====================================================================
export const createOrder = async (
  req: Request<unknown, unknown, CreateOrderBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const idempotencyKey =
      (req as Request & { __idemKey?: string }).__idemKey ?? `manual:${userId}:${Date.now()}`;

    const result = await OrderService.createOrder({
      userId,
      planCode: req.body.planCode,
      quantity: req.body.quantity,
      billingAddressId: req.body.billingAddressId ?? null,
      buyerStateCode: req.body.buyerStateCode,
      buyerIsIndian: req.body.buyerIsIndian,
      couponCode: req.body.couponCode,
      buyerEmail: req.body.buyerEmail ?? req.user!.email,
      buyerPhone: req.body.buyerPhone,
      buyerGstin: req.body.buyerGstin,
      buyerLegalName: req.body.buyerLegalName,
      idempotencyKey,
      notes: req.body.notes,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
      deviceFingerprint: req.get('x-device-fingerprint') ?? undefined,
    });

    const responseBody = {
      success: true as const,
      data: {
        order: {
          id: result.order.id,
          status: result.order.status,
          quantity: result.order.quantity,
          totalPaise: result.order.totalPaise,
          currency: result.order.currency,
          receiptNumber: result.order.receiptNumber,
          taxRegion: result.order.taxRegion,
          breakdown: {
            originalAmountPaise: result.order.originalAmountPaise,
            discountPaise: result.order.discountPaise,
            prorationPaise: result.order.prorationPaise,
            taxableAmountPaise: result.order.taxableAmountPaise,
            cgstPaise: result.order.cgstPaise,
            sgstPaise: result.order.sgstPaise,
            igstPaise: result.order.igstPaise,
            taxPaise: result.order.taxPaise,
            totalPaise: result.order.totalPaise,
          },
          expiresAt: result.order.expiresAt,
        },
        razorpay: result.razorpay,
        plan: {
          code: result.plan.code,
          name: result.plan.name,
          slug: result.plan.slug,
          billingCycle: result.plan.billingCycle,
        },
      },
      message: 'Order created',
    };

    // Cache for idempotent replays — generic Request to satisfy commit's signature
    await commitIdempotency(req as Request, 201, responseBody);
    res.status(201).json(responseBody);
  } catch (err) {
    next(err);
  }
};

// =====================================================================
// POST /billing/orders/:id/verify  — verify Razorpay signature
// =====================================================================
export const verifyOrder = async (
  req: Request<{ id: string }, unknown, VerifyOrderBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { order } = await OrderService.verifyPayment({
      orderId: req.params.id,
      razorpayOrderId: req.body.razorpay_order_id,
      razorpayPaymentId: req.body.razorpay_payment_id,
      razorpaySignature: req.body.razorpay_signature,
      userId,
    });
    success(
      res,
      {
        orderId: order.id,
        status: order.status,
        paidAt: order.paidAt,
      },
      'Payment verified'
    );
  } catch (err) {
    next(err);
  }
};

// =====================================================================
// GET /billing/orders
// =====================================================================
export const listOrders = async (
  req: Request<unknown, unknown, unknown, ListQuery>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const result = await OrderService.listOrdersForUser(userId, {
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status,
    });
    res.status(200).json({
      success: true,
      data: {
        items: result.items,
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
        hasMore: result.page * result.limit < result.total,
      },
      message: 'Orders fetched',
    });
  } catch (err) {
    next(err);
  }
};

// =====================================================================
// GET /billing/orders/:id
// =====================================================================
export const getOrder = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const order = await OrderService.getOrderForUser(req.params.id, userId);
    success(res, order, 'Order fetched');
  } catch (err) {
    next(err);
  }
};

// =====================================================================
// POST /billing/orders/:id/cancel
// =====================================================================
export const cancelOrder = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const order = await OrderService.cancelPendingOrder(req.params.id, userId);
    success(res, { id: order.id, status: order.status }, 'Order cancelled');
  } catch (err) {
    next(err);
  }
};

// =====================================================================
// POST /billing/orders/:id/retry — re-open Razorpay checkout for a
// previously-attempted order. If the existing Razorpay order is still
// valid, reuse it; otherwise create a fresh one.
// =====================================================================
export const retryOrder = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!.id;
    const result = await OrderService.retryOrder({
      orderId: req.params.id,
      userId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    success(
      res,
      {
        order: {
          id: result.order.id,
          status: result.order.status,
          quantity: result.order.quantity,
          totalPaise: result.order.totalPaise,
          currency: result.order.currency,
          receiptNumber: result.order.receiptNumber,
          expiresAt: result.order.expiresAt,
        },
        razorpay: result.razorpay,
        reused: result.reused,
      },
      result.reused
        ? 'Existing checkout reopened — finish payment'
        : 'Fresh Razorpay order created — proceed to checkout'
    );
  } catch (err) {
    next(err);
  }
};

// Re-export `created` to silence the "unused" eslint warning when the file
// is consumed only via the `*` namespace in route files.
export { created };
