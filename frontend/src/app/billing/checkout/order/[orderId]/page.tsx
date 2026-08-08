'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  RefreshCw,
  Lock,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { orderService } from '@/services/order.service';
import { openRazorpayCheckout } from '@/lib/razorpay-checkout';
import { usePricingHref } from '@/lib/pricing-href';
import { formatPaise } from '@/types/billing';
import type { OrderDetail, OrderStatus } from '@/types/order';
import type { ApiError } from '@/types/api';

type Phase =
  | 'loading'
  | 'ready'
  | 'opening'
  | 'verifying'
  | 'success'
  | 'error'
  | 'expired'
  | 'paid';

/**
 * Resume-checkout page — `/billing/checkout/order/[orderId]`.
 *
 * Distinct from the pre-order `/billing/checkout/[code]` flow: this page
 * loads an existing Order row, displays its status, and lets the user
 * resume / retry payment without starting a fresh order. Useful for:
 *   - Razorpay modal closed before payment completed
 *   - Network failure mid-checkout
 *   - User abandons on a different device, returns later
 *   - Email link from a payment-failed notification
 *
 * Lives under `/order/[orderId]` (rather than alongside `[code]`) so the
 * two dynamic segments don't conflict at the same Next.js routing level.
 */
export default function ResumeCheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = String(params?.orderId ?? '');
  const pricingHref = usePricingHref();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    orderService
      .get(orderId)
      .then((o) => {
        if (!active) return;
        setOrder(o);
        if (o.status === 'PAID') setPhase('paid');
        else if (
          o.expiresAt &&
          new Date(o.expiresAt).getTime() < Date.now() &&
          o.status !== 'CREATED'
        ) {
          setPhase('expired');
        } else {
          setPhase('ready');
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load order');
        setPhase('error');
      });
    return () => {
      active = false;
    };
  }, [orderId]);

  const launchCheckout = async () => {
    if (!order) return;
    setError(null);
    setPhase('opening');
    try {
      // Always retry through the backend so we get a valid Razorpay order id
      // (the original may have expired even if our row hasn't).
      const retried = await orderService.retry(order.id);
      const result = await openRazorpayCheckout({
        key: retried.razorpay.keyId,
        order_id: retried.razorpay.orderId,
        amount: retried.razorpay.amount,
        currency: retried.razorpay.currency,
        name: 'Hire Adda',
        description: `Order ${retried.order.receiptNumber ?? retried.order.id.slice(-8)}`,
        notes: { internalOrderId: retried.order.id },
      });
      setPhase('verifying');
      await orderService.verify(retried.order.id, {
        razorpay_order_id: result.razorpay_order_id,
        razorpay_payment_id: result.razorpay_payment_id,
        razorpay_signature: result.razorpay_signature,
      });
      setPhase('success');
      router.replace(`/billing/orders/${retried.order.id}?from=checkout`);
    } catch (err) {
      let msg = 'Checkout failed — please try again.';
      if (err instanceof Error) {
        msg =
          err.message === 'CHECKOUT_DISMISSED' ? 'Cancelled — you can retry anytime.' : err.message;
      } else if (typeof err === 'object' && err !== null) {
        const apiErr = err as unknown as ApiError;
        if (apiErr.message) msg = apiErr.message;
        else if ('error' in err) {
          const rzpErr = (err as { error?: { description?: string } }).error;
          if (rzpErr?.description) msg = rzpErr.description;
        }
      }
      setError(msg);
      setPhase('error');
    }
  };

  if (phase === 'loading') {
    return (
      <DashboardLayout requiredRole={['EMPLOYER', 'CANDIDATE']}>
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </DashboardLayout>
    );
  }
  if (phase === 'error' || !order) {
    return (
      <DashboardLayout requiredRole={['EMPLOYER', 'CANDIDATE']}>
        <div className="mx-auto max-w-2xl px-4 py-10">
          <Card padding="lg">
            <p className="text-sm text-red-600">{error ?? 'Order not found.'}</p>
            <Link
              href="/billing/orders"
              className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              <ArrowLeft size={14} /> Back to orders
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const planName = order.plan?.name ?? 'Plan';

  return (
    <DashboardLayout requiredRole={['EMPLOYER', 'CANDIDATE']}>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
        <Link
          href="/billing/orders"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={14} /> All orders
        </Link>

        <Card padding="lg">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30">
              <CreditCard size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-[var(--text)]">
                {planName}
                {(order.quantity ?? 1) > 1 ? ` × ${order.quantity}` : ''}
              </h1>
              <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
                Order {order.receiptNumber ?? order.id.slice(-8)}
              </p>
            </div>
            <span className="text-xl font-extrabold text-[var(--text)]">
              {formatPaise(order.totalPaise, order.currency)}
            </span>
          </div>

          <div className="mt-6 border-t border-[var(--border)] pt-4">
            <StatusPanel status={order.status} expiresAt={order.expiresAt ?? null} phase={phase} />
          </div>

          {error ? (
            <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {phase === 'paid' ? (
              <Link href={`/billing/orders/${order.id}`}>
                <Button variant="primary" fullWidth>
                  View paid order →
                </Button>
              </Link>
            ) : phase === 'expired' ||
              order.status === 'CANCELLED' ||
              order.status === 'EXPIRED' ? (
              <Link href={pricingHref}>
                <Button variant="primary">Start fresh checkout →</Button>
              </Link>
            ) : (
              <>
                <Link href="/billing/orders">
                  <Button variant="ghost">Cancel</Button>
                </Link>
                <Button
                  variant="primary"
                  onClick={launchCheckout}
                  disabled={phase === 'opening' || phase === 'verifying'}
                >
                  {phase === 'opening' ? (
                    <>
                      <Spinner /> Opening checkout…
                    </>
                  ) : phase === 'verifying' ? (
                    <>
                      <Spinner /> Verifying…
                    </>
                  ) : phase === 'success' ? (
                    <>
                      <CheckCircle2 size={16} /> Done
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} /> Resume payment
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </Card>

        <p className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <Lock size={12} /> Secure 256-bit TLS · payments processed by Razorpay
        </p>
      </div>
    </DashboardLayout>
  );
}

function StatusPanel({
  status,
  expiresAt,
  phase,
}: {
  status: OrderStatus;
  expiresAt: string | null;
  phase: Phase;
}) {
  if (status === 'PAID') {
    return (
      <div className="flex items-start gap-3 rounded-lg border-l-4 border-emerald-500 bg-emerald-50 p-3 dark:bg-emerald-900/20">
        <CheckCircle2 className="mt-0.5 flex-shrink-0 text-emerald-600" size={18} />
        <div className="text-sm">
          <p className="font-semibold text-emerald-900 dark:text-emerald-200">Already paid</p>
          <p className="mt-0.5 text-emerald-800 dark:text-emerald-300">
            This order has been settled. View your invoice + receipt on the order detail page.
          </p>
        </div>
      </div>
    );
  }
  if (status === 'CANCELLED' || status === 'EXPIRED' || phase === 'expired') {
    return (
      <div className="flex items-start gap-3 rounded-lg border-l-4 border-gray-500 bg-gray-50 p-3 dark:bg-gray-900/20">
        <Clock className="mt-0.5 flex-shrink-0 text-gray-600" size={18} />
        <div className="text-sm">
          <p className="font-semibold text-[var(--text)]">
            {status === 'CANCELLED' ? 'Cancelled' : 'Expired'}
          </p>
          <p className="mt-0.5 text-[var(--text-secondary)]">
            This checkout session is no longer active. Pricing/availability may have changed — start
            a fresh checkout to continue.
          </p>
        </div>
      </div>
    );
  }
  if (status === 'FAILED') {
    return (
      <div className="flex items-start gap-3 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-3 dark:bg-amber-900/20">
        <AlertTriangle className="mt-0.5 flex-shrink-0 text-amber-600" size={18} />
        <div className="text-sm">
          <p className="font-semibold text-amber-900 dark:text-amber-200">
            Previous attempt failed
          </p>
          <p className="mt-0.5 text-amber-800 dark:text-amber-300">
            No money was deducted. We&apos;ll open Razorpay again — pick a different method if you
            had bank issues earlier.
          </p>
        </div>
      </div>
    );
  }
  if (status === 'FRAUD_FLAGGED') {
    return (
      <div className="flex items-start gap-3 rounded-lg border-l-4 border-red-500 bg-red-50 p-3 dark:bg-red-900/20">
        <AlertTriangle className="mt-0.5 flex-shrink-0 text-red-600" size={18} />
        <div className="text-sm">
          <p className="font-semibold text-red-900 dark:text-red-200">Order flagged</p>
          <p className="mt-0.5 text-red-800 dark:text-red-300">
            This order is under review. Please contact support to proceed.
          </p>
        </div>
      </div>
    );
  }
  // CREATED / ATTEMPTED / REFUND_PENDING etc.
  const minutesLeft = expiresAt
    ? // eslint-disable-next-line react-hooks/purity
      Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 60000))
    : null;
  return (
    <div className="flex items-start gap-3 rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3 dark:bg-blue-900/20">
      <Clock className="mt-0.5 flex-shrink-0 text-blue-600" size={18} />
      <div className="text-sm">
        <p className="font-semibold text-blue-900 dark:text-blue-200">Ready to pay</p>
        <p className="mt-0.5 text-blue-800 dark:text-blue-300">
          Resume your payment — Razorpay will reopen with all available methods.
          {minutesLeft !== null
            ? minutesLeft > 0
              ? ` Window: ~${minutesLeft} min remaining.`
              : ' Window has closed — we will create a fresh Razorpay order.'
            : ''}
        </p>
      </div>
    </div>
  );
}
