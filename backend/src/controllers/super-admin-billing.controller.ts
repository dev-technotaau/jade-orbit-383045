import type { Request, Response, NextFunction } from 'express';
import * as RefundService from '../services/refund.service';
import * as SettlementService from '../services/settlement.service';
import * as DisputeService from '../services/dispute.service';
import * as SuperAdminBilling from '../services/super-admin-billing.service';
import * as FraudService from '../services/fraud.service';
import * as BillingAnalytics from '../services/billing-analytics.service';
import { success, created } from '../utils/response';
import type {
  RefundReason,
  RefundStatus,
  SettlementStatus,
  DisputeStatus,
  FraudSeverity,
  FraudAction,
  FraudSignal,
} from '@prisma/client';

// =====================================================================
// Refunds
// =====================================================================

interface InitiateRefundBody {
  paymentId?: string;
  razorpayPaymentId?: string;
  amountPaise?: number;
  reason: RefundReason;
  notes?: string;
  speed?: 'normal' | 'optimum';
  bypassWindow?: boolean;
}

export const initiateRefund = async (
  req: Request<unknown, unknown, InitiateRefundBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await RefundService.initiateRefund({
      ...req.body,
      initiatedBy: req.user!.id,
    });
    created(
      res,
      {
        refundId: result.refund.id,
        razorpayRefundId: result.razorpayRefundId,
        status: result.refund.status,
        amountPaise: result.refund.amountPaise,
      },
      'Refund initiated — webhook will reconcile to PROCESSED'
    );
  } catch (err) {
    next(err);
  }
};

export const listRefundsAdmin = async (
  req: Request<unknown, unknown, unknown, { status?: RefundStatus; page?: number; limit?: number }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await RefundService.listRefundsAdmin({
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({
      success: true,
      data: { ...result, page: req.query.page ?? 1, limit: req.query.limit ?? 50 },
      message: 'Refunds fetched',
    });
  } catch (err) {
    next(err);
  }
};

// =====================================================================
// Settlements
// =====================================================================

export const listSettlementsAdmin = async (
  req: Request<
    unknown,
    unknown,
    unknown,
    { status?: SettlementStatus; page?: number; limit?: number }
  >,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await SettlementService.listSettlementsAdmin({
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({
      success: true,
      data: { ...result, page: req.query.page ?? 1, limit: req.query.limit ?? 50 },
      message: 'Settlements fetched',
    });
  } catch (err) {
    next(err);
  }
};

export const getSettlementAdmin = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const settlement = await SettlementService.getSettlementAdmin(req.params.id);
    success(res, settlement, 'Settlement fetched');
  } catch (err) {
    next(err);
  }
};

export const triggerSettlementSync = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await SettlementService.syncSettlements();
    success(res, result, 'Settlement sync triggered');
  } catch (err) {
    next(err);
  }
};

// =====================================================================
// Disputes
// =====================================================================

export const listDisputesAdmin = async (
  req: Request<
    unknown,
    unknown,
    unknown,
    { status?: DisputeStatus; page?: number; limit?: number }
  >,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await DisputeService.listDisputesAdmin({
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({
      success: true,
      data: { ...result, page: req.query.page ?? 1, limit: req.query.limit ?? 50 },
      message: 'Disputes fetched',
    });
  } catch (err) {
    next(err);
  }
};

export const getDisputeAdmin = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const dispute = await DisputeService.getDisputeAdmin(req.params.id);
    success(res, dispute, 'Dispute fetched');
  } catch (err) {
    next(err);
  }
};

// =====================================================================
// God-mode order/payment actions
// =====================================================================

export const markOrderPaid = async (
  req: Request<{ id: string }, unknown, { notes: string; externalReference?: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const order = await SuperAdminBilling.markOrderAsPaid({
      orderId: req.params.id,
      notes: req.body.notes,
      externalReference: req.body.externalReference,
      adminId: req.user!.id,
    });
    success(res, order, 'Order marked as paid');
  } catch (err) {
    next(err);
  }
};

