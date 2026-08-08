import type { PlanBillingCycle, PlanCategory } from './billing';

export type SubscriptionStatus =
  | 'CREATED'
  | 'AUTHENTICATED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'HALTED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'PENDING_CANCEL';

export type SubscriptionRenewalMode = 'AUTO_RENEW' | 'MANUAL' | 'OFF';

export interface CreateSubscriptionRequest {
  planCode: string;
  totalCount?: number | null;
  startAt?: string;
  customerNotify?: boolean;
  notifyEmail?: string;
  notifyPhone?: string;
  couponCode?: string;
  metadata?: Record<string, string | number>;
}

export interface CreateSubscriptionResponse {
  subscription: {
    id: string;
    status: SubscriptionStatus;
    autoRenew: boolean;
    totalCount: number | null;
    paidCount: number;
    remainingCount: number | null;
    currentStart: string | null;
    currentEnd: string | null;
    nextChargeAt: string | null;
    shortUrl: string | null;
  };
  razorpay: {
    keyId: string;
    subscriptionId: string;
    shortUrl: string | null;
    amountPerCyclePaise: number;
    currency: string;
  };
  plan: {
    code: string;
    name: string;
    slug: string;
    basePricePaise: number;
    billingCycle: PlanBillingCycle;
  };
}

export interface SubscriptionListItem {
  id: string;
  userId: string;
  planId: string;
  mandateId: string | null;
  status: SubscriptionStatus;
  autoRenew: boolean;
  cancelAtCycleEnd: boolean;
  renewalMode: SubscriptionRenewalMode;
  totalCount: number | null;
  paidCount: number;
  remainingCount: number | null;
  currentStart: string | null;
  currentEnd: string | null;
  nextChargeAt: string | null;
  gracePeriodUntil: string | null;
  failureCount: number | null;
  pausedAt: string | null;
  pausedBy: string | null;
  pauseReason: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  endedAt: string | null;
  shortUrl: string | null;
  createdAt: string;
  updatedAt: string;
  plan?: {
    code: string;
    name: string;
    slug: string;
    category: PlanCategory;
    basePricePaise: number;
    currency: string;
  };
}

/**
 * Mandate snapshot returned alongside a subscription. Mirrors all the
 * fields stored on the `Mandate` Prisma model so the UI can render the
 * full saved-instrument card (last4, expiry, mandate URL for re-consent).
 */
export interface SubscriptionMandate {
  id: string;
  method: 'EMANDATE' | 'UPI_AUTOPAY' | 'CARD' | string;
  status: 'PENDING' | 'CONFIRMED' | 'ACTIVE' | 'CANCELLED' | 'FAILED' | string;
  maxAmountPaise: number;
  frequency: string | null;
  vpa: string | null;
  bankName: string | null;
  bankCode: string | null;
  cardLast4: string | null;
  accountLast4: string | null;
  network: string | null;
  mandateUrl: string | null;
  startsAt: string | null;
  expiresAt: string | null;
}

export interface SubscriptionDetail extends SubscriptionListItem {
  plan: {
    id: string;
    code: string;
    name: string;
    slug: string;
    category: PlanCategory;
    basePricePaise: number;
    currency: string;
    billingCycle: PlanBillingCycle;
    gstRatePercent: number;
    validityDays: number | null;
  };
  payments?: Array<{
    id: string;
    razorpayPaymentId: string;
    status: string;
    method: string;
    amountPaise: number;
    capturedAt: string | null;
    createdAt: string;
    cardLast4?: string | null;
    cardNetwork?: string | null;
    vpa?: string | null;
    bank?: string | null;
    wallet?: string | null;
    currency: string;
  }>;
  events?: Array<{
    id: string;
    kind: string;
    happenedAt: string;
  }>;
  mandate?: SubscriptionMandate | null;
}
