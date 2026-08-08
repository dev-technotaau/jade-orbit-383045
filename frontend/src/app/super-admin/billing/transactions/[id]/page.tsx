'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CreditCard,
  Globe,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ExternalLink,
  Copy,
  Receipt,
  RefreshCw,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import StatusBadge from '@/components/super-admin/billing/StatusBadge';
import AdminConfirmModal from '@/components/super-admin/billing/AdminConfirmModal';
import AdminDetailCard from '@/components/super-admin/billing/AdminDetailCard';
import { superAdminBillingService } from '@/services/super-admin-billing.service';
import { formatPaise } from '@/types/billing';

interface AdminPaymentDetail {
  id: string;
  razorpayPaymentId: string;
  status: string;
  method: string;
  amountPaise: number;
  capturedPaise: number;
  feePaise: number | null;
  taxPaise: number | null;
  capturedAt: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  errorSource: string | null;
  errorStep: string | null;
  errorReason: string | null;
  vpa: string | null;
  bank: string | null;
  wallet: string | null;
  cardLast4: string | null;
  cardNetwork: string | null;
  cardIssuer: string | null;
  international: boolean;
  currency: string;
  createdAt: string;
  raw: Record<string, unknown> | null;
  order?: {
    id: string;
    receiptNumber: string | null;
    totalPaise: number;
    plan?: { code: string; name: string };
    user?: { id: string; email: string };
  };
  refunds?: Array<{
    id: string;
    razorpayRefundId: string;
    amountPaise: number;
    status: string;
    reason: string;
    createdAt: string;
  }>;
  disputes?: Array<{
    id: string;
    razorpayDisputeId: string;
    status: string;
    reasonCode: string | null;
    amountPaise: number;
    dueByAt: string | null;
  }>;
}

type DialogKind = null | 'refund' | 'retry-capture' | 'flag-fraud';

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="group inline-flex items-center gap-1.5 font-mono text-xs hover:text-blue-600"
    >
      <span className="break-all">{value}</span>
      {copied ? (
        <CheckCircle2 size={12} className="text-emerald-500" />
      ) : (
        <Copy size={12} className="opacity-30 group-hover:opacity-100" />
      )}
    </button>
  );
}

