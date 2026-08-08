'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import Select from '@/components/ui/Select';
import Pagination from '@/components/ui/Pagination';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import {
  superAdminBillingService,
  type AdminRefundRow,
} from '@/services/super-admin-billing.service';
import { showToast } from '@/components/ui/Toast';
import { formatPaise } from '@/types/billing';

// Admins reach this page when granted 'billing.refunds.view'. The role gate must admit
// ADMIN or DashboardLayout redirects them to '/' before the permission
// gate ever runs.
const ROLE = ['ADMIN', 'SUPER_ADMIN'];

const REASONS = [
  'USER_REQUESTED',
  'ADMIN_INITIATED',
  'FRAUD',
  'DUPLICATE',
  'CHARGEBACK',
  'ERROR_CORRECTION',
  'GOODWILL',
];
const STATUS_TONE: Record<AdminRefundRow['status'], string> = {
  PENDING: 'bg-yellow-100 text-yellow-900',
  PROCESSED: 'bg-green-100 text-green-900',
  FAILED: 'bg-red-100 text-red-900',
  CANCELLED: 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
};

export default function SuperAdminRefunds() {
  const [items, setItems] = useState<AdminRefundRow[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(100);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Status filter — the backend has always accepted `status`; the UI never
  // sent it, so PENDING refunds could not be isolated.
  const [status, setStatus] = useState<AdminRefundRow['status'] | ''>('');
  const [showInitiate, setShowInitiate] = useState(false);
  const [initiating, setInitiating] = useState(false);
  const [form, setForm] = useState({
    razorpayPaymentId: '',
    amountPaiseStr: '',
    reason: 'USER_REQUESTED',
    notes: '',
    speed: 'normal' as 'normal' | 'optimum',
    bypassWindow: false,
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await superAdminBillingService.listRefundsAdmin({
        status: status || undefined,
        page,
        limit,
      });
      setItems(res.items);
      setTotal(res.total ?? 0);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load refunds');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page, limit]);

  async function initiate() {
    setInitiating(true);
    try {
      await superAdminBillingService.initiateRefund({
        razorpayPaymentId: form.razorpayPaymentId.trim() || undefined,
        amountPaise: form.amountPaiseStr ? parseInt(form.amountPaiseStr, 10) : undefined,
        reason: form.reason,
        notes: form.notes || undefined,
        speed: form.speed,
        bypassWindow: form.bypassWindow,
      });
      setShowInitiate(false);
      setForm({
        razorpayPaymentId: '',
        amountPaiseStr: '',
        reason: 'USER_REQUESTED',
        notes: '',
        speed: 'normal',
        bypassWindow: false,
      });
      await load();
    } catch (err) {
      showToast.error((err as Error).message ?? 'Refund initiation failed');
    } finally {
      setInitiating(false);
    }
  }

  return (
    <DashboardLayout requiredRole={ROLE} requiredPermission="billing.refunds.view">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <BillingNav active="refunds" />
        <div className="mt-6 mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text)]">Refunds</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Money already sent back. Customer-raised requests awaiting a decision live in the
              refund request queue.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div className="w-48">
              <label className="text-xs text-[var(--text-muted)]">Status</label>
              <Select
                value={status}
                onChange={(val) => {
                  setStatus((val ?? '') as AdminRefundRow['status'] | '');
                  setPage(1);
                }}
                options={[
                  { value: 'PENDING', label: 'pending' },
                  { value: 'PROCESSED', label: 'processed' },
                  { value: 'FAILED', label: 'failed' },
                  { value: 'CANCELLED', label: 'cancelled' },
                ]}
                placeholder="All statuses"
                className="mt-1 w-full"
              />
            </div>
            <Link href="/super-admin/billing/refund-requests">
              <Button variant="outline">Refund requests</Button>
            </Link>
            <Button variant="primary" onClick={() => setShowInitiate(true)}>
              <RefreshCw className="mr-2 h-4 w-4" /> Initiate refund
            </Button>
          </div>
        </div>

        {showInitiate && (
          <Card padding="lg" className="mb-4">
            <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Initiate refund</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs text-[var(--text-muted)]">Razorpay payment id</label>
                <input
                  type="text"
                  value={form.razorpayPaymentId}
                  onChange={(e) => setForm({ ...form, razorpayPaymentId: e.target.value })}
                  placeholder="pay_XXXXXXXXXXXX"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)]">
                  Amount (paise) — leave empty for full
                </label>
                <input
                  type="number"
                  value={form.amountPaiseStr}
                  onChange={(e) => setForm({ ...form, amountPaiseStr: e.target.value })}
                  placeholder="49900 = ₹499"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)]">Reason</label>
                <Select
                  value={form.reason}
                  onChange={(val) => setForm({ ...form, reason: val })}
                  options={REASONS.map((r) => ({
                    value: r,
                    label: r.replace(/_/g, ' ').toLowerCase(),
                  }))}
                  clearable={false}
                  className="mt-1 w-full"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)]">Speed</label>
                <Select
                  value={form.speed}
                  onChange={(val) => setForm({ ...form, speed: val as 'normal' | 'optimum' })}
                  options={[
                    { value: 'normal', label: 'normal (3-5 days, free)' },
                    { value: 'optimum', label: 'optimum (instant, fees apply)' },
                  ]}
                  clearable={false}
                  className="mt-1 w-full"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-[var(--text-muted)]">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.bypassWindow}
                  onChange={(e) => setForm({ ...form, bypassWindow: e.target.checked })}
                />
                <span>Bypass refund window (super-admin only)</span>
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                variant="primary"
                onClick={() => void initiate()}
                isLoading={initiating}
                disabled={!form.razorpayPaymentId.trim()}
              >
                Initiate
              </Button>
              <Button variant="outline" onClick={() => setShowInitiate(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        )}

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
                  <th className="py-2">Refund id</th>
                  <th className="py-2">Payment</th>
                  <th className="py-2">Reason</th>
                  <th className="py-2 text-right">Amount</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2.5 font-mono text-xs">
                      {/* The refund detail page was only reachable from order /
                          settlement / user pages — link it from the list too. */}
                      <Link
                        href={`/super-admin/billing/refunds/${r.id}`}
                        className="text-primary hover:underline"
                      >
                        {r.razorpayRefundId}
                      </Link>
                    </td>
                    <td className="py-2.5 font-mono text-xs">
                      {r.payment?.razorpayPaymentId ?? r.paymentId}
                    </td>
                    <td className="py-2.5 text-xs">{r.reason.replace(/_/g, ' ').toLowerCase()}</td>
                    <td className="py-2.5 text-right font-semibold">
                      {formatPaise(r.amountPaise)}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[r.status]}`}
                      >
                        {r.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="py-2.5 text-xs text-[var(--text-muted)]">
                      {new Date(r.createdAt).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && (
              <p className="py-8 text-center text-sm text-[var(--text-muted)]">No refunds yet.</p>
            )}
            <Pagination
              currentPage={page}
              totalPages={Math.ceil(total / limit)}
              onPageChange={setPage}
              totalItems={total}
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
