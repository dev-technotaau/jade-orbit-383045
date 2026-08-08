'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShieldAlert, Calendar, AlertTriangle } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import StatusBadge from '@/components/super-admin/billing/StatusBadge';
import AdminDetailCard from '@/components/super-admin/billing/AdminDetailCard';
import api from '@/lib/api';
import { formatPaise } from '@/types/billing';

interface AdminDisputeDetail {
  id: string;
  razorpayDisputeId: string;
  paymentId: string;
  status: string;
  reasonCode: string | null;
  reasonDescription: string | null;
  amountPaise: number;
  dueByAt: string | null;
  createdAt: string;
  updatedAt: string;
  raw: Record<string, unknown> | null;
  payment?: {
    id: string;
    razorpayPaymentId: string;
    method: string;
    amountPaise: number;
    cardLast4: string | null;
    order?: {
      id: string;
      receiptNumber: string | null;
      plan?: { code: string; name: string };
      user?: { id: string; email: string };
    };
  };
}

export default function SuperAdminDisputeDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [data, setData] = useState<AdminDisputeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get<{ data: AdminDisputeDetail }>(`/super-admin/billing/disputes/${encodeURIComponent(id)}`)
      .then((res) => {
        if (active) setData(res.data?.data);
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
        requiredPermission="billing.disputes.view"
      >
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </DashboardLayout>
    );
  }
  if (error || !data) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.disputes.view"
      >
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
          <BillingNav active="disputes" />
          <Card padding="lg">
            <p className="text-sm text-red-600">{error ?? 'Dispute not found.'}</p>
            <Link
              href="/super-admin/billing/disputes"
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              ← Back
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const dueDays = data.dueByAt
    ? // eslint-disable-next-line react-hooks/purity
      Math.round((new Date(data.dueByAt).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="billing.disputes.view"
    >
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="disputes" />

        <Link
          href="/super-admin/billing/disputes"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={14} /> All disputes
        </Link>

        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
                <ShieldAlert className="mr-2 inline" size={24} />
                Dispute {data.razorpayDisputeId.slice(-12)}
              </h1>
              <StatusBadge status={data.status} pretty />
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Opened {new Date(data.createdAt).toLocaleString('en-IN')}
              {data.dueByAt
                ? ` · Respond by ${new Date(data.dueByAt).toLocaleDateString('en-IN', { dateStyle: 'long' })}`
                : ''}
            </p>
          </div>
        </header>

        {dueDays !== null && dueDays >= 0 && data.status === 'OPEN' ? (
          <div
            className={`flex items-start gap-3 rounded-lg border-l-4 p-4 ${
              dueDays <= 3
                ? 'border-red-500 bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-200'
                : 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200'
            }`}
          >
            <Calendar className="mt-0.5 flex-shrink-0" size={18} />
            <div>
              <p className="font-semibold">
                {dueDays === 0
                  ? 'Response due TODAY'
                  : `${dueDays} day${dueDays === 1 ? '' : 's'} to respond`}
              </p>
              <p className="mt-1 text-sm">
                Submit evidence via the Razorpay dashboard before the deadline; missing it forfeits
                the chargeback automatically.
              </p>
            </div>
          </div>
        ) : null}

        <Card padding="lg">
          <h2 className="text-base font-semibold text-[var(--text)]">Dispute</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Disputed amount</dt>
              <dd className="mt-1 text-2xl font-extrabold">{formatPaise(data.amountPaise)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Reason code</dt>
              <dd className="mt-1 text-sm font-medium">{data.reasonCode ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Status</dt>
              <dd className="mt-1">
                <StatusBadge status={data.status} pretty />
              </dd>
            </div>
          </dl>
          {data.reasonDescription ? (
            <div className="mt-4 rounded-lg bg-[var(--bg)] p-3 text-sm text-[var(--text)]">
              <strong>Customer claim:</strong> {data.reasonDescription}
            </div>
          ) : null}
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AdminDetailCard
            title="Disputed payment"
            rows={[
              {
                label: 'Razorpay ID',
                value: data.payment ? (
                  <Link
                    href={`/super-admin/billing/transactions/${data.payment.id}`}
                    className="font-mono text-blue-600 hover:underline"
                  >
                    {data.payment.razorpayPaymentId}
                  </Link>
                ) : (
                  '—'
                ),
                mono: true,
              },
              { label: 'Method', value: data.payment?.method ?? '—' },
              {
                label: 'Card',
                value: data.payment?.cardLast4 ? `····${data.payment.cardLast4}` : '—',
              },
              {
                label: 'Captured amount',
                value: data.payment ? formatPaise(data.payment.amountPaise) : '—',
              },
            ]}
          />
          <AdminDetailCard
            title="Order"
            rows={[
              {
                label: 'Order',
                value: data.payment?.order?.id ? (
                  <Link
                    href={`/super-admin/billing/orders/${data.payment.order.id}`}
                    className="font-mono text-blue-600 hover:underline"
                  >
                    {data.payment.order.receiptNumber ?? data.payment.order.id.slice(-8)}
                  </Link>
                ) : (
                  '—'
                ),
                mono: true,
              },
              { label: 'Plan', value: data.payment?.order?.plan?.name ?? '—' },
              {
                label: 'Customer',
                value: data.payment?.order?.user?.email ? (
                  <Link
                    href={`/super-admin/billing/users/${data.payment.order.user.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {data.payment.order.user.email}
                  </Link>
                ) : (
                  '—'
                ),
              },
            ]}
          />
        </div>

        <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 dark:bg-amber-900/20">
          <p className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 flex-shrink-0" size={16} />
            <span>
              Hire Adda doesn&apos;t auto-respond to chargebacks. Submit evidence via Razorpay
              dashboard → Disputes →{' '}
              <a
                href={`https://dashboard.razorpay.com/app/disputes/${data.razorpayDisputeId}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {data.razorpayDisputeId}
              </a>
              .
            </span>
          </p>
        </div>

        <Card padding="lg">
          <h2 className="text-base font-semibold text-[var(--text)]">Razorpay raw payload</h2>
          <pre
            data-lenis-prevent
            className="mt-4 max-h-96 overflow-auto rounded-lg bg-[var(--bg)] p-4 font-mono text-xs text-[var(--text)]"
          >
            {JSON.stringify(data.raw ?? {}, null, 2)}
          </pre>
        </Card>
      </div>
    </DashboardLayout>
  );
}
