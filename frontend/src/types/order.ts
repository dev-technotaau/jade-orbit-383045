import type { PlanCategory, PlanBillingCycle } from './billing';

export type OrderStatus =
  | 'CREATED'
  | 'ATTEMPTED'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'DISPUTED'
  | 'FRAUD_FLAGGED';

export type TaxRegion = 'IN_INTRA_STATE' | 'IN_INTER_STATE' | 'INTERNATIONAL' | 'EXEMPT';

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

export type PaymentStatus =
  | 'CREATED'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export interface OrderBreakdown {
  originalAmountPaise: number;
  discountPaise: number;
  prorationPaise: number;
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  totalPaise: number;
}

export interface CreatedOrderResponse {
  order: {
    id: string;
    status: OrderStatus;
    /** Units of the plan purchased (1-3). */
    quantity?: number;
    totalPaise: number;
    currency: string;
    receiptNumber: string;
    taxRegion: TaxRegion;
    breakdown: OrderBreakdown;
    expiresAt: string | null;
  };
  razorpay: {
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    receipt: string;
  };
  plan: {
    code: string;
    name: string;
    slug: string;
    billingCycle: PlanBillingCycle;
  };
}

export interface OrderListItem {
  id: string;
  userId: string;
  planId: string;
  status: OrderStatus;
  /** Units of the plan purchased (1-3); absent on legacy rows. */
  quantity?: number;
  totalPaise: number;
  taxPaise: number;
  currency: string;
  receiptNumber: string;
  razorpayOrderId: string | null;
  taxRegion: TaxRegion;
  paidAt: string | null;
  refundedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  plan?: {
    code: string;
    name: string;
    slug: string;
    category: PlanCategory;
  };
}

export interface OrderPayment {
  id: string;
  razorpayPaymentId: string;
  status: PaymentStatus;
  method: PaymentMethod;
  amountPaise: number;
  capturedPaise: number;
  capturedAt: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  vpa: string | null;
  bank: string | null;
  wallet: string | null;
  cardLast4: string | null;
  cardNetwork: string | null;
  cardIssuer: string | null;
  cardType: string | null;
  cardFingerprint: string | null;
  cardInternational: boolean | null;
  emiTenure: number | null;
  international: boolean;
  currency: string;
  createdAt: string;
}

export type PaymentChannel =
  | 'CHECKOUT'
  | 'SUBSCRIPTION'
  | 'MANDATE'
  | 'MANUAL_MARK_PAID'
  | 'INTERNAL';

export type FraudActionLite = 'NONE' | 'REVIEW' | 'BLOCK' | 'REFUND_AND_BLOCK';

export interface OrderDetail extends OrderListItem {
  originalAmountPaise: number;
  discountPaise: number;
  prorationPaise: number;
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  gstNumber: string | null;
  legalName: string | null;
  placeOfSupplyState: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  buyerCountry: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceFingerprint: string | null;
  channel: PaymentChannel;
  fraudScore: number | null;
  fraudAction: FraudActionLite | null;
  /** Self-link to a previous Order in an upgrade chain. */
  upgradeFromOrderId: string | null;
  /** Subscription that triggered this Order (for renewal-cycle orders). */
  parentSubscriptionId: string | null;
  /** Coupon applied to this order (super-admin context). */
  coupon: {
    id: string;
    code: string;
    name: string;
    type: string;
  } | null;
  payments: OrderPayment[];
  refunds: unknown[];
  invoices: unknown[];
}

export interface OrdersListResponse {
  items: OrderListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface CreateOrderRequest {
  planCode: string;
  /** Units of the plan (1-3) — only stackable plans accept > 1. */
  quantity?: number;
  billingAddressId?: string | null;
  buyerStateCode?: string;
  buyerIsIndian?: boolean;
  couponCode?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  buyerGstin?: string;
  buyerLegalName?: string;
  notes?: Record<string, string | number>;
}

export interface VerifyOrderRequest {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
