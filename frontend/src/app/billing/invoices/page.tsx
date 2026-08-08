'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Receipt, ChevronRight, Download } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import Tooltip from '@/components/ui/Tooltip';
import Pagination from '@/components/ui/Pagination';
import { invoiceService } from '@/services/invoice.service';
import { usePricingHref } from '@/lib/pricing-href';
import { formatPaise } from '@/types/billing';
import type { Invoice, InvoicesListResponse, InvoiceStatus } from '@/types/invoice';

const STATUS_TONE: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  ISSUED: 'bg-blue-100 text-blue-900',
  PAID: 'bg-green-100 text-green-900',
  VOIDED: 'bg-red-100 text-red-900',
  REFUNDED: 'bg-orange-100 text-orange-900',
};

export default function InvoicesPage() {
  const [data, setData] = useState<InvoicesListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const pricingHref = usePricingHref();

  useEffect(() => {
    let active = true;
    invoiceService
      .list({ page, limit })
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err?.message ?? 'Failed to load invoices');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, limit]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text)]">Tax invoices</h1>
            <p className="text-sm text-[var(--text-muted)]">
              GST invoices for every paid plan. Download as PDF for your records.
            </p>
          </div>
          <Link href="/billing/orders">
            <Button variant="outline">View orders</Button>
          </Link>
        </div>

        {loading && (
          <Card padding="lg" className="flex items-center justify-center">
            <Spinner />
          </Card>
        )}
        {error && (
          <Card padding="lg">
            <p className="text-sm text-[var(--error)]">{error}</p>
          </Card>
        )}

        {!loading && !error && (data?.items.length ?? 0) === 0 && (
          <Card padding="lg" className="text-center">
            <Receipt className="text-primary mx-auto h-10 w-10" />
            <h2 className="mt-3 text-lg font-semibold text-[var(--text)]">No invoices yet</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Pay for a plan and your GST tax invoice will appear here automatically.
            </p>
            <Link href={pricingHref} className="mt-4 inline-block">
              <Button variant="primary">View plans</Button>
            </Link>
          </Card>
        )}

        {!loading && !error && (data?.items.length ?? 0) > 0 && (
          <div className="space-y-3">
            {data!.items.map((inv) => (
              <InvoiceRow key={inv.id} invoice={inv} />
            ))}
            <Pagination
              currentPage={page}
              totalPages={data!.totalPages}
              onPageChange={setPage}
              totalItems={data!.total}
              pageSize={limit}
              onPageSizeChange={(s) => {
                setLimit(s);
                setPage(1);
              }}
              className="pt-2"
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const issued = invoice.issuedAt
    ? new Date(invoice.issuedAt).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '—';
  return (
    <Card padding="md" className="hover:border-[var(--border-hover)]">
      <div className="flex items-start justify-between gap-4">
        <Link
          href={`/billing/invoices/${invoice.id}`}
          className="flex min-w-0 flex-1 items-start gap-3"
        >
          <div className="bg-primary/10 text-primary flex h-10 w-10 flex-none items-center justify-center rounded-lg">
            <Receipt className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-[var(--text)]">{invoice.invoiceNumber}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {issued}
              {' · '}HSN {invoice.hsnCode}
              {' · '}GST {invoice.gstPercent}%
            </p>
          </div>
        </Link>
        <div className="flex flex-none items-center gap-3">
          <span className="text-right text-sm font-semibold text-[var(--text)]">
            {formatPaise(invoice.totalPaise, invoice.currency)}
          </span>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[invoice.status]}`}
          >
            {invoice.status.toLowerCase()}
          </span>
          <Tooltip content="Download PDF">
            <a
              href={invoiceService.pdfUrl(invoice.id)}
              target="_blank"
              rel="noopener"
              className="text-primary hover:text-primary-hover"
              aria-label="Download PDF"
            >
              <Download className="h-4 w-4" />
            </a>
          </Tooltip>
          <Link
            href={`/billing/invoices/${invoice.id}`}
            className="text-[var(--text-muted)] hover:text-[var(--text)]"
            aria-label="View invoice"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
