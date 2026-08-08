import api from '@/lib/api';
import type { Plan } from '@/types/billing';
import type { OrderStatus, TaxRegion } from '@/types/order';

interface BackendEnvelope<T> {
  success?: boolean;
  message?: string;
  data: T;
}

export interface CarryForwardLine {
  unit: string;
  unused: number;
  newPeriodAllocation: number;
  cap: number | null;
  carried: number;
  /** Units consumed on the old plan(s), deducted from the new allocation. */
  usedDeducted?: number;
  effectiveAllocation: number;
}

export interface UpgradePreview {
  fromPlan: Pick<
    Plan,
    'code' | 'name' | 'billingCycle' | 'basePricePaise' | 'validityDays' | 'currency'
  >;
  toPlan: Pick<
    Plan,
    | 'code'
    | 'name'
    | 'billingCycle'
    | 'basePricePaise'
    | 'validityDays'
    | 'currency'
    | 'gstRatePercent'
    | 'gstInclusive'
  >;
  /** Null when the source entitlement has no backing order (admin grants). */
  fromOrder: {
    id: string;
    totalPaise: number;
    paidAt: string | null;
    currency: string;
  } | null;
  changeType: 'UPGRADE' | 'DOWNGRADE' | 'SAME_PRICE_SWAP';
  totalSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  remainingRatio: number;
  unusedValuePaise: number;
  netChargePaise: number;
  newOrderPricing: {
    originalAmountPaise: number;
    discountPaise: number;
    prorationPaise: number;
    taxableAmountPaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
    cessPaise: number;
    taxPaise: number;
    totalPaise: number;
    taxRegion: TaxRegion;
    gstPercent: number;
    currency: string;
  };
  carryForward: CarryForwardLine[];
  newValidityDays: number | null;
  warnings: string[];
}

export interface ExecuteUpgradeResponse {
  upgradeChangeId: string;
  order: {
    id: string;
    status: OrderStatus;
    totalPaise: number;
    currency: string;
    receiptNumber: string;
    prorationPaise: number;
    taxPaise: number;
  };
  razorpay?: {
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    receipt: string;
  };
  zeroAmountAutoApply: boolean;
  preview: UpgradePreview;
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `upg_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `upg_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export interface PendingDowngrade {
  fromEntitlementId: string;
  fromPlanId: string;
  toPlanId: string;
  toPlanCode: string;
  toPlanName?: string;
  scheduledAt: string;
  effectiveAt: string;
  scheduledBy: string;
  notes?: string;
  /** ISO timestamp — once past, the downgrade can no longer be cancelled. */
  lockAfter: string;
}

export const upgradeService = {
  async preview(toPlanCode: string): Promise<UpgradePreview> {
    const { data } = await api.post<BackendEnvelope<UpgradePreview>>('/billing/upgrade/preview', {
      toPlanCode,
    });
    return data.data;
  },

  async execute(toPlanCode: string): Promise<ExecuteUpgradeResponse> {
    const idemKey = generateIdempotencyKey();
    const { data } = await api.post<BackendEnvelope<ExecuteUpgradeResponse>>(
      '/billing/upgrade',
      { toPlanCode },
      { headers: { 'Idempotency-Key': idemKey } },
    );
    return data.data;
  },

  // ---- Downgrade scheduling (§5.4) ----

  /**
   * Schedule a downgrade — takes effect at end of current billing period.
   * The user keeps the higher-tier features until then.
   */
  async scheduleDowngrade(args: {
    /** Omit to let the backend resolve the highest-tier active paid plan in the target's category. */
    fromEntitlementId?: string;
    toPlanId?: string;
    toPlanCode?: string;
    notes?: string;
  }): Promise<PendingDowngrade> {
    const { data } = await api.post<BackendEnvelope<PendingDowngrade>>(
      '/billing/upgrade/downgrade/schedule',
      args,
    );
    return data.data;
  },

  /** Returns the pending downgrade for an entitlement, or null if none scheduled. */
  async getPendingDowngrade(entitlementId: string): Promise<PendingDowngrade | null> {
    const { data } = await api.get<BackendEnvelope<PendingDowngrade | null>>(
      `/billing/upgrade/downgrade/${encodeURIComponent(entitlementId)}`,
    );
    return data.data;
  },

  /**
   * Cancel a scheduled downgrade. Backend rejects with 400 if we're inside
   * the 24h lock window.
   */
  async cancelPendingDowngrade(entitlementId: string): Promise<void> {
    await api.delete(`/billing/upgrade/downgrade/${encodeURIComponent(entitlementId)}`);
  },
};

export default upgradeService;
