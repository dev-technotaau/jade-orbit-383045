import api from '@/lib/api';
import type { AdminPlan, Plan } from '@/types/billing';
import type { OrderListItem } from '@/types/order';
import type {
  AdminRefundRequestRow,
  RefundRequestStatus,
  ReviewRefundRequestInput,
} from '@/types/refund';

interface BackendEnvelope<T> {
  success?: boolean;
  message?: string;
  data: T;
}

// =====================================================================
// Dashboard
// =====================================================================

export interface FinancialDashboard {
  revenue: {
    last30dPaise: number;
    todayPaise: number;
    yesterdayPaise: number;
    series: Array<{ date: string; paise: number; count: number }>;
  };
  recurring: {
    mrrPaise: number;
    arrPaise: number;
    activeSubscriptions: number;
    churnPercentLast30d: number;
  };
  unitEconomics: {
    arpuPaise: number;
    payingUsersLast30d: number;
    ltvPaise: number;
    paymentSuccessRatePercent: number;
    refundRatePercent: number;
  };
  settlement: { last30dNetPaise: number };
  topPlans: Array<{
    planId: string;
    planCode: string;
    planName: string;
    revenuePaise: number;
    orderCount: number;
  }>;
  actionQueue: {
    refundsPending: number;
    disputesOpen: number;
    fraudFlagsUnreviewed: number;
    quotesNew: number;
    webhooksFailed: number;
  };
  generatedAt: string;
}

// =====================================================================
// Transactions / payments
// =====================================================================

export type PaymentStatus =
  | 'CREATED'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type PaymentMethod =
  | 'CARD'
  | 'UPI'
  | 'NETBANKING'
  | 'WALLET'
  | 'EMI'
  | 'PAYLATER'
  | 'BANK_TRANSFER'
  | 'INTERNATIONAL'
  | 'UNKNOWN';

export interface AdminPaymentRow {
  id: string;
  razorpayPaymentId: string;
  status: PaymentStatus;
  method: PaymentMethod;
  amountPaise: number;
  capturedPaise: number;
  capturedAt: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  cardLast4: string | null;
  cardNetwork: string | null;
  vpa: string | null;
  bank: string | null;
  wallet: string | null;
  international: boolean;
  currency: string;
  createdAt: string;
  order?: {
    receiptNumber: string;
    totalPaise: number;
    plan: { code: string; name: string };
  };
  user?: { email: string; firstName: string | null; lastName: string | null };
}

// =====================================================================
// Refunds
// =====================================================================

export interface AdminRefundRow {
  id: string;
  paymentId: string;
  orderId: string;
  razorpayRefundId: string;
  amountPaise: number;
  reason: string;
  notes: string | null;
  status: 'PENDING' | 'PROCESSED' | 'FAILED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
  payment?: { razorpayPaymentId: string; method: string };
  order?: { receiptNumber: string; totalPaise: number; userId: string };
}

// =====================================================================
// Coupons
// =====================================================================

export type CouponType = 'PERCENT' | 'FLAT' | 'FIRST_MONTH_FREE' | 'TRIAL_EXTEND' | 'FREE_PLAN';
export type CouponStatus = 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'ARCHIVED';
export type CouponScope = 'GLOBAL' | 'ROLE_TARGETED' | 'USER_TARGETED' | 'PLAN_TARGETED' | 'COMBO';

export interface AdminCoupon {
  id: string;
  code: string;
  name: string;
  type: CouponType;
  valuePaise: number | null;
  valuePercent: number | null;
  maxDiscountPaise: number | null;
  trialExtendDays: number | null;
  scope: CouponScope;
  status: CouponStatus;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  maxRedemptionsPerUser: number;
  redemptionsCount: number;
  minOrderAmountPaise: number;
  allowedPlanIds: string[];
  excludedPlanIds: string[];
  allowedRoles: string[];
  allowedUserIds: string[];
  comboAllowed: boolean;
  stackable: boolean;
  autoApply: boolean;
  descriptionHtml: string | null;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  recentRedemptions?: Array<{
    id: string;
    userId: string;
    orderId: string | null;
    redeemedAt: string;
    discountPaise: number;
    status: string;
  }>;
}

// =====================================================================
// Quotes
// =====================================================================

