import Link from 'next/link';
import { FileDown, Eye } from 'lucide-react';
import type { InvoiceListItem } from '@/hooks/use-invoices';
import { formatPaise } from '@/types/billing';
import {
  BILLING_CARD_SHELL,
  BILLING_CARD_STATIC_HOVER,
  BillingAccentBar,
  BillingMedallion,
  InvoiceGlyph,
  getBillingTone,
  type BillingTone,
} from '@/components/billing/billing-visuals';

interface Props {
  invoice: InvoiceListItem;
}

/** Existing pill classes unchanged; `tone` is added to drive the medallion. */
const STATUS_TONE: Record<string, { pill: string; tone: BillingTone }> = {
  PAID: {
    pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
    tone: 'success',
  },
  ISSUED: {
    pill: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
    tone: 'info',
  },
  DRAFT: {
    pill: 'bg-gray-50 text-gray-700 dark:bg-gray-900/20 dark:text-gray-300',
    tone: 'neutral',
  },
  VOIDED: {
    pill: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
    tone: 'danger',
  },
  REFUNDED: {
    pill: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
    tone: 'pending',
  },
};

export default function InvoiceCard({ invoice }: Props) {
  const status = STATUS_TONE[invoice.status] ?? STATUS_TONE.DRAFT;
  const styles = getBillingTone(status.tone);

  // The row contains its own actions rather than navigating as a whole, so it
  // gets depth on hover but no lift.
  return (
    <div className={`${BILLING_CARD_SHELL} ${BILLING_CARD_STATIC_HOVER}`}>
      <BillingAccentBar bar={styles.bar} />
      <div className="flex items-center gap-4 p-4">
        {/* Tax-document medallion — an invoice's identity is the document
            itself, so it leads with a page/line-items glyph rather than a
            plan illustration. */}
        <BillingMedallion tile={styles.tile}>
          <InvoiceGlyph className="h-6 w-6" />
        </BillingMedallion>

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-mono text-sm font-semibold text-[var(--text)]">
            {invoice.invoiceNumber}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {invoice.issuedAt
              ? new Date(invoice.issuedAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              : 'Not issued'}
          </p>
          <p className="mt-2 text-lg font-bold tracking-tight text-[var(--text)]">
            {formatPaise(invoice.totalPaise)}
          </p>
        </div>

        <div className="flex flex-none flex-col items-end gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.pill}`}>
            {invoice.status}
          </span>
          {/* Actions — bordered icon buttons so they read as tappable
              affordances (they were bare icons with a hover tint before). */}
          <div className="flex items-center gap-1.5">
            <Link
              href={`/billing/invoices/${invoice.id}`}
              aria-label={`View invoice ${invoice.invoiceNumber}`}
              title="View invoice"
              className="hover:border-primary hover:text-primary inline-flex items-center justify-center rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-secondary)] transition-colors"
            >
              <Eye size={14} />
            </Link>
            {invoice.pdfUrl ? (
              <a
                href={invoice.pdfUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Download invoice ${invoice.invoiceNumber} as PDF`}
                title="Download PDF"
                className="hover:border-primary hover:text-primary inline-flex items-center justify-center rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-secondary)] transition-colors"
              >
                <FileDown size={14} />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
