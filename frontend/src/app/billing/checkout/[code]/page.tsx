'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Sparkles, Lock, CheckCircle2, Minus, Plus } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { useAuth } from '@/hooks/use-auth';
import { planService } from '@/services/plan.service';
import { orderService } from '@/services/order.service';
import { subscriptionService } from '@/services/subscription.service';
import { type ValidatedCouponDTO } from '@/services/coupon.service';
import { usePricingHref } from '@/lib/pricing-href';
import CouponInput from '@/components/billing/CouponInput';
import { openRazorpayCheckout, type RazorpayCheckoutFailure } from '@/lib/razorpay-checkout';
import { formatPaise, type Plan } from '@/types/billing';
import PlanVisualBand from '@/components/billing/plan-visuals';
import { getPlanTier, getPlanTierVisual } from '@/components/billing/plan-theme';
import { isMultiQuantityPlan, MAX_PLAN_PURCHASE_QUANTITY } from '@/constants/billing';
import type { ApiError } from '@/types/api';

type CheckoutPhase =
  | 'loading'
  | 'ready'
  | 'creating'
  | 'opening'
  | 'verifying'
  | 'success'
  | 'error';

export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const code = decodeURIComponent(String(params?.code ?? ''));
  const pricingHref = usePricingHref();

  const [plan, setPlan] = useState<Plan | null>(null);
  const [phase, setPhase] = useState<CheckoutPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  // The coupon is tagged with the quantity it was validated against —
  // an in-flight validation resolving AFTER a quantity change would
  // otherwise re-apply a discount computed for the old amount.
  const [coupon, setCoupon] = useState<(ValidatedCouponDTO & { forQuantity: number }) | null>(null);
  const [quantity, setQuantity] = useState(1);

  // Hoisted above startCheckout (which closes over it) so the gate can
  // never be read before initialization.
  const canMultiQty = !!plan && isMultiQuantityPlan(plan.code) && plan.billingCycle === 'ONE_TIME';

  // A coupon only counts if it was validated for the current quantity.
  const activeCoupon = coupon && coupon.forQuantity === quantity ? coupon : null;

  // Changing quantity changes the order amount, so any coupon validated
  // against the old amount must be re-applied.
  function changeQuantity(next: number) {
    setQuantity(Math.min(MAX_PLAN_PURCHASE_QUANTITY, Math.max(1, next)));
    setCoupon(null);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await planService.getByCode(code);
        if (!active) return;
        if (!p) {
          setError('Plan not found');
          setPhase('error');
          return;
        }
        if (p.requiresQuote) {
          router.replace('/billing/quote');
          return;
        }
        setPlan(p);
        setPhase('ready');
      } catch (err) {
        const apiErr = err as unknown as ApiError;
        setError(apiErr?.message ?? 'Failed to load plan');
        setPhase('error');
      }
    })();
    return () => {
      active = false;
    };
  }, [code, router]);

  async function startCheckout() {
    if (!plan || !user) return;
    setError(null);
    setPhase('creating');

    // Subscription plans (Vendor Connect, etc.) use Razorpay's hosted
    // subscription page — we create the subscription and redirect.
    if (plan.billingCycle !== 'ONE_TIME') {
      try {
        const subResponse = await subscriptionService.create({
          planCode: plan.code,
          notifyEmail: user.email,
          metadata: { source: 'web_checkout' },
        });
        if (subResponse.razorpay.shortUrl) {
          window.location.href = subResponse.razorpay.shortUrl;
          return;
        }
        // Fallback — redirect to subscription detail (mandate auth in-app)
        router.replace(`/billing/subscriptions/${subResponse.subscription.id}`);
        return;
      } catch (err) {
        const apiErr = err as unknown as ApiError;
        setError(apiErr?.message ?? 'Failed to create subscription');
        setPhase('error');
        return;
      }
    }

    let response;
    try {
      response = await orderService.create({
        planCode: plan.code,
        quantity: canMultiQty ? quantity : undefined,
        buyerEmail: user.email,
        buyerStateCode: undefined, // backend will fall back to default state
        couponCode: activeCoupon?.code,
        notes: { source: 'web_checkout' },
      });
    } catch (err) {
      const apiErr = err as unknown as ApiError;
      setError(apiErr?.message ?? 'Failed to create order');
      setPhase('error');
      return;
    }

    setPhase('opening');
    let success;
    try {
      // Prefill contact so Razorpay skips its own "verify mobile" step.
      // When the number is already verified on our side we ALSO mark it
      // readonly so Razorpay won't ask the user to confirm/edit it. If
      // we don't have a number, fall through to Razorpay's default
      // contact collection.
      const prefillContact = user.mobileNumber ?? undefined;
      success = await openRazorpayCheckout({
        key: response.razorpay.keyId,
        amount: response.razorpay.amount,
        currency: response.razorpay.currency,
        name: 'Hire Adda',
        description: `${plan.name} — ${plan.shortDescription ?? ''}`.trim(),
        order_id: response.razorpay.orderId,
        prefill: {
          name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || undefined,
          email: user.email,
          contact: prefillContact,
        },
        readonly: prefillContact && user.isMobileVerified ? { contact: true } : undefined,
        theme: { color: '#1E5CAF' },
        notes: { receipt: response.order.receiptNumber },
        retry: { enabled: true, max_count: 2 },
        remember_customer: true,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'CHECKOUT_DISMISSED') {
        setPhase('ready');
        return;
      }
      const fail = err as RazorpayCheckoutFailure;
      setError(fail?.error?.description ?? 'Payment failed. Please try again.');
      setPhase('error');
      return;
    }

    setPhase('verifying');
    try {
      const result = await orderService.verify(response.order.id, {
        razorpay_order_id: success.razorpay_order_id,
        razorpay_payment_id: success.razorpay_payment_id,
        razorpay_signature: success.razorpay_signature,
      });
      if (result.status === 'PAID') {
        setPhase('success');
        router.replace(`/billing/orders/${response.order.id}?from=checkout`);
        return;
      }
      setError(`Payment verification returned status ${result.status}`);
      setPhase('error');
    } catch (err) {
      const apiErr = err as unknown as ApiError;
      setError(apiErr?.message ?? 'Payment verification failed');
      setPhase('error');
    }
  }

  if (phase === 'loading') {
    return (
      <DashboardLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (!plan) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-2xl px-4 py-12">
          <Card padding="lg">
            <h1 className="text-xl font-semibold text-[var(--text)]">Plan unavailable</h1>
            <p className="mt-2 text-[var(--text-muted)]">{error ?? 'Plan not found.'}</p>
            <Link href={pricingHref} className="text-primary mt-6 inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to pricing
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Category accent shared with the pricing plan cards. Plain lookup (not a
  // hook), so it is safe below the early returns above.
  // Tier-aware so the checkout band matches the exact rung the buyer picked
  // on the pricing page, rather than the generic category treatment.
  const planTier = getPlanTier(plan);
  const planVisual = getPlanTierVisual(plan.category, planTier).theme;
  const total = plan.basePricePaise * (canMultiQty ? quantity : 1);
  const inProgress =
    phase === 'creating' || phase === 'opening' || phase === 'verifying' || phase === 'success';

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link
          href={pricingHref}
          className="text-primary mb-6 inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to pricing
        </Link>

        <h1 className="text-3xl font-bold text-[var(--text)]">Checkout</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Secure payment via Razorpay — UPI, cards, netbanking, wallets, EMI.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* Plan summary — same shell as <Card variant="default" padding="lg">
              plus the shared category illustration band + accent, so buying a
              plan in the dashboard looks like the pricing page it came from.
              `Card` itself is untouched (it has no padding="none"). */}
          <div className="group relative self-start overflow-hidden rounded-xl border border-[var(--border)] bg-white transition-all duration-300 hover:shadow-lg">
            <span
              aria-hidden="true"
              className={`absolute inset-x-0 top-0 z-10 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100 ${planVisual.bar}`}
            />
            <PlanVisualBand category={plan.category} size="md" tier={planTier} />
            <div className="px-8 pt-5 pb-8">
              <h2 className="text-lg font-semibold text-[var(--text)]">{plan.name}</h2>
              {plan.shortDescription && (
                <p className="mt-1 text-sm text-[var(--text-muted)]">{plan.shortDescription}</p>
              )}
              <ul className="mt-4 space-y-2 text-sm">
                {plan.features
                  .filter((f) => f.included)
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((f) => (
                    <li key={f.key} className="flex items-start gap-2">
                      <CheckCircle2
                        className={`mt-0.5 h-4 w-4 flex-none ${planVisual.text}`}
                        aria-hidden="true"
                      />
                      <span className="text-[var(--text)]">{f.label}</span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>

          <Card padding="lg" className="self-start">
            {/* Order-summary line items: the LABEL stays muted so it
                reads as a column header, but the VALUE bumps to
                `text-[var(--text)]` so the price the user is being
                asked to pay is the most legible thing on the row. */}
            {canMultiQty && (
              <>
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Quantity</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => changeQuantity(quantity - 1)}
                      disabled={quantity <= 1 || inProgress}
                      aria-label="Decrease quantity"
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center font-semibold text-[var(--text)]">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => changeQuantity(quantity + 1)}
                      disabled={quantity >= MAX_PLAN_PURCHASE_QUANTITY || inProgress}
                      aria-label="Increase quantity"
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="mb-3 text-xs text-[var(--text-muted)]">
                  Each unit adds the plan&apos;s full credits (
                  {formatPaise(plan.basePricePaise, plan.currency)} per unit, max{' '}
                  {MAX_PLAN_PURCHASE_QUANTITY} per order). You can always buy more later.
                </p>
              </>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">
                Subtotal{canMultiQty && quantity > 1 ? ` (×${quantity})` : ''}
              </span>
              <span className="font-medium text-[var(--text)]">
                {formatPaise(total, plan.currency)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)]">
                GST {plan.gstRatePercent}% (inclusive)
              </span>
              <span className="text-[var(--text-secondary)]">included</span>
            </div>
            {activeCoupon && (
              <div className="mt-1 flex items-center justify-between text-sm text-green-700">
                <span>Coupon {activeCoupon.code}</span>
                <span>- {formatPaise(activeCoupon.discountPaise, plan.currency)}</span>
              </div>
            )}
            <div className="mt-4">
              <CouponInput
                planCode={plan.code}
                orderAmountPaise={total}
                currency={plan.currency}
                applied={activeCoupon}
                onApply={(c) => setCoupon({ ...c, forQuantity: quantity })}
                onRemove={() => setCoupon(null)}
                disabled={inProgress}
              />
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3">
              <span className="text-sm font-semibold text-[var(--text)]">Total payable</span>
              <span className="text-2xl font-bold text-[var(--text)]">
                {formatPaise(
                  Math.max(0, total - (activeCoupon?.discountPaise ?? 0)),
                  plan.currency,
                )}
              </span>
            </div>

            <Button
              variant="primary"
              className="mt-6 w-full"
              onClick={() => void startCheckout()}
              isLoading={inProgress}
              disabled={inProgress}
            >
              {phase === 'creating' && 'Creating order...'}
              {phase === 'opening' && 'Opening payment...'}
              {phase === 'verifying' && 'Verifying...'}
              {phase === 'success' && 'Success'}
              {(phase === 'ready' || phase === 'error') && (
                <span className="inline-flex items-center gap-2">
                  <Lock className="h-4 w-4" /> Pay securely
                </span>
              )}
            </Button>

            {error && (
              <p className="mt-3 text-sm text-[var(--error)]" role="alert">
                {error}
              </p>
            )}

            <ul className="mt-6 space-y-2 text-xs text-[var(--text-muted)]">
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-none" /> 256-bit TLS · PCI-DSS via
                Razorpay
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 flex-none" /> GST tax invoice generated
                automatically
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" /> 2-day refund window — see
                <Link href="/refund-policy" className="text-primary ml-1 underline">
                  policy
                </Link>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