export interface AdminQuoteRow {
  id: string;
  status:
    | 'NEW'
    | 'IN_REVIEW'
    | 'CONTACTED'
    | 'NEGOTIATING'
    | 'ACCEPTED'
    | 'REJECTED'
    | 'CONVERTED'
    | 'WITHDRAWN';
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  requiredCvCount: number | null;
  validityDays: number | null;
  expectedSeats: number | null;
  hiringNeed: string | null;
  budgetRange: string | null;
  additionalNotes: string | null;
  slaDueAt: string | null;
  contactedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { email: string; firstName: string | null; lastName: string | null };
  offers?: Array<{
    id: string;
    status: string;
    basePricePaise: number;
    validityDays: number;
    cvUnlocks: number;
    seats: number;
    expiresAt: string | null;
    createdAt: string;
    planId: string | null;
  }>;
}

// =====================================================================
// Settlements / Disputes
// =====================================================================

export interface AdminSettlement {
  id: string;
  razorpaySettlementId: string;
  settledOnDate: string;
  amountPaise: number;
  feesPaise: number;
  taxPaise: number;
  netPaise: number;
  utr: string | null;
  status: 'SCHEDULED' | 'PROCESSED' | 'FAILED';
  createdAt: string;
}

export interface AdminDispute {
  id: string;
  paymentId: string;
  razorpayDisputeId: string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'WON' | 'LOST' | 'ACCEPTED';
  reasonCode: string | null;
  reasonDescription: string | null;
  amountPaise: number;
  dueByAt: string | null;
  createdAt: string;
}

// =====================================================================
// Fraud
// =====================================================================

export type FraudSignal =
  | 'MULTI_ACCOUNT_SAME_CARD'
  | 'VELOCITY_BURST'
  | 'GEO_MISMATCH'
  | 'EMAIL_DOMAIN_DISPOSABLE'
  | 'IP_BLACKLIST'
  | 'BIN_BLACKLIST'
  | 'CHARGEBACK_RATE'
  | 'MANUAL';
export type FraudSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FraudAction = 'NONE' | 'REVIEW' | 'BLOCK' | 'REFUND_AND_BLOCK';

export interface AdminFraudFlag {
  id: string;
  userId: string | null;
  orderId: string | null;
  paymentId: string | null;
  signal: FraudSignal;
  severity: FraudSeverity;
  action: FraudAction;
  evidence: unknown;
  notes: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
  createdAt: string;
  user?: { id: string; email: string };
  payment?: { razorpayPaymentId: string; method: string; amountPaise: number };
}

export interface AdminFraudRule {
  id: string;
  name: string;
  signal: FraudSignal;
  threshold: number;
  windowSeconds: number;
  action: FraudAction;
  severity: FraudSeverity;
  enabled: boolean;
  notes: string | null;
  updatedAt: string;
  createdAt: string;
}

// =====================================================================
// Service
// =====================================================================