export const forceCancelOrder = async (
  req: Request<{ id: string }, unknown, { reason: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const order = await SuperAdminBilling.forceCancelOrder({
      orderId: req.params.id,
      reason: req.body.reason,
      adminId: req.user!.id,
    });
    success(res, order, 'Order cancelled');
  } catch (err) {
    next(err);
  }
};

export const retryPaymentCapture = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await SuperAdminBilling.retryPaymentCapture({
      paymentId: req.params.id,
      adminId: req.user!.id,
    });
    success(res, result, 'Payment capture retried');
  } catch (err) {
    next(err);
  }
};

interface FraudFlagBody {
  userId: string;
  orderId?: string;
  paymentId?: string;
  reason: string;
  severity?: FraudSeverity;
  action?: FraudAction;
}

export const flagFraud = async (
  req: Request<unknown, unknown, FraudFlagBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await SuperAdminBilling.flagUserAsFraud({
      ...req.body,
      adminId: req.user!.id,
    });
    created(res, result, 'Fraud flag recorded');
  } catch (err) {
    next(err);
  }
};

export const getUserBillingSummary = async (
  req: Request<{ userId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const summary = await SuperAdminBilling.getUserBillingSummary(req.params.userId);
    success(res, summary, 'User billing summary fetched');
  } catch (err) {
    next(err);
  }
};

// =====================================================================
// Fraud queue / rule editor
// =====================================================================

export const listFraudFlagsAdmin = async (
  req: Request<
    unknown,
    unknown,
    unknown,
    {
      severity?: FraudSeverity;
      action?: FraudAction;
      signal?: FraudSignal;
      reviewed?: boolean;
      page?: number;
      limit?: number;
    }
  >,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await FraudService.listFraudFlagsAdmin({
      severity: req.query.severity,
      action: req.query.action,
      signal: req.query.signal,
      reviewed: req.query.reviewed,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({
      success: true,
      data: { ...result, page: req.query.page ?? 1, limit: req.query.limit ?? 50 },
      message: 'Fraud flags fetched',
    });
  } catch (err) {
    next(err);
  }
};

export const listFraudRulesAdmin = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const rules = await FraudService.listFraudRulesAdmin();
    success(res, rules, 'Fraud rules fetched');
  } catch (err) {
    next(err);
  }
};

export const updateFraudRule = async (
  req: Request<
    { id: string },
    unknown,
    {
      enabled?: boolean;
      threshold?: number;
      windowSeconds?: number;
      action?: FraudAction;
      severity?: FraudSeverity;
      notes?: string | null;
    }
  >,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const updated = await FraudService.updateFraudRule({
      id: req.params.id,
      enabled: req.body.enabled,
      threshold: req.body.threshold,
      windowSeconds: req.body.windowSeconds,
      action: req.body.action,
      severity: req.body.severity,
      notes: req.body.notes,
      updatedBy: req.user!.id,
    });
    success(res, updated, 'Fraud rule updated');
  } catch (err) {
    next(err);
  }
};

export const reviewFraudFlagAdmin = async (
  req: Request<{ id: string }, unknown, { newAction?: FraudAction; notes?: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const flag = await FraudService.reviewFraudFlag({
      flagId: req.params.id,
      reviewedBy: req.user!.id,
      newAction: req.body.newAction,
      notes: req.body.notes,
    });
    success(res, flag, 'Fraud flag reviewed');
  } catch (err) {
    next(err);
  }
};

// =====================================================================
// Financial dashboard + transactions
// =====================================================================

export const getFinancialDashboardAdmin = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const dashboard = await BillingAnalytics.getFinancialDashboard();
    success(res, dashboard, 'Dashboard fetched');
  } catch (err) {
    next(err);
  }
};

