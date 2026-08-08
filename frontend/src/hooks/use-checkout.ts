'use client';

import { useCallback, useState } from 'react';
import { orderService } from '@/services/order.service';
import { openRazorpayCheckout } from '@/lib/razorpay-checkout';
import type { ApiError } from '@/types/api';

export type CheckoutPhase = 'idle' | 'creating' | 'opening' | 'verifying' | 'success' | 'error';

export interface UseCheckoutResult {
  phase: CheckoutPhase;
  error: string | null;
  beginCheckout: (args: { planCode: string; couponCode?: string }) => Promise<void>;
  reset: () => void;
}

/**
 * useCheckout — orchestrates the create-order → open-checkout → verify flow.
 * Used by /pricing CTA and the standalone /billing/checkout/[code] page.
 */
export function useCheckout(
  opts: {
    onSuccess?: (orderId: string) => void;
    onFailure?: (msg: string) => void;
  } = {},
): UseCheckoutResult {
  const [phase, setPhase] = useState<CheckoutPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase('idle');
    setError(null);
  }, []);

  const beginCheckout = useCallback(
    async (args: { planCode: string; couponCode?: string }) => {
      setError(null);
      setPhase('creating');
      try {
        const order = await orderService.create({
          planCode: args.planCode,
          couponCode: args.couponCode,
        });
        setPhase('opening');
        const result = await openRazorpayCheckout({
          key: order.razorpay.keyId,
          order_id: order.razorpay.orderId,
          amount: order.razorpay.amount,
          currency: order.razorpay.currency,
          name: 'Hire Adda',
          description: order.plan?.name ?? 'Plan purchase',
          notes: { internalOrderId: order.order.id },
        });
        setPhase('verifying');
        await orderService.verify(order.order.id, {
          razorpay_order_id: result.razorpay_order_id,
          razorpay_payment_id: result.razorpay_payment_id,
          razorpay_signature: result.razorpay_signature,
        });
        setPhase('success');
        opts.onSuccess?.(order.order.id);
      } catch (err) {
        setPhase('error');
        let msg = 'Checkout failed — please try again.';
        if (err instanceof Error) {
          if (err.message === 'CHECKOUT_DISMISSED') msg = 'Checkout cancelled.';
          else msg = err.message;
        } else if (typeof err === 'object' && err !== null) {
          const apiErr = err as unknown as ApiError;
          if (apiErr.message) msg = apiErr.message;
          else if ('error' in err && typeof err.error === 'object' && err.error !== null) {
            const rzpErr = err.error as { description?: string; reason?: string };
            msg = rzpErr.description ?? rzpErr.reason ?? msg;
          }
        }
        setError(msg);
        opts.onFailure?.(msg);
      }
    },
    [opts],
  );

  return { phase, error, beginCheckout, reset };
}
