/**
 * Enterprise status badge — single source of truth for billing status pills
 * across all super-admin pages. Tones map to entity status enums.
 */

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_CLASS: Record<Tone, string> = {
  success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  neutral: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
};

const STATUS_TONE: Record<string, Tone> = {
  // Order
  CREATED: 'neutral',
  ATTEMPTED: 'warning',
  PAID: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
  REFUND_PENDING: 'info',
  REFUNDED: 'info',
  PARTIALLY_REFUNDED: 'info',
  DISPUTED: 'danger',
  FRAUD_FLAGGED: 'danger',
  // Payment
  AUTHORIZED: 'warning',
  CAPTURED: 'success',
  // Subscription
  ACTIVE: 'success',
  AUTHENTICATED: 'info',
  PAUSED: 'warning',
  HALTED: 'danger',
  PENDING_CANCEL: 'warning',
  COMPLETED: 'neutral',
  // Refund
  PENDING: 'warning',
  PROCESSED: 'success',
  // Settlement
  SCHEDULED: 'info',
  // Dispute
  OPEN: 'warning',
  UNDER_REVIEW: 'warning',
  WON: 'success',
  LOST: 'danger',
  ACCEPTED: 'neutral',
  // Webhook
  RECEIVED: 'info',
  PROCESSING: 'warning',
  SKIPPED: 'neutral',
  REPLAYED: 'info',
  // Plan / Coupon
  DRAFT: 'neutral',
  ARCHIVED: 'neutral',
  HIDDEN: 'warning',
  // Invoice
  ISSUED: 'info',
  VOIDED: 'danger',
  // Quote
  NEW: 'info',
  IN_REVIEW: 'warning',
  CONTACTED: 'info',
  NEGOTIATING: 'warning',
  REJECTED: 'danger',
  CONVERTED: 'success',
  WITHDRAWN: 'neutral',
  // Fraud severity
  LOW: 'neutral',
  MEDIUM: 'warning',
  HIGH: 'danger',
  CRITICAL: 'danger',
  // Fraud action
  NONE: 'neutral',
  REVIEW: 'warning',
  BLOCK: 'danger',
  REFUND_AND_BLOCK: 'danger',
  // Mandate
  CONFIRMED: 'success',
  // Entitlement
  EXHAUSTED: 'warning',
  ON_HOLD: 'warning',
};

interface Props {
  status: string;
  /** Manual tone override. */
  tone?: Tone;
  /** Pretty-print: replace underscores with spaces, lowercase. */
  pretty?: boolean;
  className?: string;
}

export default function StatusBadge({ status, tone, pretty = false, className }: Props) {
  const t = tone ?? STATUS_TONE[status] ?? 'neutral';
  const text = pretty ? status.replace(/_/g, ' ').toLowerCase() : status;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[t]} ${className ?? ''}`}
    >
      {text}
    </span>
  );
}
