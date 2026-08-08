'use client';

import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { useCheckout } from '@/hooks/use-checkout';
import { ArrowRight } from 'lucide-react';

interface Props {
  planCode: string;
  couponCode?: string;
  /** When provided, render this label instead of "Buy now". */
  label?: string;
  /** Where to send the user after a successful payment. Default: /billing/orders/{id}. */
  successHref?: (orderId: string) => string;
  variant?: 'primary' | 'secondary' | 'outline';
  className?: string;
  /** Hide the button if the plan requires a quote (CV Enterprise) — caller should redirect to /billing/quote instead. */
  requiresQuote?: boolean;
}

export default function CheckoutButton({
  planCode,
  couponCode,
  label = 'Buy now',
  successHref = (orderId) => `/billing/orders/${orderId}?status=paid`,
  variant = 'primary',
  className,
  requiresQuote = false,
}: Props) {
  const router = useRouter();
  const { phase, error, beginCheckout } = useCheckout({
    onSuccess: (orderId) => router.push(successHref(orderId)),
  });

  if (requiresQuote) {
    return (
      <Button variant={variant} onClick={() => router.push('/billing/quote')} className={className}>
        Request Quote <ArrowRight size={16} />
      </Button>
    );
  }

  const busy = phase === 'creating' || phase === 'opening' || phase === 'verifying';

  return (
    <div className="flex flex-col items-stretch gap-2">
      <Button
        variant={variant}
        onClick={() => beginCheckout({ planCode, couponCode })}
        disabled={busy}
        className={className}
      >
        {busy ? (
          <>
            <Spinner /> {phase === 'verifying' ? 'Verifying…' : 'Opening…'}
          </>
        ) : (
          <>
            {label} <ArrowRight size={16} />
          </>
        )}
      </Button>
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
