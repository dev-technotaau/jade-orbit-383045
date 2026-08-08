import Link from 'next/link';
import { CheckCircle2, Clock, XCircle, RotateCw } from 'lucide-react';
import type { OrderListItem } from '@/types/order';
import { formatPaise } from '@/types/billing';
import {
  BILLING_CARD_INTERACTIVE,
  BILLING_CARD_SHELL,
  BillingAccentBar,
  BillingMedallion,
  getBillingTone,
  type BillingTone,
} from '@/components/billing/billing-visuals';

interface Props {
  order: OrderListItem;
  href?: string;
}

/**
 * Existing per-status colour/bg/icon values are unchanged — `tone` is added so
 * the card can also pick a gradient medallion + accent bar from the shared
 * billing tone scale. An order's meaningful visual is its PAYMENT STATE, so
 * that (not a plan illustration) is what drives the artwork here.
 */
const STATUS_TONE: Record<
  string,
  {
    color: string;
    bg: string;
    icon: React.ComponentType<{ size?: number }>;
    tone: BillingTone;
  }
> = {
  PAID: {
    color: 'text-emerald-700',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    icon: CheckCircle2,
    tone: 'success',
  },
  REFUNDED: {
    color: 'text-blue-700',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    icon: RotateCw,
    tone: 'info',
  },
  PARTIALLY_REFUNDED: {
    color: 'text-blue-700',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    icon: RotateCw,
    tone: 'info',
  },
  CREATED: {
    color: 'text-amber-700',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    icon: Clock,
    tone: 'pending',
  },
  ATTEMPTED: {
    color: 'text-amber-700',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    icon: Clock,
    tone: 'pending',
  },
  FAILED: {
    color: 'text-red-700',
    bg: 'bg-red-50 dark:bg-red-900/20',
    icon: XCircle,
    tone: 'danger',
  },
  CANCELLED: {
    color: 'text-gray-700',
    bg: 'bg-gray-50 dark:bg-gray-900/20',
    icon: XCircle,
    tone: 'neutral',
  },
  EXPIRED: {
    color: 'text-gray-700',
    bg: 'bg-gray-50 dark:bg-gray-900/20',
    icon: XCircle,
    tone: 'neutral',
  },
  REFUND_PENDING: {
    color: 'text-blue-700',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    icon: RotateCw,
    tone: 'info',
  },
  DISPUTED: {
    color: 'text-red-700',
    bg: 'bg-red-50 dark:bg-red-900/20',
    icon: XCircle,
    tone: 'danger',
  },
  FRAUD_FLAGGED: {
    color: 'text-red-700',
    bg: 'bg-red-50 dark:bg-red-900/20',
    icon: XCircle,
    tone: 'danger',
  },
};

export default function OrderCard({ order, href }: Props) {
  const tone = STATUS_TONE[order.status] ?? STATUS_TONE.CREATED;
  const Icon = tone.icon;
  const planName = order.plan?.name ?? 'Plan purchase';
  const styles = getBillingTone(tone.tone);

  const inner = (
    <>
      <BillingAccentBar bar={styles.bar} />
      <div className="flex items-start gap-4 p-4">
        {/* Status medallion — the order's payment state as the lead visual */}
        <BillingMedallion tile={styles.tile}>
          <Icon size={22} />
        </BillingMedallion>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[var(--text)]">
            {planName}
            {(order.quantity ?? 1) > 1 ? ` × ${order.quantity}` : ''}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {new Date(order.createdAt).toLocaleString('en-IN')}
          </p>
          {/* Amount — the number the user scans for, so it gets the most weight */}
          <p className="mt-2 text-lg font-bold tracking-tight text-[var(--text)]">
            {formatPaise(order.totalPaise)}
          </p>
        </div>

        <span
          className={`inline-flex flex-none items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone.bg} ${tone.color}`}
        >
          <Icon size={12} />
          {order.status.replace(/_/g, ' ')}
        </span>
      </div>
    </>
  );

  // Whole-card link → gets the lift. The non-linked variant stays flat so it
  // never implies navigation that isn't there.
  if (href) {
    return (
      <Link
        href={href}
        className={`${BILLING_CARD_SHELL} ${BILLING_CARD_INTERACTIVE} block ${styles.border}`}
      >
        {inner}
      </Link>
    );
  }
  return <div className={BILLING_CARD_SHELL}>{inner}</div>;
}
