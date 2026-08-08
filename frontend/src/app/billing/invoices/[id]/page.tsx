'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Receipt, FileText, AlertCircle } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import { invoiceService } from '@/services/invoice.service';
import { formatPaise } from '@/types/billing';
import type { Invoice, InvoiceStatus } from '@/types/invoice';

const STATUS_TONE: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  ISSUED: 'bg-blue-100 text-blue-900',
  PAID: 'bg-green-100 text-green-900',
  VOIDED: 'bg-red-100 text-red-900',
  REFUNDED: 'bg-orange-100 text-orange-900',
};

export default function InvoiceDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    invoiceService
      .get(id)
      .then((res) => {
        if (active) setInvoice(res);
      })
      .catch((err) => {
        if (active) setError(err?.message ?? 'Failed to load invoice');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }
  if (!invoice) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-2xl px-4 py-12">
          <Card padding="lg">
            <p className="text-[var(--text-muted)]">{error ?? 'Invoice not found.'}</p>
            <Link
              href="/billing/invoices"
              className="text-primary mt-4 inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Back to invoices
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Link
          href="/billing/invoices"
          className="text-primary mb-6 inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> All invoices
        </Link>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_320px]">
          <Card padding="lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs tracking-wide text-[var(--text-muted)] uppercase">
                  Tax Invoice
                </p>
                <h1 className="mt-1 text-2xl font-bold text-[var(--text)]">
                  {invoice.invoiceNumber}
                </h1>
                <p className="text-sm text-[var(--text-muted)]">
                  Issued{' '}
                  {invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleString('en-IN') : '—'}
                </p>
              </div>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[invoice.status]}`}
              >
                {invoice.status.toLowerCase()}
              </span>
            </div>

            <h2 className="mt-6 text-base font-semibold text-[var(--text)]">Seller</h2>
            <div className="mt-2 space-y-1 text-sm">
              <p className="font-medium text-[var(--text)]">{invoice.sellerLegalName}</p>
              <p className="text-[var(--text-muted)]">GSTIN: {invoice.sellerGstin}</p>
              <p className="text-[var(--text-muted)]">State code: {invoice.sellerStateCode}</p>
            </div>

            {(invoice.buyerLegalName || invoice.buyerGstin) && (
              <>
                <h2 className="mt-6 text-base font-semibold text-[var(--text)]">Buyer</h2>
                <div className="mt-2 space-y-1 text-sm">
                  {invoice.buyerLegalName && (
                    <p className="font-medium text-[var(--text)]">{invoice.buyerLegalName}</p>
                  )}
                  {invoice.buyerGstin && (
                    <p className="text-[var(--text-muted)]">GSTIN: {invoice.buyerGstin}</p>
                  )}
                  <p className="text-[var(--text-muted)]">
                    Place of supply: {invoice.placeOfSupply}
                  </p>
                </div>
              </>
            )}

            <h2 className="mt-6 text-base font-semibold text-[var(--text)]">Line items</h2>
            <table className="mt-2 w-full text-sm">
              <thead className="border-b border-[var(--border)]">
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2">Description</th>
                  <th className="py-2 text-center">HSN/SAC</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Taxable</th>
                  <th className="py-2 text-right">GST</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5">{line.description}</td>
                    <td className="py-2.5 text-center text-[var(--text-muted)]">
                      {line.hsnCode || line.sacCode}
                    </td>
                    <td className="py-2.5 text-right">{line.quantity}</td>
                    <td className="py-2.5 text-right">
                      {formatPaise(line.taxableAmountPaise, invoice.currency)}
                    </td>
                    <td className="py-2.5 text-right">
                      {formatPaise(
                        line.cgstPaise + line.sgstPaise + line.igstPaise,
                        invoice.currency,
                      )}
                    </td>
                    <td className="py-2.5 text-right font-semibold">
                      {formatPaise(line.totalPaise, invoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-6 ml-auto max-w-xs space-y-1 text-sm">
              <Row k="Subtotal" v={formatPaise(invoice.taxableAmountPaise, invoice.currency)} />
              {invoice.discountPaise > 0 && (
                <Row k="Discount" v={`- ${formatPaise(invoice.discountPaise, invoice.currency)}`} />
              )}
              {invoice.cgstPaise > 0 && (
                <Row
                  k={`CGST ${invoice.gstPercent / 2}%`}
                  v={formatPaise(invoice.cgstPaise, invoice.currency)}
                />
              )}
              {invoice.sgstPaise > 0 && (
                <Row
                  k={`SGST ${invoice.gstPercent / 2}%`}
                  v={formatPaise(invoice.sgstPaise, invoice.currency)}
                />
              )}
              {invoice.igstPaise > 0 && (
                <Row
                  k={`IGST ${invoice.gstPercent}%`}
                  v={formatPaise(invoice.igstPaise, invoice.currency)}
                />
              )}
              <div className="mt-2 flex justify-between border-t border-[var(--border)] pt-2 text-base font-bold text-[var(--text)]">
                <span>Total</span>
                <span>{formatPaise(invoice.totalPaise, invoice.currency)}</span>
              </div>
              {invoice.refundedPaise > 0 && (
                <Row k="Refunded" v={`- ${formatPaise(invoice.refundedPaise, invoice.currency)}`} />
              )}
            </div>

            {invoice.status === 'VOIDED' && invoice.voidReason && (
              <Card padding="md" className="mt-6 border-red-300 bg-red-50">
                <p className="inline-flex items-center gap-2 text-sm text-red-900">
                  <AlertCircle className="h-4 w-4" />
                  Voided: {invoice.voidReason}
                </p>
              </Card>
            )}
          </Card>

          <Card padding="lg" className="self-start">
            <h2 className="text-base font-semibold text-[var(--text)]">Download</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              GST-compliant PDF — share with your accountant.
            </p>
            <a
              href={invoiceService.pdfUrl(invoice.id)}
              target="_blank"
              rel="noopener"
              className="mt-4 block"
            >
              <Button variant="primary" className="w-full">
                <Download className="mr-2 h-4 w-4" /> Download PDF
              </Button>
            </a>
            {invoice.eInvoiceIrn && (
              <div className="mt-4 rounded-lg border border-[var(--border)] p-3 text-xs">
                <p className="font-semibold text-[var(--text)]">E-invoice (IRP)</p>
                <p className="mt-1 break-all text-[var(--text-muted)]">
                  IRN: {invoice.eInvoiceIrn}
                </p>
                {invoice.eInvoiceAckNo && (
                  <p className="text-[var(--text-muted)]">Ack #: {invoice.eInvoiceAckNo}</p>
                )}
              </div>
            )}
            {invoice.orderId && (
              <Link href={`/billing/orders/${invoice.orderId}`} className="mt-4 block">
                <Button variant="outline" className="w-full">
                  <FileText className="mr-2 h-4 w-4" /> View order
                </Button>
              </Link>
            )}
            {invoice.subscriptionId && (
              <Link
                href={`/billing/subscriptions/${invoice.subscriptionId}`}
                className="mt-2 block"
              >
                <Button variant="outline" className="w-full">
                  <Receipt className="mr-2 h-4 w-4" /> View subscription
                </Button>
              </Link>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[var(--text-muted)]">{k}</span>
      <span className="font-medium text-[var(--text)]">{v}</span>
    </div>
  );
}