export default function SuperAdminTransactionDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [payment, setPayment] = useState<AdminPaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await superAdminBillingService.getPayment(id)) as unknown as AdminPaymentDetail;
      setPayment(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payment');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) void reload();
  }, [id, reload]);

  const onRefund = async (notes?: string) => {
    if (!payment) return;
    if (!notes) throw new Error('Refund reason required');
    await superAdminBillingService.initiateRefund({
      paymentId: payment.id,
      reason: 'ADMIN_INITIATED',
      notes,
      bypassWindow: true,
    });
    setActionMsg('Refund initiated. Track status in the Refunds tab.');
    await reload();
  };

  const onRetryCapture = async () => {
    if (!payment) return;
    await superAdminBillingService.retryPaymentCapture(payment.id);
    setActionMsg('Capture retried. Refresh shortly to see status.');
    await reload();
  };

  if (loading) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.transactions.view"
      >
        <div className="mx-auto flex max-w-5xl justify-center px-4 py-16">
          <Spinner />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !payment) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.transactions.view"
      >
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
          <BillingNav active="transactions" />
          <Card padding="lg">
            <p className="text-sm text-red-600">{error ?? 'Payment not found.'}</p>
            <Link
              href="/super-admin/billing/transactions"
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              ← Back to all transactions
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const refundedTotal = (payment.refunds ?? []).reduce(
    (sum, r) => (r.status === 'PROCESSED' || r.status === 'PENDING' ? sum + r.amountPaise : sum),
    0,
  );
  const refundable = payment.capturedPaise - refundedTotal;
  const canRefund = payment.status === 'CAPTURED' && refundable > 0;
  const canRetryCapture = payment.status === 'AUTHORIZED';

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="billing.transactions.view"
    >
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="transactions" />

        <Link
          href="/super-admin/billing/transactions"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={14} /> All transactions
        </Link>

        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-2xl font-bold text-[var(--text)] sm:text-3xl">
                Payment {payment.razorpayPaymentId.slice(-12)}
              </h1>
              <StatusBadge status={payment.status} pretty />
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {new Date(payment.createdAt).toLocaleString('en-IN')}
              {payment.capturedAt
                ? ` · Captured ${new Date(payment.capturedAt).toLocaleString('en-IN')}`
                : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canRetryCapture ? (
              <Button variant="primary" onClick={() => setDialog('retry-capture')}>
                <RefreshCw size={14} /> Retry Capture
              </Button>
            ) : null}
            {canRefund ? (
              <Button variant="destructive" onClick={() => setDialog('refund')}>
                <RotateCw size={14} /> Issue Refund
              </Button>
            ) : null}
            {payment.order?.id ? (
              <Link href={`/super-admin/billing/orders/${payment.order.id}`}>
                <Button variant="outline">View order</Button>
              </Link>
            ) : null}
          </div>
        </header>

        {actionMsg ? (
          <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-200">
            {actionMsg}
          </div>
        ) : null}

        {payment.errorCode ? (
          <div className="flex items-start gap-3 rounded-lg border-l-4 border-red-500 bg-red-50 p-4 dark:bg-red-900/20">
            <AlertTriangle className="mt-0.5 flex-shrink-0 text-red-600" size={18} />
            <div>
              <p className="font-semibold text-red-900 dark:text-red-200">
                {payment.errorCode}: {payment.errorDescription}
              </p>
              <p className="mt-1 text-xs text-red-800 dark:text-red-300">
                Source: {payment.errorSource ?? '—'} · Step: {payment.errorStep ?? '—'} · Reason:{' '}
                {payment.errorReason ?? '—'}
              </p>
            </div>
          </div>
        ) : null}

        {payment.disputes && payment.disputes.length > 0 ? (
          <div className="flex items-start gap-3 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 dark:bg-amber-900/20">
            <ShieldAlert className="mt-0.5 flex-shrink-0 text-amber-600" size={18} />
            <div className="flex-1">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                {payment.disputes.length} dispute{payment.disputes.length === 1 ? '' : 's'} on this
                payment
              </p>
              <ul className="mt-2 space-y-1 text-xs text-amber-800 dark:text-amber-300">
                {payment.disputes.map((d) => (
                  <li key={d.id} className="flex items-center gap-2">
                    <Link
                      href={`/super-admin/billing/disputes/${d.id}`}
                      className="font-mono hover:underline"
                    >
                      {d.razorpayDisputeId}
                    </Link>
                    <StatusBadge status={d.status} pretty />
                    {d.dueByAt ? (
                      <span>Due {new Date(d.dueByAt).toLocaleDateString('en-IN')}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <Card padding="lg">
          <h2 className="text-base font-semibold text-[var(--text)]">Money breakdown</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Authorized</dt>
              <dd className="mt-1 text-lg font-semibold">
                {formatPaise(payment.amountPaise, payment.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Captured</dt>
              <dd className="mt-1 text-lg font-semibold">
                {formatPaise(payment.capturedPaise, payment.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Razorpay fee</dt>
              <dd className="mt-1 text-lg font-semibold text-[var(--text-secondary)]">
                {payment.feePaise != null ? formatPaise(payment.feePaise, payment.currency) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Refundable</dt>
              <dd
                className={`mt-1 text-lg font-semibold ${
                  refundable > 0 ? 'text-emerald-700' : 'text-[var(--text-secondary)]'
                }`}
              >
                {formatPaise(refundable, payment.currency)}
              </dd>
            </div>
          </dl>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AdminDetailCard
            title="Payment method"
            rows={[
              {
                label: 'Razorpay ID',
                value: <CopyChip value={payment.razorpayPaymentId} />,
                mono: true,
              },
              { label: 'Method', value: payment.method },
              {
                label: 'Card',
                value: payment.cardLast4
                  ? `${payment.cardNetwork ?? ''} ····${payment.cardLast4}${payment.cardIssuer ? ` · ${payment.cardIssuer}` : ''}`
                  : '—',
              },
              { label: 'UPI', value: payment.vpa ?? '—' },
              { label: 'Bank', value: payment.bank ?? '—' },
              { label: 'Wallet', value: payment.wallet ?? '—' },
              {
                label: 'International',
                value: payment.international ? (
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <Globe size={12} /> Yes
                  </span>
                ) : (
                  'No'
                ),
              },
            ]}
          />
          <AdminDetailCard
            title="Linked entities"
            rows={[
              {
                label: 'Order',
                value: payment.order?.id ? (
                  <Link
                    href={`/super-admin/billing/orders/${payment.order.id}`}
                    className="font-mono text-blue-600 hover:underline"
                  >
                    {payment.order.receiptNumber ?? payment.order.id.slice(-8)}
                  </Link>
                ) : (
                  '—'
                ),
              },
              { label: 'Plan', value: payment.order?.plan?.name ?? '—' },
              {
                label: 'User',
                value: payment.order?.user?.email ? (
                  <Link
                    href={`/super-admin/billing/users/${payment.order.user.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {payment.order.user.email}
                  </Link>
                ) : (
                  '—'
                ),
              },
              {
                label: 'Order total',
                value: payment.order
                  ? formatPaise(payment.order.totalPaise, payment.currency)
                  : '—',
              },
            ]}
          />
        </div>

        {payment.refunds && payment.refunds.length > 0 ? (
          <Card padding="lg">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
              <RotateCw size={16} /> Refunds ({payment.refunds.length})
            </h2>
            <ul className="mt-4 space-y-2">
              {payment.refunds.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/super-admin/billing/refunds/${r.id}`}
                      className="font-mono text-xs text-blue-600 hover:underline"
                    >
                      {r.razorpayRefundId}
                    </Link>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {r.reason} · {new Date(r.createdAt).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">
                      {formatPaise(r.amountPaise, payment.currency)}
                    </span>
                    <StatusBadge status={r.status} pretty />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <CreditCard size={16} /> Razorpay raw payload
          </h2>
          <pre
            data-lenis-prevent
            className="mt-4 max-h-96 overflow-auto rounded-lg bg-[var(--bg)] p-4 font-mono text-xs text-[var(--text)]"
          >
            {JSON.stringify(payment.raw ?? {}, null, 2)}
          </pre>
        </Card>
      </div>

      <AdminConfirmModal
        isOpen={dialog === 'refund'}
        onClose={() => setDialog(null)}
        onConfirm={onRefund}
        title="Issue refund"
        description={
          <div>
            <p>
              Refund up to <strong>{formatPaise(refundable, payment.currency)}</strong> to the
              original payment method.
            </p>
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              This bypasses the standard refund window. Reason will be persisted to the audit log.
            </p>
          </div>
        }
        inputLabel="Refund reason / notes"
        inputType="textarea"
        inputPlaceholder="e.g. Customer requested cancellation, support ticket #1234…"
        inputMinLength={5}
        inputMaxLength={2000}
        confirmLabel="Issue Refund"
        intent="danger"
      />

      <AdminConfirmModal
        isOpen={dialog === 'retry-capture'}
        onClose={() => setDialog(null)}
        onConfirm={onRetryCapture}
        title="Retry capture?"
        description="This will attempt to capture the authorized amount again via the Razorpay API."
        confirmLabel="Retry Capture"
        intent="primary"
      />
    </DashboardLayout>
  );
}
