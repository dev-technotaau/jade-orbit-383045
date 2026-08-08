import { Router } from 'express';
import * as RefundRequestController from '../controllers/refund-request.controller';
import { protect } from '../middleware/auth';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';
import {
  createRefundRequestBodySchema,
  listMyRefundRequestsQuerySchema,
  orderIdParamsSchema,
  refundRequestIdParamsSchema,
} from '../validators/refund-request.validator';

/**
 * `/api/v1/billing/refund-requests/*` — the CUSTOMER side of refunds.
 *
 *   GET  /eligibility/:orderId   can this order be refunded, and how much
 *   POST /                       raise a request (always queues for review)
 *   GET  /                       my requests (optionally ?orderId=)
 *   POST /:id/cancel             withdraw a pending request
 *
 * Nothing here talks to Razorpay. Approval lives on the super-admin router.
 */
const router = Router();

router.use(protect);

router.get(
  '/eligibility/:orderId',
  validate({ params: orderIdParamsSchema }),
  RefundRequestController.getEligibility
);

router.post(
  '/',
  validate({ body: createRefundRequestBodySchema }),
  audit('BILLING_REFUND_REQUESTED', 'RefundRequest'),
  RefundRequestController.createRefundRequest
);

router.get(
  '/',
  validate({ query: listMyRefundRequestsQuerySchema }),
  RefundRequestController.listMyRefundRequests
);

router.post(
  '/:id/cancel',
  validate({ params: refundRequestIdParamsSchema }),
  audit('BILLING_REFUND_REQUEST_CANCELLED', 'RefundRequest'),
  RefundRequestController.cancelRefundRequest
);

export default router;
