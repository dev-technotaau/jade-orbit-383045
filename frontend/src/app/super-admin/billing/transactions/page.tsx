'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import Select from '@/components/ui/Select';
import Pagination from '@/components/ui/Pagination';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import {
  superAdminBillingService,
  type AdminPaymentRow,
  type PaymentStatus,
  type PaymentMethod,
} from '@/services/super-admin-billing.service';
import { formatPaise } from '@/types/billing';

// Admins reach this page when granted 'billing.transactions.view'. The role gate must admit
// ADMIN or DashboardLayout redirects them to '/' before the permission
// gate ever runs.
const ROLE = ['ADMIN', 'SUPER_ADMIN'];

const STATUS_TONE: Record<PaymentStatus, string> = {
  CREATED: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  AUTHORIZED: 'bg-yellow-100 text-yellow-900',
  CAPTURED: 'bg-green-100 text-green-900',
  FAILED: 'bg-red-100 text-red-900',
  REFUNDED: 'bg-blue-100 text-blue-900',
  PARTIALLY_REFUNDED: 'bg-blue-100 text-blue-900',
};

const METHODS: PaymentMethod[] = [
  'CARD',
  'UPI',
  'NETBANKING',
  'WALLET',
  'EMI',
  'PAYLATER',
  'BANK_TRANSFER',
  'INTERNATIONAL',
  'UNKNOWN',
];
const STATUSES: PaymentStatus[] = [
  'CREATED',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
];

export default function SuperAdminTransactions() {
  const [data, setData] = useState<{
    items: AdminPaymentRow[];
    total: number;
    page: number;
    limit: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    superAdminBillingService
      .listTransactions({
        page,
        limit,
        status: (status || undefined) as PaymentStatus | undefined,
        method: (method || undefined) as PaymentMethod | undefined,
        search: search.trim() || undefined,
      })
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err?.message ?? 'Failed to load transactions');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, limit, status, method, search]);

  return (
    <DashboardLayout requiredRole={ROLE} requiredPermission="billing.transactions.view">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <BillingNav active="transactions" />
        <h1 className="mt-6 mb-4 text-3xl font-bold text-[var(--text)]">Transactions</h1>

        <Card padding="md">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <label className="text-xs text-[var(--text-muted)]">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Razorpay payment id or order receipt"
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">Status</label>
              <Select
                value={status}
                onChange={(val) => {
                  setStatus(val as PaymentStatus | '');
                  setPage(1);
                }}
                options={[
                  { value: '', label: 'All' },
                  ...STATUSES.map((s) => ({ value: s, label: s.toLowerCase() })),
                ]}
                clearable={false}
                size="sm"
                className="mt-1 w-44"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">Method</label>
              <Select
                value={method}
                onChange={(val) => {
                  setMethod(val as PaymentMethod | '');
                  setPage(1);
                }}
                options={[
                  { value: '', label: 'All' },
                  ...METHODS.map((m) => ({ value: m, label: m.toLowerCase() })),
                ]}
                clearable={false}
                size="sm"
                className="mt-1 w-44"
              />
            </div>
          </div>
        </Card>

        {loading && (
          <Card padding="lg" className="mt-4 flex items-center justify-center">
            <Spinner />
          </Card>
        )}
        {error && (
          <Card padding="lg" className="mt-4">
            <p className="text-sm text-[var(--error)]">{error}</p>
          </Card>
        )}
        {!loading && !error && data && (
          <Card padding="md" className="mt-4">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)] uppercase">
                <tr>
                  <th className="py-2">Payment</th>
                  <th className="py-2">Order</th>
                  <th className="py-2">User</th>
                  <th className="py-2">Method</th>
                  <th className="py-2 text-right">Amount</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5 font-mono text-xs">{p.razorpayPaymentId}</td>
                    <td className="py-2.5 text-xs">
                      {p.order?.receiptNumber ?? '—'}
                      {p.order?.plan && (
                        <span className="ml-2 text-[var(--text-muted)]">{p.order.plan.code}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-xs">{p.user?.email ?? '—'}</td>
                    <td className="py-2.5">
                      {p.method.toLowerCase()}
                      {p.cardLast4 && (
                        <span className="ml-1 text-xs text-[var(--text-muted)]">
                          ••{p.cardLast4}
                        </span>
                      )}
                      {p.vpa && (
                        <span className="ml-1 text-xs text-[var(--text-muted)]">{p.vpa}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right font-semibold">
                      {formatPaise(p.amountPaise, p.currency)}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[p.status]}`}
                      >
                        {p.status === 'CAPTURED' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : p.status === 'FAILED' ? (
                          <XCircle className="h-3 w-3" />
                        ) : p.status === 'REFUNDED' ? (
                          <RefreshCw className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                        {p.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="py-2.5 text-xs text-[var(--text-muted)]">
                      {new Date(p.createdAt).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.items.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--text-muted)]">
                No transactions match these filters.
              </p>
            )}
            <Pagination
              currentPage={page}
              totalPages={Math.ceil(data.total / limit)}
              onPageChange={setPage}
              totalItems={data.total}
              pageSize={limit}
              onPageSizeChange={(s) => {
                setLimit(s);
                setPage(1);
              }}
              className="mt-4"
            />
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
