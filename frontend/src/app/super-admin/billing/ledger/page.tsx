'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Banknote, Download, Plus, Minus } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import EmptyState from '@/components/super-admin/billing/EmptyState';
import Pagination from '@/components/super-admin/billing/Pagination';
import AdminFilterBar from '@/components/super-admin/billing/AdminFilterBar';
import MetricCard from '@/components/super-admin/billing/MetricCard';
import { superAdminBillingService } from '@/services/super-admin-billing.service';
import { formatPaise } from '@/types/billing';

const PAGE_SIZE = 100;

const TYPE_OPTIONS = [
  { label: 'All entries', value: '' },
  { label: 'Order charge', value: 'ORDER_CHARGE' },
  { label: 'Refund', value: 'REFUND' },
  { label: 'Coupon discount', value: 'COUPON_DISCOUNT' },
  { label: 'Carry forward', value: 'CARRY_FORWARD' },
  { label: 'Manual credit', value: 'MANUAL_CREDIT' },
  { label: 'Manual debit', value: 'MANUAL_DEBIT' },
  { label: 'Tax', value: 'TAX' },
  { label: 'Adjustment', value: 'ADJUSTMENT' },
];

interface LedgerRow {
  id: string;
  userId: string;
  type: string;
  amountPaise: number;
  currency: string;
  refType: string;
  refId: string;
  narration: string | null;
  createdAt: string;
  user?: { email: string };
}

const NEGATIVE_TYPES = new Set(['REFUND', 'COUPON_DISCOUNT', 'MANUAL_DEBIT']);

export default function SuperAdminLedgerPage() {
  const [items, setItems] = useState<LedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const [type, setType] = useState('');
  const [userId, setUserId] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    setUserId(uuidRe.test(debounced.trim()) ? debounced.trim() : '');
    superAdminBillingService
      .listLedger({
        page,
        limit: pageSize,
        type: type || undefined,
        userId: uuidRe.test(debounced.trim()) ? debounced.trim() : undefined,
      })
      .then((res) => {
        if (!active) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load ledger');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, pageSize, type, debounced]);

  const totals = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const l of items) {
      if (NEGATIVE_TYPES.has(l.type)) outflow += l.amountPaise;
      else inflow += l.amountPaise;
    }
    return { inflow, outflow, net: inflow - outflow };
  }, [items]);

  const downloadCsv = () => {
    const rows = [
      ['Date', 'User', 'Type', 'Amount', 'Currency', 'Ref', 'Narration'],
      ...items.map((l) => [
        l.createdAt,
        l.user?.email ?? l.userId,
        l.type,
        (((NEGATIVE_TYPES.has(l.type) ? -1 : 1) * l.amountPaise) / 100).toFixed(2),
        l.currency,
        `${l.refType}/${l.refId}`,
        l.narration ?? '',
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger-page-${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="billing.ledger.view"
    >
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="ledger" />

        <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
              <Banknote className="mr-2 inline" size={24} /> Money ledger
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Every credit/debit at user-grain — orders, refunds, coupon discounts, manual
              adjustments, tax. Source-of-truth for finance reporting.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={items.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--bg-secondary)] disabled:opacity-40"
          >
            <Download size={14} /> Export page
          </button>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard
            label="Inflow (this page)"
            value={formatPaise(totals.inflow)}
            intent="positive"
          />
          <MetricCard
            label="Outflow (this page)"
            value={formatPaise(totals.outflow)}
            intent="negative"
          />
          <MetricCard
            label="Net (this page)"
            value={formatPaise(totals.net)}
            intent={totals.net >= 0 ? 'positive' : 'negative'}
          />
        </div>

        <Card padding="md">
          <AdminFilterBar
            search={{
              value: search,
              onChange: (v) => {
                setSearch(v);
                setPage(1);
              },
              placeholder: 'Filter by user UUID',
            }}
            filters={[
              {
                key: 'type',
                label: 'Type',
                value: type,
                options: TYPE_OPTIONS,
                onChange: (v) => {
                  setType(v);
                  setPage(1);
                },
              },
            ]}
          />

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)] uppercase">
                  <th className="py-2.5 pr-3">Date</th>
                  <th className="py-2.5 pr-3">User</th>
                  <th className="py-2.5 pr-3">Type</th>
                  <th className="py-2.5 pr-3">Reference</th>
                  <th className="py-2.5 pr-3">Narration</th>
                  <th className="py-2.5 pr-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <Spinner />
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-red-600">
                      {error}
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-2">
                      <EmptyState title="No ledger entries match your filters" icon={Banknote} />
                    </td>
                  </tr>
                ) : (
                  items.map((l) => {
                    const isNegative = NEGATIVE_TYPES.has(l.type);
                    return (
                      <tr
                        key={l.id}
                        className="border-b border-[var(--border)] hover:bg-[var(--bg-secondary)]"
                      >
                        <td className="py-2 pr-3 text-xs text-[var(--text-secondary)]">
                          {new Date(l.createdAt).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 pr-3 text-xs">
                          <Link
                            href={`/super-admin/billing/users/${l.userId}`}
                            className="text-blue-600 hover:underline"
                          >
                            {l.user?.email ?? l.userId.slice(-8)}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 text-xs">
                          <span className="inline-flex items-center gap-1">
                            {isNegative ? (
                              <Minus size={10} className="text-red-600" />
                            ) : (
                              <Plus size={10} className="text-emerald-600" />
                            )}
                            {l.type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs">
                          {l.refType}/{l.refId.slice(-8)}
                        </td>
                        <td className="py-2 pr-3 text-xs text-[var(--text-secondary)]">
                          {l.narration ?? '—'}
                        </td>
                        <td
                          className={`py-2 pr-3 text-right text-sm font-medium ${
                            isNegative ? 'text-red-700' : 'text-emerald-700'
                          }`}
                        >
                          {isNegative ? '−' : '+'}
                          {formatPaise(l.amountPaise, l.currency)}
                        </td>
                      </tr>
                    );
                  })
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
