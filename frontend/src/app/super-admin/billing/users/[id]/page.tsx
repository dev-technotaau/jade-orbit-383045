'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  User as UserIcon,
  Receipt,
  Repeat,
  RotateCw,
  Banknote,
  ShieldAlert,
  Gift,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import BillingNav from '@/components/super-admin/billing/BillingNav';
import StatusBadge from '@/components/super-admin/billing/StatusBadge';
import AdminDetailCard from '@/components/super-admin/billing/AdminDetailCard';
import EmptyState from '@/components/super-admin/billing/EmptyState';
import { superAdminBillingService } from '@/services/super-admin-billing.service';
import type { AdminPlan } from '@/types/billing';
import { formatPaise } from '@/types/billing';

interface Summary {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    mobileNumber: string | null;
    isActive: boolean;
    isSuspended: boolean;
    createdAt: string;
  };
  orders: Array<{
    id: string;
    receiptNumber: string | null;
    status: string;
    totalPaise: number;
    currency: string;
    createdAt: string;
    plan?: { code: string; name: string };
  }>;
  subscriptions: Array<{
    id: string;
    razorpaySubscriptionId: string | null;
    status: string;
    autoRenew: boolean;
    nextChargeAt: string | null;
    paidCount: number;
    totalCount: number | null;
    plan?: { code: string; name: string };
  }>;
  refunds: Array<{
    id: string;
    razorpayRefundId: string;
    amountPaise: number;
    status: string;
    reason: string;
    createdAt: string;
  }>;
  ledger: Array<{
    id: string;
    type: string;
    amountPaise: number;
    currency: string;
    refType: string;
    refId: string;
    narration: string | null;
    createdAt: string;
  }>;
  fraudFlags: Array<{
    id: string;
    signal: string;
    severity: string;
    action: string;
    createdAt: string;
    reviewedAt: string | null;
  }>;
}

