'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Banknote, Receipt, RotateCw } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import StatusBadge from '@/components/super-admin/billing/StatusBadge';
import AdminDetailCard from '@/components/super-admin/billing/AdminDetailCard';
import EmptyState from '@/components/super-admin/billing/EmptyState';
import { superAdminBillingService } from '@/services/super-admin-billing.service';
import { formatPaise } from '@/types/billing';

interface AdminSettlementDetail {
  id: string;
  razorpaySettlementId: string;
  settledOnDate: string;
  amountPaise: number;
  feesPaise: number;
  taxPaise: number;
  netPaise: number;
  utr: string | null;
  status: string;
  createdAt: string;
  raw: Record<string, unknown> | null;
  transactions?: Array<{
    id: string;
    type: string;
    amountPaise: number;
    paymentId: string | null;
    refundId: string | null;
    payment?: { razorpayPaymentId: string; method: string };
    refund?: { razorpayRefundId: string; reason: string };
  }>;
}

export default function SuperAdminSettlementDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [data, setData] = useState<AdminSettlementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    superAdminBillingService
      .getSettlementAdmin(id)
      .then((d) => {
        if (active) setData(d as unknown as AdminSettlementDetail);
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
        requiredPermission="billing.settlements.view"
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
        requiredPermission="billing.settlements.view"
      >
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
          <BillingNav active="settlements" />
          <Card padding="lg">
            <p className="text-sm text-red-600">{error ?? 'Settlement not found.'}</p>
            <Link
              href="/super-admin/billing/settlements"
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
      requiredPermission="billing.settlements.view"
    >
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="settlements" />

        <Link
          href="/super-admin/billing/settlements"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={14} /> All settlements
        </Link>

        <header>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
              Settlement {data.razorpaySettlementId.slice(-10)}
            </h1>
            <StatusBadge status={data.status} pretty />
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Settled on{' '}
            {new Date(data.settledOnDate).toLocaleDateString('en-IN', { dateStyle: 'long' })}
          </p>
        </header>

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <Banknote size={16} /> Money breakdown
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Gross amount</dt>
              <dd className="mt-1 text-lg font-semibold">{formatPaise(data.amountPaise)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Razorpay fees</dt>
              <dd className="mt-1 text-lg font-semibold text-red-700">
                − {formatPaise(data.feesPaise)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Tax on fees</dt>
              <dd className="mt-1 text-lg font-semibold text-red-700">
                − {formatPaise(data.taxPaise)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Net to bank</dt>
              <dd className="mt-1 text-2xl font-extrabold text-emerald-700">
                {formatPaise(data.netPaise)}
              </dd>
            </div>
          </dl>
        </Card>

        <AdminDetailCard
          title="Settlement metadata"
          rows={[
            { label: 'Razorpay ID', value: data.razorpaySettlementId, mono: true },
            { label: 'UTR (bank ref)', value: data.utr ?? '—', mono: true },
            { label: 'Status', value: <StatusBadge status={data.status} pretty /> },
            { label: 'Synced at', value: new Date(data.createdAt).toLocaleString('en-IN') },
          ]}
        />

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <Receipt size={16} /> Transactions in this settlement ({data.transactions?.length ?? 0})
          </h2>
          {!data.transactions || data.transactions.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No transaction breakdown available"
                description="Razorpay returns settlement transactions via the reports API; if empty, the daily sync hasn't fetched them yet."
                icon={Receipt}
              />
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)] uppercase">
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Reference</th>
                    <th className="py-2 pr-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((t) => (
                    <tr key={t.id} className="border-b border-[var(--border)]">
                      <td className="py-2 pr-3">
                        <StatusBadge
                          status={t.type}
                          tone={t.type === 'REFUND' ? 'warning' : 'success'}
                          pretty
                        />
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {t.payment ? (
                          <Link
                            href={`/super-admin/billing/transactions/${t.paymentId}`}
                            className="text-blue-600 hover:underline"
                          >
                            {t.payment.razorpayPaymentId}
                          </Link>
                        ) : t.refund ? (
                          <Link
                            href={`/super-admin/billing/refunds/${t.refundId}`}
                            className="text-blue-600 hover:underline"
                          >
                            {t.refund.razorpayRefundId}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right font-medium">
                        {t.type === 'REFUND' ? '−' : ''}
                        {formatPaise(t.amountPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <RotateCw size={16} /> Razorpay raw payload
          </h2>
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
