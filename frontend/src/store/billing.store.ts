'use client';

import { create } from 'zustand';
import type { EntitlementSnapshot } from '@/types/entitlement';

/**
 * Lightweight billing store — caches the entitlement snapshot for instant
 * sidebar/quota gating and tracks an in-progress checkout session so the
 * razorpay-checkout modal flow survives navigation.
 *
 * The authoritative snapshot still lives in React Query (use-entitlements);
 * this store mirrors it so non-Suspense components (Header, Sidebar) can
 * read it synchronously without a re-fetch.
 */

export interface CheckoutInProgress {
  planCode: string;
  orderId?: string;
  couponCode?: string;
  startedAt: number;
}

interface BillingStore {
  snapshot: EntitlementSnapshot | null;
  setSnapshot: (s: EntitlementSnapshot | null) => void;

  checkout: CheckoutInProgress | null;
  beginCheckout: (args: Omit<CheckoutInProgress, 'startedAt'>) => void;
  finishCheckout: () => void;

  /** True when a renewal payment is in-flight or grace-period banner should show. */
  hasFailingRenewal: boolean;
  setHasFailingRenewal: (v: boolean) => void;
}

export const useBillingStore = create<BillingStore>((set) => ({
  snapshot: null,
  setSnapshot: (s) => set({ snapshot: s }),

  checkout: null,
  beginCheckout: (args) => set({ checkout: { ...args, startedAt: Date.now() } }),
  finishCheckout: () => set({ checkout: null }),

  hasFailingRenewal: false,
  setHasFailingRenewal: (v) => set({ hasFailingRenewal: v }),
}));

export const billingSelectors = {
  hasActivePlan: (s: BillingStore) => s.snapshot?.hasAnyActive === true,
  cvUnlocksRemaining: (s: BillingStore) => s.snapshot?.resources?.CV_UNLOCK?.totalRemaining ?? 0,
  jobPostsRemaining: (s: BillingStore) => s.snapshot?.resources?.JOB_POST?.totalRemaining ?? 0,
};
