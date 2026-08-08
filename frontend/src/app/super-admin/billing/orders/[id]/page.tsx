'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  CheckCircle2,
  XCircle,
  RotateCw,
  Receipt,
  AlertTriangle,
  ShieldAlert,
  ExternalLink,
  Copy,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import Tooltip from '@/components/ui/Tooltip';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import StatusBadge from '@/components/super-admin/billing/StatusBadge';
import AdminConfirmModal from '@/components/super-admin/billing/AdminConfirmModal';
import AdminDetailCard from '@/components/super-admin/billing/AdminDetailCard';
import { superAdminBillingService } from '@/services/super-admin-billing.service';
import { formatPaise } from '@/types/billing';
import type { OrderStatus } from '@/types/order';

interface AdminOrderDetail {
  id: string;
  receiptNumber: string | null;
  razorpayOrderId: string | null;
  status: OrderStatus;
  totalPaise: number;
  originalAmountPaise: number;
  discountPaise: number;
  taxPaise: number;
  currency: string;
  channel: string;
  fraudScore: number | null;
  fraudAction: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  notes: Record<string, unknown> | null;
  planSnapshot: Record<string, unknown> | null;
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
  };
  plan?: { id: string; code: string; name: string; validityDays: number | null };
  coupon?: { id: string; code: string; name: string };
  payments?: Array<{
    id: string;
    razorpayPaymentId: string;
    method: string;
    status: string;
    amountPaise: number;
    capturedAt: string | null;
    cardLast4: string | null;
    cardNetwork: string | null;
    vpa: string | null;
    bank: string | null;
    wallet: string | null;
    errorCode: string | null;
    errorDescription: string | null;
    international: boolean;
  }>;
  refunds?: Array<{
    id: string;
    razorpayRefundId: string;
    amountPaise: number;
    reason: string;
    status: string;
    createdAt: string;
    processedAt: string | null;
  }>;
  invoices?: Array<{
    id: string;
    invoiceNumber: string;
    type: string;
    status: string;
    totalPaise: number;
    issuedAt: string | null;
    pdfUrl: string | null;
  }>;
}

type DialogKind = null | 'mark-paid' | 'force-cancel' | 'flag-fraud';

const COPY_FLASH_MS = 1200;

function CopyableValue({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FLASH_MS);
    });
  };
  return (
    <Tooltip content={label ? `Copy ${label}` : 'Copy'}>
      <button
        type="button"
        onClick={onCopy}
        className="group inline-flex items-center gap-1.5 font-mono text-xs hover:text-blue-600"
      >
        <span className="break-all">{value}</span>
        {copied ? (
          <CheckCircle2 className="text-emerald-500" size={12} />
        ) : (
          <Copy className="opacity-30 group-hover:opacity-100" size={12} />
        )}
      </button>
    </Tooltip>
  );
}

