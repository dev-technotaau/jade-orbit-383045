import Link from 'next/link';
import { CheckCircle2, Pause, XCircle, AlertTriangle } from 'lucide-react';
import type { SubscriptionListItem } from '@/types/subscription';
import { formatPaise } from '@/types/billing';
import {
  BILLING_CARD_INTERACTIVE,
  BILLING_CARD_SHELL,
  BillingAccentBar,
  BillingMedallion,
  RenewalGlyph,
  getBillingTone,
  type BillingTone,
} from '@/components/billing/billing-visuals';

interface Props {
  subscription: SubscriptionListItem;
}

/**
 * Existing colour/bg/icon/label values are unchanged — `tone` is added so the
 * card can pick a gradient medallion + accent bar from the shared billing tone
 * scale. A subscription's defining trait is that it RECURS, so its lead visual
 * is a renewal cycle (plus a cycle-progress meter) rather than plan art.
 */
const STATUS_TONE: Record<
  string,
  {
    color: string;
    bg: string;
    icon: React.ComponentType<{ size?: number }>;
    label: string;
    tone: BillingTone;
  }
> = {
  ACTIVE: {
    color: 'text-emerald-700',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    icon: CheckCircle2,
    label: 'Active',
    tone: 'success',
  },
  AUTHENTICATED: {
    color: 'text-blue-700',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    icon: CheckCircle2,
    label: 'Authenticated',
    tone: 'info',
  },
  PAUSED: {
    color: 'text-amber-700',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    icon: Pause,
    label: 'Paused',
    tone: 'pending',
  },
  HALTED: {
    color: 'text-red-700',
    bg: 'bg-red-50 dark:bg-red-900/20',
    icon: AlertTriangle,
    label: 'Halted',
    tone: 'danger',
  },
  CANCELLED: {
    color: 'text-gray-700',
    bg: 'bg-gray-50 dark:bg-gray-900/20',
    icon: XCircle,
    label: 'Cancelled',
    tone: 'neutral',
  },
  PENDING_CANCEL: {
    color: 'text-amber-700',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    icon: AlertTriangle,
    label: 'Cancel scheduled',
    tone: 'pending',
  },
  COMPLETED: {
    color: 'text-gray-700',
    bg: 'bg-gray-50 dark:bg-gray-900/20',
    icon: CheckCircle2,
    label: 'Completed',
    tone: 'neutral',
  },
  EXPIRED: {
    color: 'text-gray-700',
    bg: 'bg-gray-50 dark:bg-gray-900/20',
    icon: XCircle,
    label: 'Expired',
    tone: 'neutral',
  },
  CREATED: {
    color: 'text-amber-700',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    icon: AlertTriangle,
    label: 'Pending',
    tone: 'pending',
  },
};

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function SubscriptionCard({ subscription }: Props) {
  const tone = STATUS_TONE[subscription.status] ?? STATUS_TONE.CREATED;
  const Icon = tone.icon;
  const planName = subscription.plan?.name ?? 'Plan';
  const styles = getBillingTone(tone.tone);

  // Cycle meter — only meaningful for a fixed-length subscription. Open-ended
  // ones (totalCount null / 0) show the "∞" figure without a bar.
  const totalCycles = subscription.totalCount ?? 0;
  const hasCycleMeter = totalCycles > 0;
  const cyclePct = hasCycleMeter
    ? Math.min(100, Math.round((subscription.paidCount / totalCycles) * 100))
    : 0;

  return (
    <Link
      href={`/billing/subscriptions/${subscription.id}`}
      className={`${BILLING_CARD_SHELL} ${BILLING_CARD_INTERACTIVE} block ${styles.border}`}
    >
      <BillingAccentBar bar={styles.bar} />
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Renewal-cycle medallion */}
          <BillingMedallion tile={styles.tile}>
            <RenewalGlyph className="h-6 w-6" />
          </BillingMedallion>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-[var(--text)]">{planName}</h3>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {subscription.shortUrl ? 'Razorpay subscription' : 'Local subscription'}
            </p>
          </div>

          <span
            className={`inline-flex flex-none items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone.bg} ${tone.color}`}
          >
            <Icon size={12} />
            {tone.label}
          </span>
        </div>

        {/* Cycle progress — a subscription-specific readout of how far through
            the committed billing cycles this subscription is. */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)]">Cycles paid</span>
            <span className="font-semibold text-[var(--text)]">
              {subscription.paidCount}/{subscription.totalCount ?? '∞'}
            </span>
          </div>
          {hasCycleMeter && (
            <div
              className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-tertiary)]"
              role="progressbar"
              aria-valuenow={cyclePct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Billing cycles completed"
            >
              <div
                className={`h-full rounded-full transition-all duration-500 ${styles.bar}`}
                style={{ width: `${cyclePct}%` }}
              />
            </div>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-[var(--text-secondary)]">Auto-renew</dt>
            <dd className="font-medium text-[var(--text)]">
              {subscription.autoRenew ? 'On' : 'Off'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-secondary)]">Next charge</dt>
            <dd className="font-medium text-[var(--text)]">
              {formatDate(subscription.nextChargeAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-secondary)]">Period ends</dt>
            <dd className="font-medium text-[var(--text)]">
              {formatDate(subscription.currentEnd)}
            </dd>
          </div>
          {subscription.plan?.basePricePaise ? (
            <div>
              <dt className="text-xs text-[var(--text-secondary)]">Amount</dt>
              <dd className="text-base font-bold tracking-tight text-[var(--text)]">
                {formatPaise(subscription.plan.basePricePaise, subscription.plan.currency)}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </Link>
  );
}