export default function SuperAdminUserBillingPage() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = (await superAdminBillingService.getUserBillingSummary(id)) as unknown as Summary;
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user billing');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) void reload();
  }, [id, reload]);

  if (loading) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="billing.orders.view"
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
        requiredPermission="billing.orders.view"
      >
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
          <BillingNav active="users" />
          <Card padding="lg">
            <p className="text-sm text-red-600">{error ?? 'User not found.'}</p>
            <Link
              href="/super-admin/billing/users"
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              ← Back
            </Link>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const userName = `${data.user.firstName ?? ''} ${data.user.lastName ?? ''}`.trim();
  const totalSpent = data.ledger
    .filter((l) => l.type === 'ORDER_CHARGE')
    .reduce((s, l) => s + l.amountPaise, 0);
  const totalRefunded = data.ledger
    .filter((l) => l.type === 'REFUND')
    .reduce((s, l) => s + l.amountPaise, 0);

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="billing.orders.view"
    >
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <BillingNav active="users" />

        <Link
          href="/super-admin/billing/users"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={14} /> User lookup
        </Link>

        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
                <UserIcon className="mr-2 inline" size={24} />
                {userName || data.user.email}
              </h1>
              <StatusBadge status={data.user.role} pretty />
              {data.user.isSuspended ? <StatusBadge status="SUSPENDED" tone="danger" /> : null}
              {!data.user.isActive ? <StatusBadge status="INACTIVE" tone="neutral" /> : null}
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {data.user.email} · Joined {new Date(data.user.createdAt).toLocaleDateString('en-IN')}
            </p>
          </div>
          <Button variant="primary" onClick={() => setGrantOpen(true)}>
            <Gift size={14} /> Grant plan manually
          </Button>
        </header>

        {actionMsg ? (
          <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-200">
            {actionMsg}
          </div>
        ) : null}

        <Card padding="lg">
          <h2 className="text-base font-semibold text-[var(--text)]">Lifetime billing</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Total spent</dt>
              <dd className="mt-1 text-2xl font-extrabold text-emerald-700">
                {formatPaise(totalSpent)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Total refunded</dt>
              <dd className="mt-1 text-2xl font-extrabold text-red-700">
                {formatPaise(totalRefunded)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Net</dt>
              <dd className="mt-1 text-2xl font-extrabold">
                {formatPaise(totalSpent - totalRefunded)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)] uppercase">Orders</dt>
              <dd className="mt-1 text-2xl font-extrabold">{data.orders.length}</dd>
            </div>
          </dl>
        </Card>

        {data.fraudFlags.length > 0 ? (
          <Card padding="lg">
            <h2 className="flex items-center gap-2 text-base font-semibold text-red-700">
              <ShieldAlert size={16} /> Fraud history ({data.fraudFlags.length})
            </h2>
            <ul className="mt-3 space-y-2">
              {data.fraudFlags.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50/50 p-3 text-sm dark:bg-red-900/10"
                >
                  <div>
                    <span className="font-mono text-xs">{f.signal}</span>
                    <span className="ml-3 text-xs text-[var(--text-secondary)]">
                      {new Date(f.createdAt).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={f.severity} pretty />
                    <StatusBadge status={f.action} pretty />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <Receipt size={16} /> Recent orders ({data.orders.length})
          </h2>
          {data.orders.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No orders" />
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--border)]">
              {data.orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link
                      href={`/super-admin/billing/orders/${o.id}`}
                      className="font-mono text-xs text-blue-600 hover:underline"
                    >
                      {o.receiptNumber ?? o.id.slice(-8)}
                    </Link>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {o.plan?.name ?? '—'} · {new Date(o.createdAt).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-semibold">{formatPaise(o.totalPaise, o.currency)}</span>
                    <StatusBadge status={o.status} pretty />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <Repeat size={16} /> Subscriptions ({data.subscriptions.length})
          </h2>
          {data.subscriptions.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No subscriptions" />
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--border)]">
              {data.subscriptions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link
                      href={`/super-admin/billing/subscriptions/${s.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {s.plan?.name ?? '—'}
                    </Link>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {s.paidCount}
                      {s.totalCount ? ` / ${s.totalCount}` : ' / ∞'} cycles ·{' '}
                      {s.autoRenew ? 'auto-renew on' : 'auto-renew off'}
                    </p>
                  </div>
                  <StatusBadge status={s.status} pretty />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <RotateCw size={16} /> Refunds ({data.refunds.length})
          </h2>
          {data.refunds.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No refunds" />
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--border)]">
              {data.refunds.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link
                      href={`/super-admin/billing/refunds/${r.id}`}
                      className="font-mono text-xs text-blue-600 hover:underline"
                    >
                      {r.razorpayRefundId}
                    </Link>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {r.reason} · {new Date(r.createdAt).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-semibold">{formatPaise(r.amountPaise)}</span>
                    <StatusBadge status={r.status} pretty />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="lg">
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
            <Banknote size={16} /> Money ledger ({data.ledger.length})
          </h2>
          {data.ledger.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No ledger entries" />
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)] uppercase">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Reference</th>
                    <th className="py-2 pr-3">Narration</th>
                    <th className="py-2 pr-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ledger.map((l) => (
                    <tr key={l.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2 pr-3 text-xs text-[var(--text-secondary)]">
                        {new Date(l.createdAt).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-2 pr-3 text-xs">{l.type.replace(/_/g, ' ')}</td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {l.refType}/{l.refId.slice(-8)}
                      </td>
                      <td className="py-2 pr-3 text-xs text-[var(--text-secondary)]">
                        {l.narration ?? '—'}
                      </td>
                      <td
                        className={`py-2 pr-3 text-right text-sm font-medium ${l.type === 'REFUND' ? 'text-red-700' : 'text-emerald-700'}`}
                      >
                        {l.type === 'REFUND' ? '−' : ''}
                        {formatPaise(l.amountPaise, l.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <AdminDetailCard
          title="User"
          rows={[
            { label: 'User ID', value: data.user.id, mono: true },
            { label: 'Email', value: data.user.email },
            { label: 'Mobile', value: data.user.mobileNumber ?? '—' },
            { label: 'Role', value: data.user.role },
            { label: 'Status', value: data.user.isActive ? 'Active' : 'Inactive' },
            {
              label: 'Joined',
              value: new Date(data.user.createdAt).toLocaleDateString('en-IN', {
                dateStyle: 'long',
              }),
            },
          ]}
        />
      </div>

      <GrantPlanModal
        userId={id}
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        onGranted={(msg) => {
          setActionMsg(msg);
          void reload();
        }}
      />
    </DashboardLayout>
  );
}

function GrantPlanModal({
  userId,
  open,
  onClose,
  onGranted,
}: {
  userId: string;
  open: boolean;
  onClose: () => void;
  onGranted: (msg: string) => void;
}) {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [planId, setPlanId] = useState('');
  const [validityDays, setValidityDays] = useState(30);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || plans.length > 0) return;
    setLoadingPlans(true);
    superAdminBillingService
      .listPlansAdmin({ includeArchived: false })
      .then((p) => setPlans(p.filter((x) => x.status === 'ACTIVE')))
      .finally(() => setLoadingPlans(false));
  }, [open, plans.length]);

  const submit = async () => {
    if (!planId) {
      setError('Pick a plan');
      return;
    }
    if (notes.trim().length < 5) {
      setError('Notes must be at least 5 characters (audit trail)');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await superAdminBillingService.grantPlanToUser(userId, {
        planId,
        validityDays,
        notes: notes.trim(),
      });
      onGranted('Plan granted manually. Entitlement is now active for this user.');
      setPlanId('');
      setNotes('');
      setValidityDays(30);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Grant failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={submitting ? () => {} : onClose}
      title="Grant a plan to this user"
      size="md"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={submitting || !planId}>
            {submitting ? <Spinner /> : 'Grant plan'}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-[var(--text-secondary)]">
        Manually grant a plan as a bonus or promotional entitlement. The user will be notified and
        the action is logged to the audit trail with your notes.
      </p>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium tracking-wide text-[var(--text-secondary)] uppercase">
            Plan
          </span>
          {loadingPlans ? (
            <Spinner />
          ) : (
            <Select
              value={planId}
              onChange={(val) => setPlanId(val)}
              options={plans.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
              placeholder="— Pick a plan —"
              searchable
              clearable={false}
              className="w-full"
            />
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium tracking-wide text-[var(--text-secondary)] uppercase">
            Validity (days)
          </span>
          <input
            type="number"
            min={1}
            max={3650}
            value={validityDays}
            onChange={(e) => setValidityDays(Number(e.target.value))}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium tracking-wide text-[var(--text-secondary)] uppercase">
            Notes (audit trail) <span className="text-red-500">*</span>
          </span>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Customer complaint goodwill, won contest, partner perk…"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
            maxLength={500}
          />
        </label>

        {error ? (
          <p className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