export const superAdminBillingService = {
  // Dashboard + transactions
  async dashboard(): Promise<FinancialDashboard> {
    const { data } = await api.get<BackendEnvelope<FinancialDashboard>>(
      '/super-admin/billing/dashboard',
    );
    return data.data;
  },
  async listTransactions(
    args: {
      status?: PaymentStatus;
      method?: PaymentMethod;
      userId?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { data } = await api.get<
      BackendEnvelope<{
        items: AdminPaymentRow[];
        total: number;
        page: number;
        limit: number;
      }>
    >('/super-admin/billing/transactions', { params: args });
    return data.data;
  },

  // Plans
  async listPlansAdmin(args: { includeArchived?: boolean } = {}) {
    const { data } = await api.get<BackendEnvelope<AdminPlan[]>>('/super-admin/plans', {
      params: args,
    });
    return data.data;
  },
  async getPlanAdmin(id: string) {
    const { data } = await api.get<BackendEnvelope<AdminPlan>>(
      `/super-admin/plans/${encodeURIComponent(id)}`,
    );
    return data.data;
  },
  async createPlanAdmin(input: Partial<Plan>) {
    const { data } = await api.post<BackendEnvelope<AdminPlan>>('/super-admin/plans', input);
    return data.data;
  },
  /** `expectedUpdatedAt` opts into optimistic concurrency — the server
   *  409s with STALE_WRITE if the plan moved since it was loaded. */
  async updatePlanAdmin(id: string, input: Partial<Plan> & { expectedUpdatedAt?: string }) {
    const { data } = await api.patch<BackendEnvelope<AdminPlan>>(
      `/super-admin/plans/${encodeURIComponent(id)}`,
      input,
    );
    return data.data;
  },
  async publishPlanAdmin(id: string) {
    const { data } = await api.post<BackendEnvelope<AdminPlan>>(
      `/super-admin/plans/${encodeURIComponent(id)}/publish`,
    );
    return data.data;
  },
  async archivePlanAdmin(id: string) {
    await api.post(`/super-admin/plans/${encodeURIComponent(id)}/archive`);
  },

  // Coupons
  async listCouponsAdmin(
    args: { status?: CouponStatus; search?: string; page?: number; limit?: number } = {},
  ) {
    const { data } = await api.get<
      BackendEnvelope<{ items: AdminCoupon[]; total: number; page: number; limit: number }>
    >('/super-admin/coupons', { params: args });
    return data.data;
  },
  async getCouponAdmin(id: string) {
    const { data } = await api.get<BackendEnvelope<AdminCoupon>>(
      `/super-admin/coupons/${encodeURIComponent(id)}`,
    );
    return data.data;
  },
  async createCouponAdmin(
    input: Partial<AdminCoupon> & { code: string; name: string; type: CouponType },
  ) {
    const { data } = await api.post<BackendEnvelope<AdminCoupon>>('/super-admin/coupons', input);
    return data.data;
  },
  /** See `updatePlanAdmin` for the `expectedUpdatedAt` contract. */
  async updateCouponAdmin(
    id: string,
    input: Partial<AdminCoupon> & { expectedUpdatedAt?: string },
  ) {
    const { data } = await api.patch<BackendEnvelope<AdminCoupon>>(
      `/super-admin/coupons/${encodeURIComponent(id)}`,
      input,
    );
    return data.data;
  },
  async archiveCouponAdmin(id: string) {
    await api.post(`/super-admin/coupons/${encodeURIComponent(id)}/archive`);
  },

  // Quotes
  async listQuotesAdmin(
    args: { status?: AdminQuoteRow['status']; search?: string; page?: number; limit?: number } = {},
  ) {
    const { data } = await api.get<
      BackendEnvelope<{ items: AdminQuoteRow[]; total: number; page: number; limit: number }>
    >('/super-admin/quotes', { params: args });
    return data.data;
  },
  async getQuoteAdmin(id: string) {
    const { data } = await api.get<BackendEnvelope<AdminQuoteRow>>(
      `/super-admin/quotes/${encodeURIComponent(id)}`,
    );
    return data.data;
  },
  async markQuoteContacted(id: string, notes?: string) {
    const { data } = await api.post<BackendEnvelope<AdminQuoteRow>>(
      `/super-admin/quotes/${encodeURIComponent(id)}/contacted`,
      { notes },
    );
    return data.data;
  },
  async rejectQuote(id: string, reason?: string) {
    const { data } = await api.post<BackendEnvelope<AdminQuoteRow>>(
      `/super-admin/quotes/${encodeURIComponent(id)}/reject`,
      { reason },
    );
    return data.data;
  },
  async createOffer(
    quoteId: string,
    input: {
      basePricePaise: number;
      validityDays: number;
      cvUnlocks: number;
      seats?: number;
      features?: Record<string, unknown>;
      resources?: Record<string, unknown>;
      expiresAt?: string;
    },
  ) {
    const { data } = await api.post<
      BackendEnvelope<{
        offerId: string;
        planCode: string;
        planId: string;
        expiresAt: string | null;
      }>
    >(`/super-admin/quotes/${encodeURIComponent(quoteId)}/offers`, input);
    return data.data;
  },

  // Refunds
  async initiateRefund(input: {
    paymentId?: string;
    razorpayPaymentId?: string;
    amountPaise?: number;
    reason: string;
    notes?: string;
    speed?: 'normal' | 'optimum';
    bypassWindow?: boolean;
  }) {
    const { data } = await api.post<
      BackendEnvelope<{
        refundId: string;
        razorpayRefundId: string;
        status: string;
        amountPaise: number;
      }>
    >('/super-admin/billing/refunds', input);
    return data.data;
  },
  async listRefundsAdmin(
    args: { status?: AdminRefundRow['status']; page?: number; limit?: number } = {},
  ) {
    const { data } = await api.get<
      BackendEnvelope<{ items: AdminRefundRow[]; total: number; page: number; limit: number }>
    >('/super-admin/billing/refunds', { params: args });
    return data.data;
  },

  // Customer refund REQUESTS — the approval queue. Distinct from the refunds
  // above: nothing has been sent to Razorpay until one of these is approved.
  async listRefundRequests(
    args: { status?: RefundRequestStatus; page?: number; limit?: number } = {},
  ) {
    const { data } = await api.get<
      BackendEnvelope<{
        items: AdminRefundRequestRow[];
        total: number;
        /** Count of PENDING requests regardless of the current filter. */
        pendingCount: number;
      }>
    >('/super-admin/billing/refund-requests', { params: args });
    return data.data;
  },
  async getRefundRequest(id: string) {
    const { data } = await api.get<BackendEnvelope<AdminRefundRequestRow>>(
      `/super-admin/billing/refund-requests/${encodeURIComponent(id)}`,
    );
    return data.data;
  },
  async reviewRefundRequest(id: string, input: ReviewRefundRequestInput) {
    const { data } = await api.post<
      BackendEnvelope<{
        request: AdminRefundRequestRow;
        refundId: string | null;
        razorpayRefundId: string | null;
      }>
    >(`/super-admin/billing/refund-requests/${encodeURIComponent(id)}/review`, input);
    return data.data;
  },

  // Settlements
  async listSettlementsAdmin(
    args: { status?: AdminSettlement['status']; page?: number; limit?: number } = {},
  ) {
    const { data } = await api.get<
      BackendEnvelope<{ items: AdminSettlement[]; total: number; page: number; limit: number }>
    >('/super-admin/billing/settlements', { params: args });
    return data.data;
  },
  async getSettlementAdmin(id: string) {
    const { data } = await api.get<BackendEnvelope<AdminSettlement & { transactions: unknown[] }>>(
      `/super-admin/billing/settlements/${encodeURIComponent(id)}`,
    );
    return data.data;
  },
  async syncSettlements() {
    const { data } = await api.post<BackendEnvelope<{ synced: number }>>(
      '/super-admin/billing/settlements/sync',
    );
    return data.data;
  },

  // Disputes
  async listDisputesAdmin(
    args: { status?: AdminDispute['status']; page?: number; limit?: number } = {},
  ) {
    const { data } = await api.get<
      BackendEnvelope<{ items: AdminDispute[]; total: number; page: number; limit: number }>
    >('/super-admin/billing/disputes', { params: args });
    return data.data;
  },

  // Fraud
  async listFraudFlags(
    args: {
      severity?: FraudSeverity;
      action?: FraudAction;
      signal?: FraudSignal;
      reviewed?: boolean;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { data } = await api.get<
      BackendEnvelope<{ items: AdminFraudFlag[]; total: number; page: number; limit: number }>
    >('/super-admin/billing/fraud/flags', { params: args });
    return data.data;
  },
  async reviewFraudFlag(id: string, input: { newAction?: FraudAction; notes?: string }) {
    const { data } = await api.post<BackendEnvelope<AdminFraudFlag>>(
      `/super-admin/billing/fraud/flags/${encodeURIComponent(id)}/review`,
      input,
    );
    return data.data;
  },
  async listFraudRules() {
    const { data } = await api.get<BackendEnvelope<AdminFraudRule[]>>(
      '/super-admin/billing/fraud/rules',
    );
    return data.data;
  },
  async updateFraudRule(
    id: string,
    input: Partial<
      Pick<
        AdminFraudRule,
        'enabled' | 'threshold' | 'windowSeconds' | 'action' | 'severity' | 'notes'
      >
    >,
  ) {
    const { data } = await api.patch<BackendEnvelope<AdminFraudRule>>(
      `/super-admin/billing/fraud/rules/${encodeURIComponent(id)}`,
      input,
    );
    return data.data;
  },

  // God-mode actions
  async markOrderPaid(orderId: string, notes: string, externalReference?: string) {
    const { data } = await api.post<BackendEnvelope<OrderListItem>>(
      `/super-admin/billing/orders/${encodeURIComponent(orderId)}/mark-paid`,
      { notes, externalReference },
    );
    return data.data;
  },
  async forceCancelOrder(orderId: string, reason: string) {
    const { data } = await api.post<BackendEnvelope<OrderListItem>>(
      `/super-admin/billing/orders/${encodeURIComponent(orderId)}/force-cancel`,
      { reason },
    );
    return data.data;
  },
  async retryPaymentCapture(paymentId: string) {
    const { data } = await api.post<BackendEnvelope<{ status: string }>>(
      `/super-admin/billing/payments/${encodeURIComponent(paymentId)}/retry-capture`,
    );
    return data.data;
  },
  async getUserBillingSummary(userId: string) {
    const { data } = await api.get<BackendEnvelope<unknown>>(
      `/super-admin/billing/users/${encodeURIComponent(userId)}/summary`,
    );
    return data.data;
  },

  // Orders / Subscriptions / Payments / Refunds (admin reads)
  async listOrders(
    args: { status?: string; userId?: string; search?: string; page?: number; limit?: number } = {},
  ) {
    const { data } = await api.get<
      BackendEnvelope<{
        items: Array<Record<string, unknown>>;
        total: number;
        page: number;
        limit: number;
      }>
    >('/super-admin/billing/orders', { params: args });
    return data.data;
  },
  async getOrder(id: string) {
    const { data } = await api.get<BackendEnvelope<Record<string, unknown>>>(
      `/super-admin/billing/orders/${encodeURIComponent(id)}`,
    );
    return data.data;
  },
  async listSubscriptions(
    args: { status?: string; userId?: string; page?: number; limit?: number } = {},
  ) {
    const { data } = await api.get<
      BackendEnvelope<{
        items: Array<Record<string, unknown>>;
        total: number;
        page: number;
        limit: number;
      }>
    >('/super-admin/billing/subscriptions', { params: args });
    return data.data;
  },
  async getSubscription(id: string) {
    const { data } = await api.get<BackendEnvelope<Record<string, unknown>>>(
      `/super-admin/billing/subscriptions/${encodeURIComponent(id)}`,
    );
    return data.data;
  },
  async getPayment(id: string) {
    const { data } = await api.get<BackendEnvelope<Record<string, unknown>>>(
      `/super-admin/billing/transactions/${encodeURIComponent(id)}`,
    );
    return data.data;
  },
  async getRefund(id: string) {
    const { data } = await api.get<BackendEnvelope<Record<string, unknown>>>(
      `/super-admin/billing/refunds/${encodeURIComponent(id)}`,
    );
    return data.data;
  },

  // Webhooks
  async listWebhookEvents(
    args: { status?: string; event?: string; page?: number; limit?: number } = {},
  ) {
    const { data } = await api.get<
      BackendEnvelope<{
        items: Array<{
          id: string;
          razorpayEventId: string;
          event: string;
          status: string;
          retryCount: number;
          replayCount: number;
          receivedAt: string;
          processedAt: string | null;
          errorMessage: string | null;
        }>;
        total: number;
        page: number;
        limit: number;
      }>
    >('/super-admin/billing/webhooks', { params: args });
    return data.data;
  },
  async getWebhookEvent(id: string) {
    const { data } = await api.get<BackendEnvelope<Record<string, unknown>>>(
      `/super-admin/billing/webhooks/${encodeURIComponent(id)}`,
    );
    return data.data;
  },
  async replayWebhookEvent(id: string) {
    const { data } = await api.post<BackendEnvelope<{ id: string; status: string }>>(
      `/super-admin/billing/webhooks/${encodeURIComponent(id)}/replay`,
    );
    return data.data;
  },

  // Audit + Ledger
  async listBillingAudit(
    args: {
      action?: string;
      entity?: string;
      performedBy?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { data } = await api.get<
      BackendEnvelope<{
        items: Array<{
          id: string;
          action: string;
          entity: string;
          entityId: string | null;
          performedBy: string | null;
          createdAt: string;
          details: Record<string, unknown> | null;
          user?: { email: string; firstName: string | null; lastName: string | null };
        }>;
        total: number;
        page: number;
        limit: number;
      }>
    >('/super-admin/billing/audit', { params: args });
    return data.data;
  },
  async listLedger(args: { userId?: string; type?: string; page?: number; limit?: number } = {}) {
    const { data } = await api.get<
      BackendEnvelope<{
        items: Array<{
          id: string;
          userId: string;
          type: string;
          amountPaise: number;
          currency: string;
          refType: string;
          refId: string;
          narration: string | null;
          createdAt: string;
          user?: { email: string };
        }>;
        total: number;
        page: number;
        limit: number;
      }>
    >('/super-admin/billing/ledger', { params: args });
    return data.data;
  },

  // Manual entitlement grant
  async grantPlanToUser(
    userId: string,
    input: { planId: string; validityDays: number; notes: string },
  ) {
    const { data } = await api.post<BackendEnvelope<Record<string, unknown>>>(
      `/super-admin/billing/users/${encodeURIComponent(userId)}/grant-plan`,
      input,
    );
    return data.data;
  },

  // Coupon analytics summary
  async getCouponAnalytics() {
    const { data } = await api.get<
      BackendEnvelope<{
        totalCoupons: number;
        activeCoupons: number;
        totalRedemptions: number;
        totalDiscountPaise: number;
        topCoupons: Array<{
          code: string;
          name: string;
          redemptions: number;
          discountPaise: number;
        }>;
      }>
    >('/super-admin/billing/coupons/analytics');
    return data.data;
  },
};

export default superAdminBillingService;
