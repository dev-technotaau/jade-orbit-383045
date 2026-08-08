'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  Zap,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { useAuth } from '@/hooks/use-auth';
import {
  upgradeService,
  type UpgradePreview,
  type PendingDowngrade,
} from '@/services/upgrade.service';
import { openRazorpayCheckout, type RazorpayCheckoutFailure } from '@/lib/razorpay-checkout';
import { orderService } from '@/services/order.service';
import { usePricingHref } from '@/lib/pricing-href';
import { formatPaise } from '@/types/billing';
import type { ApiError } from '@/types/api';

type Phase =
  | 'loading'
  | 'ready'
  | 'executing'
  | 'opening'
  | 'verifying'
  | 'success'
  | 'scheduled'
  | 'error';

export default function UpgradePage() {
  const params = useParams();
  const router = useRouter();
  const pricingHref = usePricingHref();
  const { user } = useAuth();
  const code = decodeURIComponent(String(params?.planCode ?? ''));
  const [preview, setPreview] = useState<UpgradePreview | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<PendingDowngrade | null>(null);

  useEffect(() => {
    let active = true;
    upgradeService
      .preview(code)
      .then((res) => {
        if (active) {
          setPreview(res);
          setPhase('ready');
        }
      })
      .catch((err) => {
        if (active) {
          setError(err?.message ?? 'Failed to compute upgrade preview');
          setPhase('error');
        }
      });
    return () => {
      active = false;
    };
  }, [code]);

  async function confirm() {
    if (!preview || !user) return;
    setError(null);

    // Downgrades are never executed immediately — they're scheduled at the
    // end of the current period (the backend enforces this too).
    if (preview.changeType === 'DOWNGRADE') {
      setPhase('executing');
      try {
        const pending = await upgradeService.scheduleDowngrade({ toPlanCode: code });
        setScheduled(pending);
        setPhase('scheduled');
      } catch (err) {
        setError((err as unknown as ApiError)?.message ?? 'Failed to schedule downgrade');
        setPhase('error');
      }
      return;
    }

    setPhase('executing');
    let exec;
    try {
      exec = await upgradeService.execute(code);
    } catch (err) {
      setError((err as unknown as ApiError)?.message ?? 'Failed to execute upgrade');
      setPhase('error');
      return;
    }

    if (exec.zeroAmountAutoApply) {
      setPhase('success');
      router.replace(`/billing/orders/${exec.order.id}?from=upgrade`);
      return;
    }

    if (!exec.razorpay) {
      setError('Upgrade requires payment but no Razorpay session was created.');
      setPhase('error');
      return;
    }

    setPhase('opening');
    let success;
    try {
      success = await openRazorpayCheckout({
        key: exec.razorpay.keyId,
        amount: exec.razorpay.amount,
        currency: exec.razorpay.currency,
        name: 'Hire Adda',
        description: `Upgrade to ${preview.toPlan.name}`,
        order_id: exec.razorpay.orderId,
        prefill: {
          name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || undefined,
          email: user.email,
        },
        theme: { color: '#1E5CAF' },
        notes: {
          receipt: exec.order.receiptNumber,
          upgradeFromOrderId: preview.fromOrder?.id ?? '',
        },
        retry: { enabled: true, max_count: 2 },
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'CHECKOUT_DISMISSED') {
        setPhase('ready');
        return;
      }
      const fail = err as RazorpayCheckoutFailure;
      setError(fail?.error?.description ?? 'Payment failed.');
      setPhase('error');
      return;
    }

    setPhase('verifying');
    try {
      const result = await orderService.verify(exec.order.id, {
        razorpay_order_id: success.razorpay_order_id,
        razorpay_payment_id: success.razorpay_payment_id,
        razorpay_signature: success.razorpay_signature,
      });
      if (result.status === 'PAID') {
        setPhase('success');
        router.replace(`/billing/orders/${exec.order.id}?from=upgrade`);
        return;
      }
      setError(`Verification returned ${result.status}`);
      setPhase('error');
    } catch (err) {
      setError((err as unknown as ApiError)?.message ?? 'Verification failed');
      setPhase('error');
    }
  }

  if (phase === 'loading') {
    return (
      <DashboardLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (!preview) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-2xl px-4 py-12">
          <Card padding="lg">
            <p className="text-[var(--text-muted)]">{error ?? 'Cannot prepare upgrade.'}</p>
            <Link href={pricingHref} className="text-primary mt-4 inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to pricing
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const isFreeUpgrade = preview.netChargePaise === 0;
  const isDowngrade = preview.changeType === 'DOWNGRADE';
  const inProgress =
    phase === 'executing' ||
    phase === 'opening' ||
    phase === 'verifying' ||
    phase === 'success' ||
    phase === 'scheduled';

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link
          href={pricingHref}
          className="text-primary mb-6 inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to pricing
        </Link>

        <h1 className="text-3xl font-bold text-[var(--text)]">
          {preview.changeType === 'DOWNGRADE'
            ? 'Schedule downgrade'
            : preview.changeType === 'SAME_PRICE_SWAP'
              ? 'Switch plan'
              : 'Upgrade your plan'}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {isDowngrade
            ? 'Your current plan stays active until it ends — the cheaper plan starts after that.'
            : "We've calculated your unused credit + carry-forward — you only pay the difference."}
        </p>

        {/* Plan transition banner — same shell as <Card variant="default"
            padding="lg"> plus the accent-bar + hover language shared with the
            pricing plan cards. The destination plan is emphasised so the
            direction of the change reads at a glance. (The upgrade preview
            payload has no plan `category`, so this surface uses the primary
            accent rather than a category illustration.) */}
        <div className="group relative mt-6 overflow-hidden rounded-xl border border-[var(--border)] bg-gradient-to-br from-[var(--bg-secondary)] to-white transition-all duration-300 hover:shadow-lg">
          <span
            aria-hidden="true"
            className="bg-primary absolute inset-x-0 top-0 z-10 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
          />
          <div className="p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs tracking-wide text-[var(--text-muted)] uppercase">From</p>
                <p className="mt-1 font-semibold text-[var(--text-secondary)]">
                  {preview.fromPlan.name}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {formatPaise(preview.fromPlan.basePricePaise, preview.fromPlan.currency)} ·{' '}
                  {preview.fromPlan.validityDays} days
                </p>
              </div>
              <ArrowRight className="text-primary h-6 w-6 flex-none transition-transform duration-300 group-hover:translate-x-1" />
              <div className="text-right">
                <p className="text-primary text-xs font-semibold tracking-wide uppercase">To</p>
                <p className="mt-1 text-lg font-bold text-[var(--text)]">{preview.toPlan.name}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {formatPaise(preview.toPlan.basePricePaise, preview.toPlan.currency)} ·{' '}
                  {preview.toPlan.validityDays ?? '—'} days
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Pro-rata math (immediate changes) / schedule explanation (downgrades) */}
        {isDowngrade ? (
          <Card padding="lg" className="mt-4">
            <h2 className="text-base font-semibold text-[var(--text)]">How scheduling works</h2>
            <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
              <li>
                {preview.fromPlan.name} stays fully active for the remaining{' '}
                {Math.round(preview.remainingSeconds / 86400)} day
                {Math.round(preview.remainingSeconds / 86400) === 1 ? '' : 's'} — nothing changes
                today and nothing is charged today.
              </li>
              <li>
                When it ends, we&apos;ll notify you with a checkout link for {preview.toPlan.name} (
                {formatPaise(preview.toPlan.basePricePaise, preview.toPlan.currency)}, tax
                inclusive).
              </li>
              <li>You can cancel the scheduled downgrade until 24h before your plan ends.</li>
            </ul>
          </Card>
        ) : (
          <Card padding="lg" className="mt-4">
            <h2 className="text-base font-semibold text-[var(--text)]">Pro-rata calculation</h2>
            <table className="mt-3 w-full text-sm">
              <tbody>
                <tr>
                  <td className="py-1.5 text-[var(--text-muted)]">
                    Days remaining on {preview.fromPlan.name}
                  </td>
                  <td className="py-1.5 text-right font-medium">
                    {Math.round(preview.remainingSeconds / 86400)} days (
                    {Math.round(preview.remainingRatio * 100)}%)
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 text-[var(--text-muted)]">Pro-rata credit</td>
                  <td className="py-1.5 text-right font-medium text-green-700">
                    - {formatPaise(preview.unusedValuePaise, preview.toPlan.currency)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 text-[var(--text-muted)]">{preview.toPlan.name} price</td>
                  <td className="py-1.5 text-right font-medium">
                    {formatPaise(preview.toPlan.basePricePaise, preview.toPlan.currency)}
                  </td>
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="py-2 font-semibold text-[var(--text)]">You pay</td>
                  <td className="py-2 text-right text-2xl font-bold">
                    {isFreeUpgrade
                      ? 'Free'
                      : formatPaise(preview.netChargePaise, preview.toPlan.currency)}
                  </td>
                </tr>
              </tbody>
            </table>
            {!isFreeUpgrade && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Tax inclusive · CGST{' '}
                {formatPaise(preview.newOrderPricing.cgstPaise, preview.toPlan.currency)} · SGST{' '}
                {formatPaise(preview.newOrderPricing.sgstPaise, preview.toPlan.currency)} · IGST{' '}
                {formatPaise(preview.newOrderPricing.igstPaise, preview.toPlan.currency)}
              </p>
            )}
          </Card>
        )}

        {/* Carry-forward — immediate changes only; a scheduled downgrade
            starts fresh after the current plan expires */}
        {!isDowngrade && preview.carryForward.length > 0 && (
          <Card padding="lg" className="mt-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
              <Sparkles className="text-primary h-5 w-5" /> Carry-forward credits
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Your unused units roll over (capped per resource).
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {preview.carryForward.map((line) => (
                <li
                  key={line.unit}
                  className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] p-3"
                >
                  <div>
                    <p className="font-medium text-[var(--text)]">
                      {line.unit.replace(/_/g, ' ').toLowerCase()}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Carrying {line.carried} unused
                      {line.cap !== null && ` (cap ${line.cap})`}
                      {(line.usedDeducted ?? 0) > 0 &&
                        `, minus ${line.usedDeducted} already used`}{' '}
                      → effective {line.effectiveAllocation} units this period
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <span className="font-semibold text-[var(--text)]">+{line.carried}</span>
                    <span className="text-[var(--text-muted)]">
                      {' '}
                      on top of {line.newPeriodAllocation}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Warnings */}
        {preview.warnings.length > 0 && (
          <Card padding="md" className="mt-4 border-yellow-300 bg-yellow-50">
            <ul className="space-y-1.5 text-sm text-yellow-900">
              {preview.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" /> {w}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Confirm */}
        <Card padding="lg" className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--text-muted)]">
              {preview.changeType === 'UPGRADE' && 'Activates immediately on payment.'}
              {preview.changeType === 'DOWNGRADE' &&
                'Nothing is charged now — we notify you to complete checkout when your current plan ends.'}
              {preview.changeType === 'SAME_PRICE_SWAP' &&
                'Same-price swap — activates immediately.'}
            </p>
            <Button
              variant="primary"
              size="lg"
              onClick={() => void confirm()}
              isLoading={inProgress}
              disabled={inProgress}
            >
              {phase === 'executing' && (isDowngrade ? 'Scheduling...' : 'Creating order...')}
              {phase === 'opening' && 'Opening checkout...'}
              {phase === 'verifying' && 'Verifying...'}
              {phase === 'success' && 'Done'}
              {phase === 'scheduled' && 'Scheduled'}
              {(phase === 'ready' || phase === 'error') && (
                <span className="inline-flex items-center gap-2">
                  {isDowngrade ? (
                    <>
                      <Zap className="h-4 w-4" /> Schedule downgrade
                    </>
                  ) : isFreeUpgrade ? (
                    <>
                      <Zap className="h-4 w-4" /> Apply upgrade
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" /> Pay{' '}
                      {formatPaise(preview.netChargePaise, preview.toPlan.currency)}
                    </>
                  )}
                </span>
              )}
            </Button>
          </div>
          {error && (
            <p className="mt-3 text-sm text-[var(--error)]" role="alert">
              {error}
            </p>
          )}
        </Card>

        {phase === 'success' && (
          <Card padding="md" className="mt-4 border-green-300 bg-green-50">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-green-900">
              <CheckCircle2 className="h-4 w-4" /> Upgrade complete — redirecting...
            </p>
          </Card>
        )}

        {phase === 'scheduled' && scheduled && (
          <Card padding="md" className="mt-4 border-green-300 bg-green-50">
            <p className="inline-flex items-start gap-2 text-sm font-semibold text-green-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" /> Downgrade scheduled —{' '}
              {preview.toPlan.name} takes over when your current plan ends on{' '}
              {new Date(scheduled.effectiveAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
              . You can cancel it from Billing → Credits until 24h before then.
            </p>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
