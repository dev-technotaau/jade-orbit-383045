import { Router } from 'express';
import { z } from 'zod';
import * as SuperAdminBilling from '../controllers/super-admin-billing.controller';
import { protect } from '../middleware/auth';
import { restrictTo } from '../middleware/rbac';
import { enforcePermissionMap } from '../middleware/require-permission';
import { trackAdminActivity } from '../middleware/admin-activity';
import { BILLING_FALLBACK, BILLING_PERMISSION_RULES } from '../config/permission-maps';
import {
  Role,
  RefundReason,
  RefundStatus,
  SettlementStatus,
  DisputeStatus,
  FraudSeverity,
  FraudAction,
  FraudSignal,
} from '@prisma/client';
import { validate } from '../validators/validate';
import { audit } from '../middleware/audit';
import * as RefundRequestController from '../controllers/refund-request.controller';
import {
  listRefundRequestsAdminQuerySchema,
  reviewRefundRequestBodySchema,
} from '../validators/refund-request.validator';

const router = Router();

// Role gate admits ADMIN; BILLING_PERMISSION_RULES (config/permission-maps.ts)
// decides which admins reach which routes. Note the two routes mapped to
// `billing.entitlements.grant` rather than their apparent domain —
// `orders/:id/mark-paid` and `users/:id/grant-plan` both mint entitlements
// without money moving, so they are gated as credit grants.
router.use(protect, restrictTo(Role.ADMIN, Role.SUPER_ADMIN));
router.use(trackAdminActivity);
router.use(enforcePermissionMap(BILLING_PERMISSION_RULES, BILLING_FALLBACK));

const idParamsSchema = z.object({ id: z.string().uuid() });
const userIdParamsSchema = z.object({ userId: z.string().uuid() });

