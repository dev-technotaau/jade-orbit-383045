'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Repeat } from 'lucide-react';
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

const STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Created', value: 'CREATED' },
  { label: 'Authenticated', value: 'AUTHENTICATED' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Paused', value: 'PAUSED' },
  { label: 'Halted', value: 'HALTED' },
  { label: 'Cancelled', value: 'CANCELLED' },
  { label: 'Pending cancel', value: 'PENDING_CANCEL' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Expired', value: 'EXPIRED' },
];

const PAGE_SIZE = 50;

interface AdminSubscriptionRow {
  id: string;
  razorpaySubscriptionId: string | null;
  status: string;
  autoRenew: boolean;
  cancelAtCycleEnd: boolean;
  totalCount: number | null;
  paidCount: number;
  remainingCount: number | null;
  nextChargeAt: string | null;
  currentEnd: string | null;
  createdAt: string;
  plan?: { code?: string; name?: string };
  user?: { id: string; email?: string; firstName?: string | null; lastName?: string | null };
  mandate?: {
    id: string;
    status: string;
    method: string;
    cardLast4: string | null;
    vpa: string | null;
  } | null;
  planSnapshot?: { basePricePaise?: number; currency?: string } | null;
}

export default function SuperAdminSubscriptionsPage() {
  const [items, setItems] = useState<AdminSubscriptionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);
  const [status, setStatus] = useState('');
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
    superAdminBillingService
      .listSubscriptions({
        page,
        limit: pageSize,
        status: status || undefined,
      })
      .then((res) => {
        if (!active) return;
        // Client-side email/id search to avoid backend extra param
        const q = debounced.trim().toLowerCase();
        const filtered = q
          ? (res.items as unknown as AdminSubscriptionRow[]).filter(
              (s) =>
                s.user?.email?.toLowerCase().includes(q) ||
                s.razorpaySubscriptionId?.toLowerCase().includes(q),
            )
          : (res.items as unknown as AdminSubscriptionRow[]);
        setItems(filtered);
        setTotal(res.total);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load subscriptions');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, pageSize, status, debounced]);

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="billing.subscriptions.view"
    >
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="subscriptions" />

        <header>
          <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">Subscriptions</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            All recurring plans (Vendor Connect + auto-renew customers) with mandate health.
          </p>
        </header>

        <Card padding="md">
          <AdminFilterBar
            search={{
              value: search,
              onChange: (v) => {
                setSearch(v);
                setPage(1);
              },
              placeholder: 'Search Razorpay subscription ID or user email',
            }}
            filters={[
              {
                key: 'status',
                label: 'Status',
                value: status,
                options: STATUS_OPTIONS,
                onChange: (v) => {
                  setStatus(v);
                  setPage(1);
                },
              },
            ]}
          />

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs tracking-wide text-[var(--text-secondary)] uppercase">
                  <th className="py-2.5 pr-3">User</th>
                  <th className="py-2.5 pr-3">Plan</th>
                  <th className="py-2.5 pr-3 text-right">Price</th>
                  <th className="py-2.5 pr-3">Status</th>
                  <th className="py-2.5 pr-3">Auto-renew</th>
                  <th className="py-2.5 pr-3">Cycles</th>
                  <th className="py-2.5 pr-3">Next charge</th>
                  <th className="py-2.5 pr-3">Mandate</th>
                  <th className="py-2.5 pr-3" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center">
                      <Spinner />
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-sm text-red-600">
                      {error}
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-2">
                      <EmptyState title="No subscriptions match your filters" icon={Repeat} />
                    </td>
                  </tr>
                ) : (
                  items.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-secondary)]"
                    >
                      <td className="py-2.5 pr-3">
                        <p className="truncate text-[var(--text)]">{s.user?.email ?? '—'}</p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {`${s.user?.firstName ?? ''} ${s.user?.lastName ?? ''}`.trim() || '—'}
                        </p>
                      </td>
                      <td className="py-2.5 pr-3">{s.plan?.name ?? '—'}</td>
                      <td className="py-2.5 pr-3 text-right font-semibold">
                        {s.planSnapshot?.basePricePaise
                          ? formatPaise(s.planSnapshot.basePricePaise, s.planSnapshot.currency)
                          : '—'}
                      </td>
                      <td className="py-2.5 pr-3">
                        <StatusBadge status={s.status} pretty />
                      </td>
                      <td className="py-2.5 pr-3 text-xs">
                        {s.cancelAtCycleEnd ? (
                          <span className="text-amber-700">Cancel scheduled</span>
                        ) : s.autoRenew ? (
                          <span className="text-emerald-700">On</span>
                        ) : (
                          <span className="text-[var(--text-secondary)]">Off</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-[var(--text-secondary)]">
                        {s.paidCount}
                        {s.totalCount ? ` / ${s.totalCount}` : ' / ∞'}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-[var(--text-secondary)]">
                        {s.nextChargeAt
                          ? new Date(s.nextChargeAt).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-xs">
                        {s.mandate ? (
                          <span className="inline-flex items-center gap-1.5">
                            <StatusBadge status={s.mandate.status} pretty />
                            <span className="text-[var(--text-secondary)]">
                              {s.mandate.cardLast4
                                ? `····${s.mandate.cardLast4}`
                                : (s.mandate.vpa ?? s.mandate.method)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[var(--text-secondary)]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Link
                          href={`/super-admin/billing/subscriptions/${s.id}`}
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
