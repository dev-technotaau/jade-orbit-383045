import { useMutation } from '@tanstack/react-query';
import { couponService, type ValidatedCouponDTO } from '@/services/coupon.service';

export function useValidateCoupon() {
  return useMutation<
    ValidatedCouponDTO,
    Error,
    { code: string; planCode: string; orderAmountPaise: number }
  >({
    mutationFn: (args) => couponService.validate(args),
  });
}