// ─── Refunds ────────────────────────────────────────────
router.post(
  '/refunds',
  validate({
    body: z.object({
      paymentId: z.string().uuid().optional(),
      razorpayPaymentId: z.string().min(8).optional(),
      amountPaise: z.number().int().min(100).optional(),
      reason: z.enum(RefundReason),
      notes: z.string().max(2000).optional(),
      speed: z.enum(['normal', 'optimum']).optional(),
      bypassWindow: z.boolean().optional(),
    }),
  }),
  audit('INITIATE_REFUND', 'Refund'),
  SuperAdminBilling.initiateRefund
);
router.get(
  '/refunds',
  validate({
    query: z.object({
      status: z.enum(RefundStatus).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  }),
  SuperAdminBilling.listRefundsAdmin
);

// ─── Customer refund REQUESTS (approval queue) ──────────
// Declared before the generic `/refunds/:id` read below so the literal
// `/refund-requests` path can never be swallowed by a param route.
router.get(
  '/refund-requests',
  validate({ query: listRefundRequestsAdminQuerySchema }),
  RefundRequestController.listRefundRequestsAdmin
);
router.get(
  '/refund-requests/:id',
  validate({ params: idParamsSchema }),
  RefundRequestController.getRefundRequestAdmin
);
router.post(
  '/refund-requests/:id/review',
  validate({ params: idParamsSchema, body: reviewRefundRequestBodySchema }),
  audit('BILLING_REFUND_REQUEST_REVIEWED', 'RefundRequest'),
  RefundRequestController.reviewRefundRequest
);

// ─── Settlements ────────────────────────────────────────
router.get(
  '/settlements',
  validate({
    query: z.object({
      status: z.enum(SettlementStatus).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  }),
  SuperAdminBilling.listSettlementsAdmin
);
router.get(
  '/settlements/:id',
  validate({ params: idParamsSchema }),
  SuperAdminBilling.getSettlementAdmin
);
router.post(
  '/settlements/sync',
  audit('SYNC_SETTLEMENTS', 'Settlement'),
  SuperAdminBilling.triggerSettlementSync
);

// ─── Disputes ───────────────────────────────────────────
router.get(
  '/disputes',
  validate({
    query: z.object({
      status: z.enum(DisputeStatus).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  }),
  SuperAdminBilling.listDisputesAdmin
);
router.get(
  '/disputes/:id',
  validate({ params: idParamsSchema }),
  SuperAdminBilling.getDisputeAdmin
);

// ─── God-mode order/payment actions ─────────────────────
router.post(
  '/orders/:id/mark-paid',
  validate({
    params: idParamsSchema,
    body: z.object({
      notes: z.string().min(2).max(2000),
      externalReference: z.string().max(120).optional(),
    }),
  }),
  audit('MARK_ORDER_PAID', 'Order'),
  SuperAdminBilling.markOrderPaid
);
router.post(
  '/orders/:id/force-cancel',
  validate({
    params: idParamsSchema,
    body: z.object({ reason: z.string().min(2).max(500) }),
  }),
  audit('FORCE_CANCEL_ORDER', 'Order'),
  SuperAdminBilling.forceCancelOrder
);
router.post(
  '/payments/:id/retry-capture',
  validate({ params: idParamsSchema }),
  audit('RETRY_PAYMENT_CAPTURE', 'Payment'),
  SuperAdminBilling.retryPaymentCapture
);

// ─── Fraud ──────────────────────────────────────────────
router.post(
  '/fraud/flag',
  validate({
    body: z.object({
      userId: z.string().uuid(),
      orderId: z.string().uuid().optional(),
      paymentId: z.string().uuid().optional(),
      reason: z.string().min(2).max(500),
      severity: z.enum(FraudSeverity).optional(),
      action: z.enum(FraudAction).optional(),
    }),
  }),
  audit('FLAG_FRAUD', 'FraudSignalEvent'),
  SuperAdminBilling.flagFraud
);

// ─── Per-user billing summary ───────────────────────────
router.get(
  '/users/:userId/summary',
  validate({ params: userIdParamsSchema }),
  SuperAdminBilling.getUserBillingSummary
);

// ─── Fraud queue + rule editor ──────────────────────────
router.get(
  '/fraud/flags',
  validate({
    query: z.object({
      severity: z.enum(FraudSeverity).optional(),
      action: z.enum(FraudAction).optional(),
      signal: z.enum(FraudSignal).optional(),
      reviewed: z.coerce.boolean().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  }),
  SuperAdminBilling.listFraudFlagsAdmin
);
router.post(
  '/fraud/flags/:id/review',
  validate({
    params: idParamsSchema,
    body: z.object({
      newAction: z.enum(FraudAction).optional(),
      notes: z.string().max(2000).optional(),
    }),
  }),
  audit('REVIEW_FRAUD_FLAG', 'FraudSignalEvent'),
  SuperAdminBilling.reviewFraudFlagAdmin
);
router.get('/fraud/rules', SuperAdminBilling.listFraudRulesAdmin);
router.patch(
  '/fraud/rules/:id',
  validate({
    params: idParamsSchema,
    body: z.object({
      enabled: z.boolean().optional(),
      threshold: z.number().int().min(0).optional(),
      windowSeconds: z.number().int().min(0).optional(),
      action: z.enum(FraudAction).optional(),
      severity: z.enum(FraudSeverity).optional(),
      notes: z.string().max(2000).nullable().optional(),
    }),
  }),
  audit('UPDATE_FRAUD_RULE', 'FraudRule'),
  SuperAdminBilling.updateFraudRule
);

// ─── Orders / Subscriptions / Payments / Refunds (admin reads) ────
router.get(
  '/orders',
  validate({
    query: z.object({
      status: z.string().optional(),
      userId: z.string().uuid().optional(),
      search: z.string().max(120).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  }),
  SuperAdminBilling.listOrdersAdmin
);
router.get('/orders/:id', validate({ params: idParamsSchema }), SuperAdminBilling.getOrderAdmin);

router.get(
  '/subscriptions',
  validate({
    query: z.object({
      status: z.string().optional(),
      userId: z.string().uuid().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  }),
  SuperAdminBilling.listSubscriptionsAdmin
);
router.get(
  '/subscriptions/:id',
  validate({ params: idParamsSchema }),
  SuperAdminBilling.getSubscriptionAdmin
);

router.get(
  '/transactions/:id',
  validate({ params: idParamsSchema }),
  SuperAdminBilling.getPaymentAdmin
);

router.get('/refunds/:id', validate({ params: idParamsSchema }), SuperAdminBilling.getRefundAdmin);

// ─── Webhook event log + replay ─────────────────────────
router.get(
  '/webhooks',
  validate({
    query: z.object({
      status: z.string().optional(),
      event: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  }),
  SuperAdminBilling.listWebhookEventsAdmin
);
router.get(
  '/webhooks/:id',
  validate({ params: idParamsSchema }),
  SuperAdminBilling.getWebhookEventAdmin
);
router.post(
  '/webhooks/:id/replay',
  validate({ params: idParamsSchema }),
  audit('REPLAY_WEBHOOK_EVENT', 'RazorpayWebhookEvent'),
  SuperAdminBilling.replayWebhookEventAdmin
);

// ─── Audit log + Money ledger ─────────────────────────
router.get(
  '/audit',
  validate({
    query: z.object({
      action: z.string().optional(),
      entity: z.string().optional(),
      performedBy: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  }),
  SuperAdminBilling.listBillingAuditAdmin
);
router.get(
  '/ledger',
  validate({
    query: z.object({
      userId: z.string().uuid().optional(),
      type: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(100),
    }),
  }),
  SuperAdminBilling.listLedgerAdmin
);

// ─── Manual entitlement grant ─────────────────────────
router.post(
  '/users/:userId/grant-plan',
  validate({
    params: userIdParamsSchema,
    body: z.object({
      planId: z.string().uuid(),
      validityDays: z.number().int().min(1).max(3650),
      notes: z.string().min(2).max(500),
    }),
  }),
  audit('BILLING_USER_PLAN_GRANTED', 'Entitlement'),
  SuperAdminBilling.grantPlanToUserAdmin
);

// ─── Coupon analytics summary ─────────────────────────
router.get('/coupons/analytics', SuperAdminBilling.getCouponAnalyticsAdmin);

// ─── KPI dashboard + transactions ───────────────────────
router.get('/dashboard', SuperAdminBilling.getFinancialDashboardAdmin);
router.get(
  '/transactions',
  validate({
    query: z.object({
      status: z
        .enum(['CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'])
        .optional(),
      method: z
        .enum([
          'CARD',
          'UPI',
          'NETBANKING',
          'WALLET',
          'EMI',
          'PAYLATER',
          'BANK_TRANSFER',
          'INTERNATIONAL',
          'UNKNOWN',
        ])
        .optional(),
      userId: z.string().uuid().optional(),
      search: z.string().max(120).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  }),
  SuperAdminBilling.listPaymentsAdmin
);

export default router;
