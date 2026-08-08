'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, ExternalLink, FileText, Receipt } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import StatusBadge from '@/components/super-admin/billing/StatusBadge';
import EmptyState from '@/components/super-admin/billing/EmptyState';
import Pagination from '@/components/super-admin/billing/Pagination';
import AdminFilterBar from '@/components/super-admin/billing/AdminFilterBar';
import { superAdminBillingService } from '@/services/super-admin-billing.service';
import { formatPaise } from '@/types/billing';
import type { OrderStatus } from '@/types/order';

const STATUS_OPTIONS: Array<{ label: string; value: OrderStatus | '' }> = [
  { label: 'All statuses', value: '' },
  { label: 'Created', value: 'CREATED' },
  { label: 'Attempted', value: 'ATTEMPTED' },
  { label: 'Paid', value: 'PAID' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Cancelled', value: 'CANCELLED' },
  { label: 'Expired', value: 'EXPIRED' },
  { label: 'Refund pending', value: 'REFUND_PENDING' },
  { label: 'Refunded', value: 'REFUNDED' },
  { label: 'Partially refunded', value: 'PARTIALLY_REFUNDED' },
  { label: 'Disputed', value: 'DISPUTED' },
  { label: 'Fraud flagged', value: 'FRAUD_FLAGGED' },
];

const PAGE_SIZE = 50;

interface AdminOrderRow {
  id: string;
  receiptNumber: string | null;
  razorpayOrderId: string | null;
  status: OrderStatus;
  totalPaise: number;
  currency: string;
  fraudScore: number | null;
  createdAt: string;
  paidAt: string | null;
  plan?: { code?: string; name?: string };
  user?: { id: string; email?: string; firstName?: string | null; lastName?: string | null };
}

export default function SuperAdminOrdersPage() {
  const [items, setItems] = useState<AdminOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 350ms search debounce
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    superAdminBillingService
      .listOrders({
        page,
        limit: pageSize,
        status: status || undefined,
        search: debounced.trim() || undefined,
      })
      .then((res) => {
        if (!active) return;
        setItems(res.items as unknown as AdminOrderRow[]);
        setTotal(res.total);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load orders');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, pageSize, status, debounced]);

  const exportCsv = useMemo(() => {
    const rows = [
      [
        'Receipt',
        'Razorpay ID',
        'User Email',
        'Plan',
        'Status',
        'Total',
        'Currency',
        'Created',
        'Paid',
      ],
      ...items.map((o) => [
        o.receiptNumber ?? o.id.slice(-8),
        o.razorpayOrderId ?? '',
        o.user?.email ?? '',
        o.plan?.name ?? '',
        o.status,
        (o.totalPaise / 100).toFixed(2),
        o.currency,
        o.createdAt,
        o.paidAt ?? '',
      ]),
    ];
    return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  }, [items]);

  const downloadCsv = () => {
    const blob = new Blob([exportCsv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-page-${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="billing.orders.view"
    >
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="orders" />

        <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">Orders</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Every Razorpay order placed on Hire Adda — search by receipt, Razorpay ID, or user
              email.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={items.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-secondary)] disabled:opacity-40"
          >
            <Download size={14} /> Export CSV (page)
          </button>
        </header>

        <Card padding="md">
          <AdminFilterBar
            search={{
              value: search,
              onChange: (v) => {
                setSearch(v);
                setPage(1);
              },
              placeholder: 'Search receipt / Razorpay ID / user email',
            }}
            filters={[
              {
                key: 'status',
                label: 'Status',
                value: status,
                options: STATUS_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
                onChange: (v) => {
                  setStatus(v as OrderStatus | '');
                  setPage(1);
                },
              },
            ]}
          />

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs tracking-wide text-[var(--text-secondary)] uppercase">
                  <th className="py-2.5 pr-3">Receipt</th>
                  <th className="py-2.5 pr-3">User</th>
                  <th className="py-2.5 pr-3">Plan</th>
                  <th className="py-2.5 pr-3 text-right">Amount</th>
                  <th className="py-2.5 pr-3">Status</th>
                  <th className="py-2.5 pr-3">Fraud</th>
                  <th className="py-2.5 pr-3">Created</th>
                  <th className="py-2.5 pr-3" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <Spinner />
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-sm text-red-600">
                      {error}
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-2">
                      <EmptyState
                        title="No orders match your filters"
                        description="Try clearing search or status filter."
                        icon={Receipt}
                      />
                    </td>
                  </tr>
                ) : (
                  items.map((o) => (
                    <tr
                      key={o.id}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-secondary)]"
                    >
                      <td className="py-2.5 pr-3 font-mono text-xs">
                        <Link
                          href={`/super-admin/billing/orders/${o.id}`}
                          className="text-[var(--text)] hover:text-blue-600 hover:underline"
                        >
                          {o.receiptNumber ?? o.id.slice(-8)}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3">
                        <p className="truncate text-[var(--text)]">{o.user?.email ?? '—'}</p>
                        {(o.user?.firstName || o.user?.lastName) && (
                          <p className="text-xs text-[var(--text-secondary)]">
                            {`${o.user.firstName ?? ''} ${o.user.lastName ?? ''}`.trim()}
                          </p>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-[var(--text)]">{o.plan?.name ?? '—'}</td>
                      <td className="py-2.5 pr-3 text-right font-semibold text-[var(--text)]">
                        {formatPaise(o.totalPaise, o.currency)}
                      </td>
                      <td className="py-2.5 pr-3">
                        <StatusBadge status={o.status} pretty />
                      </td>
                      <td className="py-2.5 pr-3">
                        {(o.fraudScore ?? 0) > 0 ? (
                          <StatusBadge
                            status={`Score ${o.fraudScore}`}
                            tone={(o.fraudScore ?? 0) >= 5 ? 'danger' : 'warning'}
                          />
                        ) : (
                          <span className="text-xs text-[var(--text-secondary)]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-[var(--text-secondary)]">
                        {new Date(o.createdAt).toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Link
                          href={`/super-admin/billing/orders/${o.id}`}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          View <ExternalLink size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && !error && items.length > 0 ? (
            <div className="mt-3">
              <Pagination
                page={page}
                pageSize={pageSize}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                total={total}
                onChange={(next) => setPage(next)}
              />
            </div>
          ) : null}
        </Card>
      </div>
    </DashboardLayout>
  );
}
