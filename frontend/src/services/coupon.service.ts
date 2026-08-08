import api from '@/lib/api';

interface BackendEnvelope<T> {
  success?: boolean;
  message?: string;
  data: T;
}

export interface ValidatedCouponDTO {
  code: string;
  type: 'PERCENT' | 'FLAT' | 'FIRST_MONTH_FREE' | 'TRIAL_EXTEND' | 'FREE_PLAN';
  scope: 'GLOBAL' | 'ROLE_TARGETED' | 'USER_TARGETED' | 'PLAN_TARGETED' | 'COMBO';
  discountPaise: number;
  trialExtendDays: number | null;
  descriptionHtml: string | null;
}

export interface AppliedCouponDTO extends ValidatedCouponDTO {
  applied: true;
  appliedAt: string;
}

export const couponService = {
  /**
   * Preview-only validation. Hits the same eligibility chain as `apply()`
   * but emits no audit event — useful for "as you type" checkout coupon
   * inputs that should re-validate on every keystroke.
   */
  async validate(args: {
    code: string;
    planCode: string;
    orderAmountPaise: number;
  }): Promise<ValidatedCouponDTO> {
    const { data } = await api.post<BackendEnvelope<ValidatedCouponDTO>>(
      '/billing/coupons/validate',
      args,
    );
    return data.data;
  },

  /**
   * Confirm-and-apply variant. Same validation as `validate()` but emits
   * a `COUPON_APPLIED` audit event so super-admin can correlate apply→pay
   * funnel drop-off. The order-create call still re-validates server-side,
   * so this is purely an analytics/audit hook.
   */
  async apply(args: {
    code: string;
    planCode: string;
    orderAmountPaise: number;
  }): Promise<AppliedCouponDTO> {
    const { data } = await api.post<BackendEnvelope<AppliedCouponDTO>>(
      '/billing/coupons/apply',
      args,
    );
    return data.data;
  },
};

export default couponService;
