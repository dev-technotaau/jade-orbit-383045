'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Archive } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';
import Tooltip from '@/components/ui/Tooltip';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import Pagination from '@/components/ui/Pagination';
import {
  superAdminBillingService,
  type AdminCoupon,
  type CouponStatus,
} from '@/services/super-admin-billing.service';
import { confirmDialog } from '@/components/ui/dialog-service';
import { showToast } from '@/components/ui/Toast';
import { formatPaise } from '@/types/billing';

// Admins reach this page when granted 'billing.coupons.view'. The role gate must admit
// ADMIN or DashboardLayout redirects them to '/' before the permission
// gate ever runs.
const ROLE = ['ADMIN', 'SUPER_ADMIN'];

const TONE: Record<CouponStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-900',
  PAUSED: 'bg-yellow-100 text-yellow-900',
  EXPIRED: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
  ARCHIVED: 'bg-red-100 text-red-900',
};

export default function SuperAdminCoupons() {
  const [items, setItems] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CouponStatus | ''>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await superAdminBillingService.listCouponsAdmin({
        status: (status || undefined) as CouponStatus | undefined,
        search: search.trim() || undefined,
        page,
        limit,
      });
      setItems(res.items);
      setTotal(res.total ?? 0);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load coupons');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [search, status, page, limit]);

  const totalPages = Math.ceil(total / limit);

  async function archive(id: string) {
    if (
      !(await confirmDialog({
        title: 'Archive coupon',
        message: 'Archive this coupon? Existing redemptions stay intact.',
        confirmLabel: 'Archive',
        variant: 'danger',
      }))
    )
      return;
    try {
      await superAdminBillingService.archiveCouponAdmin(id);
      await load();
    } catch (err) {
      showToast.error((err as Error).message ?? 'Archive failed');
    }
  }

  return (
    <DashboardLayout requiredRole={ROLE} requiredPermission="billing.coupons.view">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <BillingNav active="coupons" />
        <div className="mt-6 mb-4 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-[var(--text)]">Coupons</h1>
          <Link href="/super-admin/billing/coupons/new">
            <Button variant="primary">
              <Plus className="mr-2 h-4 w-4" /> Create coupon
            </Button>
          </Link>
        </div>

        <Card padding="md" className="mb-4">
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[180px] flex-1">
              <label className="text-xs text-[var(--text-muted)]">Search code/name</label>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="coupon-status" className="text-xs text-[var(--text-muted)]">
                Status
              </label>
              <Select
                id="coupon-status"
                value={status}
                onChange={(val) => {
                  setStatus(val as CouponStatus | '');
                  setPage(1);
                }}
                options={[
                  { value: '', label: 'All' },
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'PAUSED', label: 'Paused' },
                  { value: 'EXPIRED', label: 'Expired' },
                  { value: 'ARCHIVED', label: 'Archived' },
                ]}
                clearable={false}
                className="mt-1 w-44"
              />
            </div>
          </div>
        </Card>

        {loading && (
          <Card padding="lg" className="flex items-center justify-center">
            <Spinner />
          </Card>
        )}
        {error && (
          <Card padding="lg">
            <p className="text-sm text-[var(--error)]">{error}</p>
          </Card>
        )}
        {!loading && !error && (
          <Card padding="md">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)] uppercase">
                <tr>
                  <th className="py-2">Code</th>
                  <th className="py-2">Name</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Value</th>
                  <th className="py-2">Used / Cap</th>
                  <th className="py-2">Window</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5 font-mono text-xs">{c.code}</td>
                    <td className="py-2.5">{c.name}</td>
                    <td className="py-2.5 text-xs">{c.type.toLowerCase()}</td>
                    <td className="py-2.5 text-xs">
                      {c.type === 'PERCENT'
                        ? `${c.valuePercent}%${c.maxDiscountPaise ? ` (cap ${formatPaise(c.maxDiscountPaise)})` : ''}`
                        : c.type === 'FLAT'
                          ? formatPaise(c.valuePaise ?? 0)
                          : c.type === 'TRIAL_EXTEND'
                            ? `+${c.trialExtendDays}d trial`
                            : c.type.toLowerCase()}
                    </td>
                    <td className="py-2.5 text-xs">
                      {c.redemptionsCount}
                      {c.maxRedemptions !== null ? ` / ${c.maxRedemptions}` : ''}
                    </td>
                    <td className="py-2.5 text-xs text-[var(--text-muted)]">
                      {c.startsAt ? new Date(c.startsAt).toLocaleDateString('en-IN') : '—'}
                      {' → '}
                      {c.endsAt ? new Date(c.endsAt).toLocaleDateString('en-IN') : '∞'}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONE[c.status]}`}
                      >
                        {c.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="py-2.5">
                      {c.status !== 'ARCHIVED' && (
                        <Tooltip content="Archive">
                          <button
                            type="button"
                            onClick={() => void archive(c.id)}
                            className="text-xs text-red-700 hover:underline"
                            aria-label="Archive"
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                        </Tooltip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--text-muted)]">
                No coupons match these filters.
              </p>
            )}
            {total > 0 && (
              <div className="mt-4 border-t border-[var(--border)] pt-4">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  totalItems={total}
                  pageSize={limit}
                  onPageSizeChange={(s) => {
                    setLimit(s);
                    setPage(1);
                  }}
                />
              </div>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