export const listPaymentsAdmin = async (
  req: Request<
    unknown,
    unknown,
    unknown,
    {
      status?: Parameters<typeof BillingAnalytics.listPaymentsAdmin>[0]['status'];
      method?: Parameters<typeof BillingAnalytics.listPaymentsAdmin>[0]['method'];
      userId?: string;
      search?: string;
      page?: number;
      limit?: number;
    }
  >,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await BillingAnalytics.listPaymentsAdmin({
      status: req.query.status,
      method: req.query.method,
      userId: req.query.userId,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.status(200).json({
      success: true,
      data: { ...result, page: req.query.page ?? 1, limit: req.query.limit ?? 50 },
      message: 'Transactions fetched',
    });
  } catch (err) {
    next(err);
  }
};

// =====================================================================
// Orders / Subscriptions / Payments / Webhooks / Audit / Ledger
// =====================================================================

export const listOrdersAdmin = async (
  req: Request<unknown, unknown, unknown, Record<string, string>>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await SuperAdminBilling.listOrdersAdmin({
      status: req.query.status as Parameters<typeof SuperAdminBilling.listOrdersAdmin>[0]['status'],
      userId: req.query.userId,
      search: req.query.search,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    success(res, result, 'Orders fetched');
  } catch (err) {
    next(err);
  }
};

export const getOrderAdmin = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const order = await SuperAdminBilling.getOrderAdmin(req.params.id);
    success(res, order, 'Order fetched');
  } catch (err) {
    next(err);
  }
};

export const listSubscriptionsAdmin = async (
  req: Request<unknown, unknown, unknown, Record<string, string>>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await SuperAdminBilling.listSubscriptionsAdmin({
      status: req.query.status,
      userId: req.query.userId,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    success(res, result, 'Subscriptions fetched');
  } catch (err) {
    next(err);
  }
};

export const getSubscriptionAdmin = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sub = await SuperAdminBilling.getSubscriptionAdmin(req.params.id);
    success(res, sub, 'Subscription fetched');
  } catch (err) {
    next(err);
  }
};

export const getPaymentAdmin = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const payment = await SuperAdminBilling.getPaymentAdmin(req.params.id);
    success(res, payment, 'Payment fetched');
  } catch (err) {
    next(err);
  }
};

export const getRefundAdmin = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const refund = await SuperAdminBilling.getRefundAdmin(req.params.id);
    success(res, refund, 'Refund fetched');
  } catch (err) {
    next(err);
  }
};

export const listWebhookEventsAdmin = async (
  req: Request<unknown, unknown, unknown, Record<string, string>>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await SuperAdminBilling.listWebhookEventsAdmin({
      status: req.query.status,
      event: req.query.event,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    success(res, result, 'Webhook events fetched');
  } catch (err) {
    next(err);
  }
};

export const getWebhookEventAdmin = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const row = await SuperAdminBilling.getWebhookEventAdmin(req.params.id);
    success(res, row, 'Webhook event fetched');
  } catch (err) {
    next(err);
  }
};

export const replayWebhookEventAdmin = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await SuperAdminBilling.replayWebhookEventAdmin({
      eventRowId: req.params.id,
      triggeredBy: req.user!.id,
    });
    success(res, result, 'Webhook replayed');
  } catch (err) {
    next(err);
  }
};

export const listBillingAuditAdmin = async (
  req: Request<unknown, unknown, unknown, Record<string, string>>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await SuperAdminBilling.listBillingAuditAdmin({
      action: req.query.action,
      entity: req.query.entity,
      performedBy: req.query.performedBy,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    success(res, result, 'Audit log fetched');
  } catch (err) {
    next(err);
  }
};

export const listLedgerAdmin = async (
  req: Request<unknown, unknown, unknown, Record<string, string>>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await SuperAdminBilling.listLedgerAdmin({
      userId: req.query.userId,
      type: req.query.type,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    success(res, result, 'Ledger fetched');
  } catch (err) {
    next(err);
  }
};

export const grantPlanToUserAdmin = async (
  req: Request<
    { userId: string },
    unknown,
    { planId: string; validityDays: number; notes: string }
  >,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const ent = await SuperAdminBilling.grantPlanToUser({
      userId: req.params.userId,
      planId: req.body.planId,
      validityDays: req.body.validityDays,
      notes: req.body.notes,
      grantedBy: req.user!.id,
    });
    success(res, ent, 'Plan granted to user');
  } catch (err) {
    next(err);
  }
};

export const getCouponAnalyticsAdmin = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = await SuperAdminBilling.getCouponAnalytics();
    success(res, data, 'Coupon analytics fetched');
  } catch (err) {
    next(err);
  }
};