export default function SuperAdminOrderDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await superAdminBillingService.getOrder(id)) as unknown as AdminOrderDetail;
      setOrder(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) void reload();
  }, [id, reload]);

  const onMarkPaid = async (notes?: string) => {
    if (!notes) throw new Error('Notes required');
    await superAdminBillingService.markOrderPaid(id, notes);
    setActionMsg('Order marked as paid. Invoice + entitlement will be issued.');
    await reload();
  };

  const onForceCancel = async (reason?: string) => {
    if (!reason) throw new Error('Reason required');
    await superAdminBillingService.forceCancelOrder(id, reason);
    setActionMsg('Order force-cancelled.');
    await reload();
  };

  if (loading) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.orders.view"
      >
        <div className="mx-auto flex max-w-5xl justify-center px-4 py-16">
          <Spinner />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !order) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.orders.view"
      >
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
          <BillingNav active="orders" />
          <Card padding="lg">
            <p className="text-sm text-red-600">{error ?? 'Order not found.'}</p>
            <Link
              href="/super-admin/billing/orders"
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              ← Back to all orders
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const userName = `${order.user?.firstName ?? ''} ${order.user?.lastName ?? ''}`.trim();
  const isPaid = order.status === 'PAID';
  const canMarkPaid =
    order.status === 'CREATED' || order.status === 'ATTEMPTED' || order.status === 'FAILED';
  const canCancel =
    order.status === 'CREATED' || order.status === 'ATTEMPTED' || order.status === 'FAILED';

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="billing.orders.view"
    >
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="orders" />

        <Link
          href="/super-admin/billing/orders"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={14} /> All orders
        </Link>

        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-2xl font-bold text-[var(--text)] sm:text-3xl">
                Order {order.receiptNumber ?? order.id.slice(-8)}
              </h1>
              <StatusBadge status={order.status} pretty />
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Created {new Date(order.createdAt).toLocaleString('en-IN')}
              {order.paidAt ? ` · Paid ${new Date(order.paidAt).toLocaleString('en-IN')}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canMarkPaid ? (
              <Button variant="primary" onClick={() => setDialog('mark-paid')}>
                <CheckCircle2 size={14} /> Mark Paid (manual)
              </Button>
            ) : null}
            {canCancel ? (
              <Button variant="destructive" onClick={() => setDialog('force-cancel')}>
                <XCircle size={14} /> Force Cancel
              </Button>
            ) : null}
            {order.user?.id ? (
              <Link href={`/super-admin/billing/users/${order.user.id}`}>
                <Button variant="outline">View user</Button>
              </Link>
            ) : null}
          </div>
        </header>

        {actionMsg ? (
          <div className="flex items-center gap-2 rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-200">
            <CheckCircle2 size={16} />
            <span>{actionMsg}</span>
          </div>
        ) : null}

        {(order.fraudScore ?? 0) > 0 ? (
          <div className="flex items-start gap-3 rounded-lg border-l-4 border-red-500 bg-red-50 p-4 dark:bg-red-900/20">
            <ShieldAlert className="mt-0.5 flex-shrink-0 text-red-600" size={18} />
            <div>
              <p className="font-semibold text-red-900 dark:text-red-200">
                Fraud signals detected — score {order.fraudScore}
              </p>
              <p className="mt-1 text-sm text-red-800 dark:text-red-300">
                Action: <strong>{order.fraudAction ?? 'NONE'}</strong>. Review the user&apos;s
                history in the fraud queue before issuing a refund.
              </p>
              <Link
                href="/super-admin/billing/fraud"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline dark:text-red-300"
              >
                Open fraud queue <ExternalLink size={11} />
              </Link>
            </div>
          </div>
        ) : null}

        {/* Money summary */}
        <Card padding="lg">
          <h2 className="text-base font-semibold text-[var(--text)]">Money summary</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Subtotal</dt>
              <dd className="mt-1 text-lg font-semibold">
                {formatPaise(order.originalAmountPaise, order.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Discount</dt>
              <dd className="mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                {order.discountPaise > 0
                  ? `− ${formatPaise(order.discountPaise, order.currency)}`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Tax (GST)</dt>
              <dd className="mt-1 text-lg font-semibold">
                {formatPaise(order.taxPaise, order.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Total</dt>
              <dd className="mt-1 text-2xl font-extrabold text-[var(--text)]">
                {formatPaise(order.totalPaise, order.currency)}
              </dd>
            </div>
          </dl>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AdminDetailCard
            title="Order"
            rows={[
              {
                label: 'ID',
                value: <CopyableValue value={order.id} label="order ID" />,
                mono: true,
              },
              {
                label: 'Receipt',
                value: order.receiptNumber ? (
                  <CopyableValue value={order.receiptNumber} label="receipt" />
                ) : (
                  '—'
                ),
                mono: true,
              },
              {
                label: 'Razorpay ID',
                value: order.razorpayOrderId ? (
                  <CopyableValue value={order.razorpayOrderId} label="Razorpay ID" />
                ) : (
                  '—'
                ),
                mono: true,
              },
              { label: 'Channel', value: order.channel },
              {
                label: 'Expires',
                value: order.expiresAt ? new Date(order.expiresAt).toLocaleString('en-IN') : '—',
              },
              { label: 'IP', value: order.ipAddress ?? '—', mono: true },
              {
                label: 'User-Agent',
                value: order.userAgent ? (
                  <span className="text-xs break-all text-[var(--text-secondary)]">
                    {order.userAgent}
                  </span>
                ) : (
                  '—'
                ),
              },
            ]}
          />
          <AdminDetailCard
            title="Customer"
            rows={[
              { label: 'Email', value: order.user?.email ?? '—' },
              { label: 'Name', value: userName || '—' },
              { label: 'Role', value: order.user?.role ?? '—' },
              {
                label: 'User ID',
                value: order.user?.id ? <CopyableValue value={order.user.id} /> : '—',
                mono: true,
              },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AdminDetailCard
            title="Plan snapshot"
            rows={[
              { label: 'Code', value: order.plan?.code ?? '—', mono: true },
              { label: 'Name', value: order.plan?.name ?? '—' },
              {
                label: 'Validity',
                value: order.plan?.validityDays ? `${order.plan.validityDays} days` : '—',
              },
            ]}
          />
          <AdminDetailCard
            title="Coupon"
            rows={[
              { label: 'Code', value: order.coupon?.code ?? '—', mono: true },
              { label: 'Name', value: order.coupon?.name ?? '—' },
              {
                label: 'Discount applied',
                value:
                  order.discountPaise > 0 ? formatPaise(order.discountPaise, order.currency) : '—',
              },
            ]}
          />
        </div>

        {/* Payments */}
        <Card padding="lg">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
              <CreditCard size={16} /> Payments ({order.payments?.length ?? 0})
            </h2>
          </div>
          {order.payments && order.payments.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {order.payments.map((p) => (
                <li
                  key={p.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/super-admin/billing/transactions/${p.id}`}
                        className="font-mono text-xs text-blue-600 hover:underline"
                      >
                        {p.razorpayPaymentId}
                      </Link>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {p.method} ·{' '}
                        {p.cardLast4
                          ? `${p.cardNetwork ?? 'Card'} ····${p.cardLast4}`
                          : p.vpa
                            ? p.vpa
                            : (p.bank ?? p.wallet ?? '—')}
                        {p.international ? ' · International' : ''}
                      </p>
                      {p.errorCode ? (
                        <p className="mt-1 text-xs text-red-600">
                          {p.errorCode}: {p.errorDescription}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">
                        {formatPaise(p.amountPaise, order.currency)}
                      </span>
                      <StatusBadge status={p.status} pretty />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-[var(--text-secondary)]">No payments recorded yet.</p>
          )}
        </Card>

        {/* Refunds */}
        {order.refunds && order.refunds.length > 0 ? (
          <Card padding="lg">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
              <RotateCw size={16} /> Refunds ({order.refunds.length})
            </h2>
            <ul className="mt-4 space-y-2">
              {order.refunds.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/super-admin/billing/refunds/${r.id}`}
                        className="font-mono text-xs text-blue-600 hover:underline"
                      >
                        {r.razorpayRefundId}
                      </Link>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        Reason: {r.reason}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Created {new Date(r.createdAt).toLocaleString('en-IN')}
                        {r.processedAt
                          ? ` · Processed ${new Date(r.processedAt).toLocaleString('en-IN')}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">
                        {formatPaise(r.amountPaise, order.currency)}
                      </span>
                      <StatusBadge status={r.status} pretty />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {/* Invoices */}
        {order.invoices && order.invoices.length > 0 ? (
          <Card padding="lg">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
              <Receipt size={16} /> Invoices ({order.invoices.length})
            </h2>
            <ul className="mt-4 space-y-2">
              {order.invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-[var(--text)]">
                      {inv.invoiceNumber}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {inv.type} · Issued{' '}
                      {inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString('en-IN') : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">
                      {formatPaise(inv.totalPaise, order.currency)}
                    </span>
                    <StatusBadge status={inv.status} pretty />
                    {inv.pdfUrl ? (
                      <a
                        href={inv.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        PDF <ExternalLink size={11} />
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : isPaid ? (
          <Card padding="lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 text-amber-600" size={18} />
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">No invoice issued yet</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  An invoice should auto-generate post-capture. If it&apos;s missing &gt; 5 minutes,
                  check the invoice-generation queue.
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        {order.notes && Object.keys(order.notes).length > 0 ? (
          <Card padding="lg">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
              <Banknote size={16} /> Internal notes
            </h2>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-[var(--bg)] p-4 font-mono text-xs text-[var(--text)]">
              {JSON.stringify(order.notes, null, 2)}
            </pre>
          </Card>
        ) : null}
      </div>

      <AdminConfirmModal
        isOpen={dialog === 'mark-paid'}
        onClose={() => setDialog(null)}
        onConfirm={onMarkPaid}
        title="Mark order as paid (manual)"
        description={
          <div>
            <p>
              Use this only when payment was received outside Razorpay (cash, bank transfer,
              corporate offline payment).
            </p>
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              A synthetic Payment row will be created, the order will move to PAID, and the invoice
              + entitlement will be auto-issued.
            </p>
          </div>
        }
        inputLabel="Notes & external reference"
        inputType="textarea"
        inputPlaceholder="e.g. Paid via NEFT, txn ref ABC123. Authorised by CFO."
        inputMinLength={5}
        inputMaxLength={2000}
        confirmLabel="Mark Paid"
        intent="primary"
      />

      <AdminConfirmModal
        isOpen={dialog === 'force-cancel'}
        onClose={() => setDialog(null)}
        onConfirm={onForceCancel}
        title="Force-cancel this order?"
        description={
          <div>
            <p>The user will see this order as CANCELLED and cannot pay it.</p>
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              This does not refund any captured payment — for paid orders, initiate a refund
              instead.
            </p>
          </div>
        }
        inputLabel="Reason for cancellation"
        inputType="textarea"
        inputPlaceholder="e.g. User requested cancellation before payment, plan misconfigured…"
        inputMinLength={3}
        inputMaxLength={500}
        confirmLabel="Force Cancel"
        intent="danger"
      />
    </DashboardLayout>
  );
}
