'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RotateCw, ExternalLink } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import StatusBadge from '@/components/super-admin/billing/StatusBadge';
import AdminDetailCard from '@/components/super-admin/billing/AdminDetailCard';
import { superAdminBillingService } from '@/services/super-admin-billing.service';
import { formatPaise } from '@/types/billing';

interface AdminRefundDetail {
  id: string;
  razorpayRefundId: string;
  paymentId: string;
  orderId: string;
  amountPaise: number;
  reason: string;
  notes: string | null;
  status: string;
  initiatedById: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  speed: string | null;
  processedAt: string | null;
  createdAt: string;
  raw: Record<string, unknown> | null;
  payment?: {
    id: string;
    razorpayPaymentId: string;
    method: string;
    amountPaise: number;
    capturedPaise: number;
    cardLast4: string | null;
  };
  order?: {
    id: string;
    receiptNumber: string | null;
    plan?: { code: string; name: string };
    user?: { id: string; email: string };
  };
}

export default function SuperAdminRefundDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [refund, setRefund] = useState<AdminRefundDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    superAdminBillingService
      .getRefund(id)
      .then((d) => {
        if (active) setRefund(d as unknown as AdminRefundDetail);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.refunds.view"
      >
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </DashboardLayout>
    );
  }
  if (error || !refund) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.refunds.view"
      >
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
          <BillingNav active="refunds" />
          <Card padding="lg">
            <p className="text-sm text-red-600">{error ?? 'Refund not found.'}</p>
            <Link
              href="/super-admin/billing/refunds"
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              ← Back
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="billing.refunds.view"
    >
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="refunds" />

        <Link
          href="/super-admin/billing/refunds"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={14} /> All refunds
        </Link>

        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
                <RotateCw className="mr-2 inline" size={24} />
                Refund {refund.razorpayRefundId.slice(-12)}
              </h1>
              <StatusBadge status={refund.status} pretty />
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Initiated {new Date(refund.createdAt).toLocaleString('en-IN')}
              {refund.processedAt
                ? ` · Processed ${new Date(refund.processedAt).toLocaleString('en-IN')}`
                : ''}
            </p>
          </div>
        </header>

        {refund.errorCode ? (
          <div className="rounded-lg border-l-4 border-red-500 bg-red-50 p-4 dark:bg-red-900/20">
            <p className="font-semibold text-red-900 dark:text-red-200">
              {refund.errorCode}: {refund.errorDescription}
            </p>
          </div>
        ) : null}

        <Card padding="lg">
          <h2 className="text-base font-semibold text-[var(--text)]">Refund summary</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Amount</dt>
              <dd className="mt-1 text-2xl font-extrabold text-[var(--text)]">
                {formatPaise(refund.amountPaise)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Reason</dt>
              <dd className="mt-1 text-sm font-medium">{refund.reason}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Speed</dt>
              <dd className="mt-1 text-sm font-medium">{refund.speed ?? 'normal'}</dd>
            </div>
          </dl>
          {refund.notes ? (
            <div className="mt-4 rounded-lg bg-[var(--bg)] p-3 text-sm text-[var(--text)]">
              <strong>Internal notes:</strong> {refund.notes}
            </div>
          ) : null}
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AdminDetailCard
            title="Original payment"
            rows={[
              {
                label: 'Razorpay payment ID',
                value: refund.payment ? (
                  <Link
                    href={`/super-admin/billing/transactions/${refund.payment.id}`}
                    className="font-mono text-blue-600 hover:underline"
                  >
                    {refund.payment.razorpayPaymentId}
                  </Link>
                ) : (
                  '—'
                ),
                mono: true,
              },
              { label: 'Method', value: refund.payment?.method ?? '—' },
              {
                label: 'Card',
                value: refund.payment?.cardLast4 ? `····${refund.payment.cardLast4}` : '—',
              },
              {
                label: 'Captured amount',
                value: refund.payment ? formatPaise(refund.payment.capturedPaise) : '—',
              },
            ]}
          />
          <AdminDetailCard
            title="Order"
            rows={[
              {
                label: 'Order',
                value: refund.order?.id ? (
                  <Link
                    href={`/super-admin/billing/orders/${refund.order.id}`}
                    className="font-mono text-blue-600 hover:underline"
                  >
                    {refund.order.receiptNumber ?? refund.order.id.slice(-8)}
                  </Link>
                ) : (
                  '—'
                ),
                mono: true,
              },
              { label: 'Plan', value: refund.order?.plan?.name ?? '—' },
              {
                label: 'User',
                value: refund.order?.user?.email ? (
                  <Link
                    href={`/super-admin/billing/users/${refund.order.user.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {refund.order.user.email}
                  </Link>
                ) : (
                  '—'
                ),
              },
            ]}
          />
        </div>

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <ExternalLink size={16} /> Razorpay raw payload
          </h2>
          <pre
            data-lenis-prevent
            className="mt-4 max-h-96 overflow-auto rounded-lg bg-[var(--bg)] p-4 font-mono text-xs text-[var(--text)]"
          >
            {JSON.stringify(refund.raw ?? {}, null, 2)}
          </pre>
        </Card>
      </div>
    </DashboardLayout>
  );
}
